import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat'
import { fbm } from './noise.js';

const RESOLUTION = 64;
const CHUNK_SIZE = 32;

const loader = new THREE.TextureLoader();

export class TerrainChunk {
    constructor(params) {
        this.group = params.group;
        this.world = params.world;
        this.staticBody = params.staticBody; // single static body for all terrain
        this.chunkX = params.chunkX;  
        this.chunkZ = params.chunkZ;       
        this.chunkSize = params.chunkSize;
        this._Init(params);
    }

    _Init(params) {
        const size = new THREE.Vector3(params.chunkSize, 0, params.chunkSize);

        let grassTexture = loader.load('./public/assets/Vol_42_1/Vol_42_1_Base_Color.png');
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(5, 5);

        let planeGeometry = new THREE.PlaneGeometry(size.x, size.z, params.res, params.res);
        planeGeometry.rotateX(-Math.PI / 2);
        this.plane = new THREE.Mesh(
            planeGeometry,
            new THREE.MeshStandardMaterial({
                wireframe: false,
                color: 0xFFFFFF,
                side: THREE.FrontSide,
                map: grassTexture,
                color: new THREE.Color(1.2, 1.5, 1.2)
            }));

        const vertices = this.plane.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i) + size.x * params.chunkX;
            const z = vertices.getZ(i) + size.z * params.chunkZ;
            const y = fbm(x, z) * 5;
            vertices.setY(i, y);
        }

        vertices.needsUpdate = true;
        this.plane.geometry.computeVertexNormals();

        /* ===== Physics Colliders =====
        let positions = new Float32Array(vertices.array);
        let indices = new Float32Array(this.plane.geometry.index.array);
        const colliderDesc = RAPIER.ColliderDesc.trimesh(positions, indices);
        this.collider = this.world.createCollider(colliderDesc, this.staticBody.handle);
        */    

        const colliderDesc = this.manager.generateColliderFromGeometry(this.plane.geometry, params.chunkX, params.chunkZ );
        // attach it to the shared static body
        this.collider = this.world.createCollider(colliderDesc, this.staticBody.handle);


    }

    // add to group for the current scene
    addChunk() {
        this.group.add(this.plane);
    }
}

export class ChunkManager {
    constructor(params) {
        this.chunkSize = CHUNK_SIZE;
        this.renderDistance = 4;
        this.resolution = RESOLUTION; // # of 'intermediate' lines for each chunk
        this._Init(params);
    }

    _Init(params) {
        this.chunks = new Map();
        this.group = new THREE.Group();
        this.player = params.player;
        this.world = params.world;
        this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

        const playerPos = params.player.getPosition();
        const currentChunkX = Math.floor(playerPos.x / this.chunkSize);
        const currentChunkZ = Math.floor(playerPos.z / this.chunkSize);

        for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
            for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
                let cx = currentChunkX + dx;
                let cz = currentChunkZ + dz;
                let key = this.getChunkKey(cx, cz);
        
                if (!this.chunks.has(key)) {
                    let chunk = new TerrainChunk({
                        chunkSize: this.chunkSize,
                        chunkX: cx,
                        chunkZ: cz,
                        res: this.resolution,
                        group: this.group,
                        world: this.world,
                        staticBody: this.staticBody,
                        player: this.player,
                        chunkManager: this
                    });
                    chunk.plane.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
                    this.chunks.set(key, chunk);
                    chunk.addChunk();
                }
            }
        }
        params.scene.add(this.group);
    }

    update() {
        const playerPos = this.player.getPosition();
        const currentChunkX = Math.floor(playerPos.x / this.chunkSize);
        const currentChunkZ = Math.floor(playerPos.z / this.chunkSize);

        const unneededChunks = new Set();

        for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
            for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
                let cx = currentChunkX + dx;
                let cz = currentChunkZ + dz;
                let key = this.getChunkKey(cx, cz);
                unneededChunks.add(key);

                // generate missing chunks 
                if (!this.chunks.has(key)) {
                    let chunk = new TerrainChunk({
                        chunkSize: this.chunkSize,
                        chunkX: cx,
                        chunkZ: cz,
                        res: this.resolution,
                        group: this.group,
                        world: this.world,
                        staticBody: this.staticBody,
                        player: this.player,
                        chunkManager: this
                    });
                    chunk.plane.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
                    this.chunks.set(key, chunk);
                    chunk.addChunk();
                }
            }
        }

        // delete unnecessary chunks
        for (let key of this.chunks.keys()) {
            if (!unneededChunks.has(key)) {
                const chunk = this.chunks.get(key);
                this.group.remove(chunk.plane);
                this.chunks.delete(key);
            }
        }

    }

    generateColliderFromGeometry(geometry, chunkX, chunkZ) {
        const vertices = geometry.attributes.position;
        const indices = geometry.index;
    
        const offsetX = chunkX * this.chunkSize;
        const offsetZ = chunkZ * this.chunkSize;
    
        const positions = new Float32Array(vertices.count * 3);
    
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i) + offsetX;
            const y = vertices.getY(i);
            const z = vertices.getZ(i) + offsetZ;
    
            positions[i * 3 + 0] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }
    
        const indexArray = new Float32Array(indices.array);
        return RAPIER.ColliderDesc.trimesh(positions, indexArray);
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }
}
