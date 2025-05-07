// terrain.js

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Water } from 'three/examples/jsm/objects/Water.js';
import terrainVertexShader from './shaders/terrainVertexShader.glsl';
import terrainFragShader from './shaders/terrainFragShader.glsl';
import { BIOME_ID } from './noise.js';

const RESOLUTION = 64;
const CHUNK_SIZE = 128; // better performance to increase this than render distance
const MAX_CHUNKS_PER_FRAME = 1;

const loader = new THREE.TextureLoader();
let grassTexture = null;
let rockTexture = null;
let snowTexture = null;
let sandTexture = null;
let waterNormalsMap = null;

export class TerrainChunk {
    constructor(params, chunkData) {
        this.group = params.group;
        this.world = params.world;
        this.staticBody = params.staticBody;
        this.chunkX = chunkData.chunkX;
        this.chunkZ = chunkData.chunkZ;
        this.chunkSize = params.chunkSize;
        this.plane = null;
        this.collider = null;
        this.water = null;
        this.sunDirection = null;
        this.lights = params.lights;

        this._Init(params, chunkData);
    }

    _Init(params, chunkData) {
        const { positions, indices, worldVertices, uvs, normals, biomes } = chunkData;

        const planeGeometry = new THREE.BufferGeometry();
        planeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        planeGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        planeGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        planeGeometry.setAttribute('biome', new THREE.BufferAttribute(biomes, 1));
        planeGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

        if (!grassTexture) {
            // console.log(`Grass texture is NULL for chunk ${this.chunkX},${this.chunkZ}`);
        }

        // Create visual mesh
        const material = new THREE.MeshStandardMaterial({
            side: THREE.FrontSide,
            map: grassTexture,
            color: new THREE.Color(1.2, 1.2, 1.2)
        });

        const ambientColor = this.lights.hemisphere ? this.lights.hemisphere.color.clone() : new THREE.Color(0x404040);
        const dirLightColor = this.lights.directional ? this.lights.directional.color.clone() : new THREE.Color(0xffffff);
        // Calculate direction TO the light source (assuming light position points FROM origin)
        const dirLightDir = this.lights.directional ? this.lights.directional.position.clone().normalize() : new THREE.Vector3(0, 1, 0);

        const shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                grassTexture: { value: grassTexture },
                    rockTexture: { value: rockTexture },
                    snowTexture: { value: snowTexture },
                    sandTexture: { value: sandTexture },

                    ambientLightColor: { value: ambientColor },
                    directionalLightDirection: { value: dirLightDir },
                    directionalLightColor: { value: dirLightColor }
            },
            vertexShader: terrainVertexShader,
            fragmentShader: terrainFragShader,
            side: THREE.FrontSide

        });

        this.plane = new THREE.Mesh(planeGeometry, material);
        this.plane.receiveShadow = true;
        this.plane.castShadow = false;

        const chunkOffsetX = this.chunkX * this.chunkSize;
        const chunkOffsetZ = this.chunkZ * this.chunkSize;
        this.plane.position.set(chunkOffsetX, 0, chunkOffsetZ);

        // Water
        let hasWater = false;
        const WATER_LEVEL = 0.5;
        let minHeightInChunk = Infinity;
        for (let i = 1; i < positions.length; i+=3) {
            minHeightInChunk = Math.min(minHeightInChunk, positions[i]);
        }
        if (minHeightInChunk < WATER_LEVEL) {
            hasWater = true;
            let waterGeometry = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize);

            if (!waterNormalsMap) console.error("Water normals texture not loaded.");

            this.water = new Water(
                waterGeometry,
                {
                    textureWidth: 128,
                    textureHeight: 128,
                    waterNormals: waterNormalsMap,
                    sunDirection: this.sunDirection ? this.sunDirection.clone() : new THREE.Vector3(0,1,0),
                    sunColor: 0xffffff,
                    waterColor: 0x001e0f,
                    distortionScale: 3.7,
                    //fog: this.scene.fog !== undefined // Use scene fog if available
                }
            );

            this.water.rotation.x = - Math.PI / 2;
            this.water.position.set(chunkOffsetX, WATER_LEVEL - 0.05, chunkOffsetZ);

            this.water.receiveShadow = true;
            this.water.castShadow = false;
        }

        // Physics
        const colliderDesc = RAPIER.ColliderDesc.trimesh(worldVertices, indices);
        this.collider = this.world.createCollider(colliderDesc, this.staticBody.handle);
    }

    addChunk() {
        if (this.plane) this.group.add(this.plane);
        // if (this.water) this.group.add(this.water);
    }

    // weird behavior without this sometimes
    free() {
        if (this.collider) {
            this.world.removeCollider(this.collider, false);
            this.collider = null;
        }
        if (this.plane) {
            this.group.remove(this.plane);
            this.plane.geometry.dispose();
            if (this.plane.material && typeof this.plane.material.dispose === 'function') {
                this.plane.material.dispose();
            }
            this.plane = null;
        }
        if (this.water) {
            this.group.remove(this.water);
            this.water.geometry.dispose();
            if (this.water.material && typeof this.water.material.dispose === 'function') {
                this.water.material.dispose();
            }
            this.water = null;
        }
    }
}


