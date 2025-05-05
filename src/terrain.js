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
        this.staticBody = params.staticBody; // The single static body for all terrain
        this.chunkX = params.chunkX;         // Store for reference
        this.chunkZ = params.chunkZ;         // Store for reference
        this.chunkSize = params.chunkSize;   // Store for reference
        this._Init(params);
    }

    _Init(params) {
        const size = new THREE.Vector3(params.chunkSize, 0, params.chunkSize);
        // this.scale is defined but not used on the mesh/geometry, be aware if you intended to use it.

        let grassTexture = loader.load('./public/assets/Vol_42_1/Vol_42_1_Base_Color.png');
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(5, 5);

        // 1. Create geometry
        let planeGeometry = new THREE.PlaneGeometry(size.x, size.z, params.res, params.res);
        planeGeometry.rotateX(-Math.PI / 2); // Make it horizontal

        // Get chunk's world offset
        const chunkOffsetX = this.chunkX * this.chunkSize;
        const chunkOffsetZ = this.chunkZ * this.chunkSize;

        // 2. Modify vertices for height AND prepare world-space vertices for physics
        const vertices = planeGeometry.attributes.position; // Reference to geometry's vertex buffer
        const worldVertices = new Float32Array(vertices.count * 3); // New array for Rapier collider (world space)

        for (let i = 0; i < vertices.count; i++) {
            // Get local vertex position (relative to the chunk's center before height)
            const localX = vertices.getX(i);
            const localZ = vertices.getZ(i);

            // Calculate absolute world position for noise sampling
            const worldX_forNoise = localX + chunkOffsetX;
            const worldZ_forNoise = localZ + chunkOffsetZ;

            // Calculate height based on world position
            const y = fbm(worldX_forNoise, worldZ_forNoise) * 5; // Adjust multiplier as needed

            // Set height in the geometry's local coordinates (visual mesh)
            vertices.setY(i, y);

            // Store the final *absolute world* position for the physics collider
            // We add the chunk offsets here because the Rapier collider is attached
            // to a single static body assumed to be at the world origin (0,0,0).
            worldVertices[i * 3 + 0] = localX + chunkOffsetX;
            worldVertices[i * 3 + 1] = y; // The calculated height
            worldVertices[i * 3 + 2] = localZ + chunkOffsetZ;
        }

        vertices.needsUpdate = true; // IMPORTANT: Tell Three.js the vertex buffer changed
        planeGeometry.computeVertexNormals(); // Recalculate normals for correct lighting

        // 3. Create the visual mesh using the modified geometry
        this.plane = new THREE.Mesh(
            planeGeometry,
            new THREE.MeshStandardMaterial({
                wireframe: false,
                side: THREE.FrontSide,
                map: grassTexture,
                color: new THREE.Color(1.2, 1.5, 1.2) // Multiplies map color (acts as a tint)
            })
        );

        // 4. IMPORTANT: Set the visual mesh's position
        // Even though the vertices *within* the geometry buffer have height,
        // the geometry itself is still centered at (0,0,0) locally.
        // We MUST move the entire mesh object to its correct chunk location.
        this.plane.position.set(chunkOffsetX, 0, chunkOffsetZ);


        // ===== 5. Create Physics Collider =====
        // Ensure geometry has indices (PlaneGeometry creates them)
        if (!planeGeometry.index) {
            console.error("Cannot create trimesh collider.");
            return;
        }
        // Rapier expects indices as Uint32Array
        const indices = new Uint32Array(planeGeometry.index.array);

        // Create the collider description using WORLD-SPACE vertices
        const colliderDesc = RAPIER.ColliderDesc.trimesh(worldVertices, indices);

        // Create the collider and attach it to the single static body managed by ChunkManager
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
                group: this.group,         // Pass the THREE group
                world: this.world,         // Pass the RAPIER world
                staticBody: this.staticBody, // Pass the handle to the static body
                player: this.player        // Pass player if needed by chunk logic (currently not)
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