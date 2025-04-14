import * as THREE from 'three';
import { fbm } from './noise.js';

export class TerrainChunk {
    constructor(params) {
        this.group = params.group;
        this._Init(params);
    }

    _Init(params) {
        const size = new THREE.Vector3(params.chunkSize, 0, params.chunkSize);
        let planeGeometry = new THREE.PlaneGeometry(size.x, size.z, params.res, params.res);
        planeGeometry.rotateX(-Math.PI / 2);
        this.plane = new THREE.Mesh(
            planeGeometry,
            new THREE.MeshStandardMaterial({
                wireframe: true,
                color: 0xFFFFFF,
                side: THREE.DoubleSide,
                //vertexColors: THREE.VertexColors
            }));
    
        const vertices = this.plane.geometry.attributes.position;
        /* would need to lerp height(y) between chunks next to each other where rand is different */
        // let rand = Math.floor(Math.random() * 10) + 1;
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i) + size.x * params.chunkX;
            const z = vertices.getZ(i) + size.z * params.chunkZ;
            const y = fbm(x, z) * 5;
            vertices.setY(i, y);
        }

        vertices.needsUpdate = true;
        this.plane.geometry.computeVertexNormals();
        
    }

    addChunk() {
        this.group.add(this.plane);
    }
}

export class ChunkManager {
    constructor(params) {
        this.chunkSize = 32;
        this.renderDistance = 4;
        this.resolution = 64; // # of 'intermediate' lines for each chunk
        this._Init(params);
    }

    _Init(params) {
        this.chunks = new Map();
        this.group = new THREE.Group();
        this.player = params.player;

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
                        group: this.group
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
                        group: this.group
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

    // too basic/not implemented well enough to be used rn
    getLODResolution(dx, dz) { 
        let dist = Math.max(Math.abs(dx), Math.abs(dz));
        if (dist <= 1) return 128;
        if (dist <= 2) return 64;
        return 32;
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }
}