export class ChunkManager {
    constructor(params) {
        this.chunkSize = CHUNK_SIZE;
        this.renderDistance = 4;
        this.resolution = RESOLUTION;
        this.chunks = new Map();
        this.pendingChunks = new Set();
        this.worker = null;
        this.group = new THREE.Group();
        this.player = params.player;
        this.world = params.world;
        this.scene = params.scene;
        this.staticBody = null;
        this.textures = params.textures;
        this.isInitialized = false;
        this.lastPlayerChunkX = null;
        this.lastPlayerChunkZ = null;
        this.lights = params.lights;

        // queues for staggering (optimization)
        this.creationQueue = []; // holds chunkData received from worker
        this.destructionQueue = []; // holds chunk keys to be destroyed

        this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
        if (this.scene) this.scene.add(this.group);
    }

    async initialize() {
        if (this.isInitialized) return;

        console.log("ChunkManager: Initializing.");

        try {
            const texturePaths = [
                './public/assets/grass_with_rocks_01_1k/grass_with_rocks_01_color_1k.png', // grass
                './public/assets/ground_with_rocks_03_1k/ground_with_rocks_03_color_1k.png', // rock
                './public/assets/sand_04_1k/sand_04_color_1k.png', // sand
                './public/assets/snow_01_1k/snow_01_color_1k.png', // snow
                './public/assets/simple-ocean-normal-map.jpeg' // water
            ]

            const texturePromises = texturePaths.map(path => {
                console.log(`Attempting to load: ${path}`);
                return loader.loadAsync(path).catch(err => {
                    console.error(`Failed to load texture: ${path}`, err);
                    return null;
                });
            });

            const loadedTextures = await Promise.all(texturePromises);
            
            loadedTextures.forEach((tex, index) => {
                if(tex) {
                    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                    tex.repeat.set(16, 16);
                    tex.colorSpace = THREE.SRGBColorSpace;
                    tex.anisotropy = 4;
                    tex.needsUpdate = true;
                 }
            });
            
           grassTexture = loadedTextures[0];
           rockTexture = loadedTextures[1];
           snowTexture = loadedTextures[2];
           sandTexture = loadedTextures[3];
           waterNormalsMap = loadedTextures[4];

            // Web Worker
            console.log("ChunkManager: Initializing terrain worker.");
            this.worker = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });

            this.worker.onmessage = (event) => {
                if (!this.isInitialized) return;
                const chunkData = event.data;
                const key = this.getChunkKey(chunkData.chunkX, chunkData.chunkZ);

                // Add received data to creation queue 
                if (this.pendingChunks.has(key)) {
                    this.creationQueue.push(chunkData);
                }
            };

            this.worker.onerror = (error) => {
                console.error("ChunkManager: Error in terrain worker:", error.message, error);
                this.isInitialized = false;
                if (this.worker) {
                    this.worker.terminate();
                    this.worker = null;
                }
            };
            console.log("ChunkManager: Terrain worker initialized.");

            // worker is ready to receive requests
            this.isInitialized = true;
            this.checkForNeededChunks(true);

