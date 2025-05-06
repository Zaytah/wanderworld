// terrain.js

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
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

        // create geometry
        let planeGeometry = new THREE.PlaneGeometry(size.x, size.z, params.res, params.res);
        planeGeometry.rotateX(-Math.PI / 2);

        // chunk's world offset
        const chunkOffsetX = this.chunkX * this.chunkSize;
        const chunkOffsetZ = this.chunkZ * this.chunkSize;

        // physics
        const vertices = planeGeometry.attributes.position; 
        const worldVertices = new Float32Array(vertices.count * 3); // for rapier trimesh

        for (let i = 0; i < vertices.count; i++) {

            const localX = vertices.getX(i);
            const localZ = vertices.getZ(i);

            // world position
            const wx = localX + chunkOffsetX;
            const wz = localZ + chunkOffsetZ;

            const y = fbm(wx, wz) * 5;
            vertices.setY(i, y);

            // Store the final absolute world position for physics collider
            worldVertices[i * 3 + 0] = wx;
            worldVertices[i * 3 + 1] = y;
            worldVertices[i * 3 + 2] = wz;
        }

        vertices.needsUpdate = true; 
        planeGeometry.computeVertexNormals();

        // create visual mesh
        this.plane = new THREE.Mesh(
            planeGeometry,
            new THREE.MeshStandardMaterial({
                wireframe: false,
                side: THREE.FrontSide,
                map: grassTexture,
                color: new THREE.Color(1.2, 1.5, 1.2)
            })
        );

        // set the visual meshs position
        this.plane.position.set(chunkOffsetX, 0, chunkOffsetZ);


        // Physics Collider
        if (!planeGeometry.index) {
            console.error("Cannot create trimesh collider.");
            return;
        }

        const indices = new Uint32Array(planeGeometry.index.array);
        const colliderDesc = RAPIER.ColliderDesc.trimesh(worldVertices, indices);

        // create collider and attach to the universal static body 
        this.collider = this.world.createCollider(colliderDesc, this.staticBody.handle);
    }

    // Add visual mesh to the Three.js group
    addChunk() {
        this.group.add(this.plane);
    }

    // Remove the collider when the chunk is destroyed
    removeCollider() {
        if (this.collider) {
            this.world.removeCollider(this.collider, false); // false = don't wake interacting bodies immediately
            this.collider = null;
        }
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

        // Static body for ALL terrain meshes
        this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

        const playerPos = params.player.getPosition();
        const currentChunkX = Math.floor(playerPos.x / this.chunkSize);
        const currentChunkZ = Math.floor(playerPos.z / this.chunkSize);

        // Initial chunk generation
        for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
            for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
                let cx = currentChunkX + dx;
                let cz = currentChunkZ + dz;
                this.ensureChunkExists(cx, cz);
            }
        }
        params.scene.add(this.group); // Add chunk meshes group to the scene
    }

    ensureChunkExists(cx, cz) {
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
                player: this.player
            });

            this.chunks.set(key, chunk);
            chunk.addChunk(); // Adds the visual mesh to scene
        }
    }


    update() {
        const playerPos = this.player.getPosition();
        const currentChunkX = Math.floor(playerPos.x / this.chunkSize);
        const currentChunkZ = Math.floor(playerPos.z / this.chunkSize);

        const neededChunks = new Set();

        // 
        for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
            for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
                let cx = currentChunkX + dx;
                let cz = currentChunkZ + dz;
                neededChunks.add(this.getChunkKey(cx, cz));
            }
        }

        // Add missing chunks
        for (const key of neededChunks) {
            if (!this.chunks.has(key)) {
                 // Parse key back to cx, cz to generate
                 const [cxStr, czStr] = key.split(',');
                 const cx = parseInt(cxStr, 10);
                 const cz = parseInt(czStr, 10);
                 this.ensureChunkExists(cx, cz);
            }
        }

        // Remove unnecessary chunks
        const keysToRemove = [];
        for (let key of this.chunks.keys()) {
            if (!neededChunks.has(key)) {
                const chunk = this.chunks.get(key);
                this.group.remove(chunk.plane);
                chunk.removeCollider();
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            this.chunks.delete(key);
        }
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }
}