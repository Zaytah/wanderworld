// terrain.js

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const RESOLUTION = 64;
const CHUNK_SIZE = 128; // better performance to increase this than render distance
const MAX_CHUNKS_PER_FRAME = 1;

const loader = new THREE.TextureLoader();
let grassTexture = null;

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

        this._Init(params, chunkData);
    }

    _Init(params, chunkData) {
        const { positions, indices, worldVertices, uvs, normals } = chunkData;

        const planeGeometry = new THREE.BufferGeometry();
        planeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        planeGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        planeGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        planeGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

        if (!grassTexture) {
            // console.log(`Grass texture is NULL for chunk ${this.chunkX},${this.chunkZ}`);
        }

        // Create visual mesh
        const material = new THREE.MeshStandardMaterial({
            side: THREE.FrontSide,
            map: grassTexture,
            color: new THREE.Color(1.2, 1.5, 1.2)
        });

        this.plane = new THREE.Mesh(planeGeometry, material);
        this.plane.receiveShadow = true;
        this.plane.castShadow = false;

        const chunkOffsetX = this.chunkX * this.chunkSize;
        const chunkOffsetZ = this.chunkZ * this.chunkSize;
        this.plane.position.set(chunkOffsetX, 0, chunkOffsetZ);

        // Physics
        const colliderDesc = RAPIER.ColliderDesc.trimesh(worldVertices, indices);
        this.collider = this.world.createCollider(colliderDesc, this.staticBody.handle);
    }

    addChunk() {
        if (this.plane) this.group.add(this.plane);
    }

    destroy() {
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
            grassTexture = await loader.loadAsync('./public/assets/Vol_42_1/Vol_42_1_Base_Color.png');
            grassTexture.wrapS = THREE.RepeatWrapping;
            grassTexture.wrapT = THREE.RepeatWrapping;
            grassTexture.repeat.set(5, 5);
            grassTexture.colorSpace = THREE.SRGBColorSpace;
            grassTexture.anisotropy = 4;
            grassTexture.needsUpdate = true;
            console.log("ChunkManager: Grass texture loaded successfully.");

            // Web Worker
            console.log("ChunkManager: Initializing terrain worker.");
            this.worker = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });

            this.worker.onmessage = (event) => {
                if (!this.isInitialized) return;
                const chunkData = event.data;
                const key = this.getChunkKey(chunkData.chunkX, chunkData.chunkZ);

                // Add received data to creation queue instead of creating immediately
                if (this.pendingChunks.has(key)) {
                    this.creationQueue.push(chunkData);
                } else {
                     // console.log(`Worker finished chunk ${key}, but it's no longer needed.`);
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
        // Request only if not loaded and not already pending OR queued for creation
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

    // Checks which chunks are needed/unneeded and queues requests/destruction
    checkForNeededChunks(forceImmediate = false) {
         if (!this.isInitialized) return;

         const playerPos = this.player.getPosition();
         if (!playerPos) return;

         const currentChunkX = Math.floor(playerPos.x / this.chunkSize);
         const currentChunkZ = Math.floor(playerPos.z / this.chunkSize);

         // Throttle update check
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

         // Request missing chunks
         for (const key of neededChunks) {
             if (!this.chunks.has(key)) {
                  const [cxStr, czStr] = key.split(',');
                  this.requestChunkGeneration(parseInt(cxStr, 10), parseInt(czStr, 10));
             }
         }

         // Queue unnecessary chunks for destruction
         for (let key of this.chunks.keys()) {
             if (!neededChunks.has(key)) {
                 if (!this.destructionQueue.includes(key)) {
                     this.destructionQueue.push(key);
                 }
             }
         }

         // Cancel pending generation for chunks that are no longer needed
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

    // Processes the queues each frame
    processQueues() {
        if (!this.isInitialized) return;

        // Process Creation Queue
        let createdCount = 0;
        while (this.creationQueue.length > 0 && createdCount < MAX_CHUNKS_PER_FRAME) {
            const chunkData = this.creationQueue.shift();
            const key = this.getChunkKey(chunkData.chunkX, chunkData.chunkZ);

            // Double-check if still needed and not already created/destroyed
            if (this.pendingChunks.has(key) && !this.chunks.has(key) && !this.destructionQueue.includes(key)) {
                const chunk = new TerrainChunk({
                    group: this.group,
                    world: this.world,
                    staticBody: this.staticBody,
                    chunkSize: this.chunkSize,
                }, chunkData);

                this.chunks.set(key, chunk);
                chunk.addChunk();
                this.pendingChunks.delete(key); // Remove from pending now it's created
                createdCount++;
            } else {
                 if (this.pendingChunks.has(key)) {
                     this.pendingChunks.delete(key); // Ensure removed from pending if skipped
                 }
            }
        }

        // Process Destruction Queue
        let destroyedCount = 0;
        while (this.destructionQueue.length > 0 && destroyedCount < MAX_CHUNKS_PER_FRAME) {
            const key = this.destructionQueue.shift();
            const chunk = this.chunks.get(key);
            if (chunk) {
                chunk.destroy();
                this.chunks.delete(key);
                destroyedCount++;
            }
        }
    }


    // Main update loop calls this
    update() {
        if (this.isInitialized) {
            this.checkForNeededChunks(); // Check if player moved, queue requests/destructions
            this.processQueues();       // Process a limited number of creations/destructions
        }
    }

    // ... (getChunkKey, setTexture, dispose methods remain the same) ...
    setTexture(textureName, texture) {
        this.textures[textureName] = texture;
    }
    getChunkKey(x, z) {
        return `${x},${z}`;
    }
    dispose() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            console.log("Terrain worker terminated.");
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