            console.log("ChunkManager: Initialization complete.");

        } catch (error) {
            console.error("ChunkManager: Initialization failed:", error);
            this.isInitialized = false;
            if (this.worker) {
                this.worker.terminate();
                this.worker = null;
            }
            throw error;
        }
    }


    requestChunkGeneration(cx, cz) {
        if (!this.worker || !this.isInitialized) return;

        const key = this.getChunkKey(cx, cz);
        const isInCreationQueue = this.creationQueue.some(data => data.chunkX === cx && data.chunkZ === cz);
        if (!this.chunks.has(key) && !this.pendingChunks.has(key) && !isInCreationQueue) {
            this.pendingChunks.add(key);
            this.worker.postMessage({
                chunkSize: this.chunkSize,
                chunkX: cx,
                chunkZ: cz,
                res: this.resolution
            });
        }
    }

    // checks which chunks are needed/unneeded
    checkForNeededChunks(forceImmediate = false) {
         if (!this.isInitialized) return;

         const playerPos = this.player.getPosition();
         if (!playerPos) return;

         const currentChunkX = Math.floor(playerPos.x / this.chunkSize);
         const currentChunkZ = Math.floor(playerPos.z / this.chunkSize);

         if (!forceImmediate && this.lastPlayerChunkX === currentChunkX && this.lastPlayerChunkZ === currentChunkZ) {
             return;
         }
         this.lastPlayerChunkX = currentChunkX;
         this.lastPlayerChunkZ = currentChunkZ;

         const neededChunks = new Set();
         for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
             for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
                 neededChunks.add(this.getChunkKey(currentChunkX + dx, currentChunkZ + dz));
             }
         }

         // request missing chunks
         for (const key of neededChunks) {
             if (!this.chunks.has(key)) {
                  const [cxStr, czStr] = key.split(',');
                  this.requestChunkGeneration(parseInt(cxStr, 10), parseInt(czStr, 10));
             }
         }

         // queue unnecessary chunks for destruction
         for (let key of this.chunks.keys()) {
             if (!neededChunks.has(key)) {
                 if (!this.destructionQueue.includes(key)) {
                     this.destructionQueue.push(key);
                 }
             }
         }

         // cancel pending generation for chunks that are no longer needed
         const pendingToRemove = [];
         for (let key of this.pendingChunks) {
              if (!neededChunks.has(key)) {
                  const queueIndex = this.creationQueue.findIndex(data => this.getChunkKey(data.chunkX, data.chunkZ) === key);
                  if (queueIndex !== -1) {
                      this.creationQueue.splice(queueIndex, 1);
                  }
                  pendingToRemove.push(key);
              }
         }
          for (const key of pendingToRemove) {
              this.pendingChunks.delete(key);
          }
    }

    processQueues() {
        if (!this.isInitialized) return;

        // process creation queue
        let createdCount = 0;
        while (this.creationQueue.length > 0 && createdCount < MAX_CHUNKS_PER_FRAME) {
            const chunkData = this.creationQueue.shift();
            const key = this.getChunkKey(chunkData.chunkX, chunkData.chunkZ);

            if (this.pendingChunks.has(key) && !this.chunks.has(key) && !this.destructionQueue.includes(key)) {
                const chunk = new TerrainChunk({
                    group: this.group,
                    world: this.world,
                    staticBody: this.staticBody,
                    chunkSize: this.chunkSize,
                    lights: this.lights
                }, chunkData);

                this.chunks.set(key, chunk);
                chunk.addChunk();
                this.pendingChunks.delete(key);
                createdCount++;
            } else {
                 if (this.pendingChunks.has(key)) {
                     this.pendingChunks.delete(key);
                 }
            }
        }

        // process destruction queue
        let destroyedCount = 0;
        while (this.destructionQueue.length > 0 && destroyedCount < MAX_CHUNKS_PER_FRAME) {
            const key = this.destructionQueue.shift();
            const chunk = this.chunks.get(key);
            if (chunk) {
                chunk.free();
                this.chunks.delete(key);
                destroyedCount++;
            }
        }
    }

    update() {
        if (this.isInitialized) {
            this.checkForNeededChunks();
            this.processQueues();
        }
    }

    setTexture(textureName, texture) {
        this.textures[textureName] = texture;
    }


    getChunkKey(x, z) {
        return `${x},${z}`;
    }

    // weird behavior without this sometimes
    free() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        for (let chunk of this.chunks.values()) {
             chunk.destroy();
        }
        this.chunks.clear();
        this.pendingChunks.clear();
        this.creationQueue = [];
        this.destructionQueue = [];
        if(this.group.parent) {
            this.group.parent.remove(this.group);
        }
        this.isInitialized = false;
    }
}
