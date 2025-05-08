// entityManager.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BIOME_ID } from './noise.js'; // Import biome IDs
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Configuration ---
const ENTITY_CONFIGS = [
    // --- Rocks ---
    {
        name: 'rock',
        type: 'instancedMesh',
        modelPath: './public/models/low_poly_rock_pack/scene.gltf', // <<<--- UPDATE PATH
        maxInstances: 3000,
        baseScale: 1.2,
        scaleVariance: [0.4, 1.8],
        yOffset: -0.15,
        minPlacementHeight: -5.0,
        maxPlacementSlope: 0.65, // Lower value = steeper allowed slope
        alignToNormal: true,
        mergeGeometries: false, // Keep false for rock pack
        density: { // Density per biome ID (chance 0-1 per *sampled point*)
            [BIOME_ID.ROCKY]: 0.5,
            [BIOME_ID.SNOW]: 0.2,
            [BIOME_ID.GRASSLAND]: 0.05,
            [BIOME_ID.BEACH]: 0.08,
            [BIOME_ID.DRY_BASIN]: 0.1,
            [BIOME_ID.FOREST]: 0.01
        }
    },
    // --- Temporarily Comment Out Animals for Debugging ---
    // {
    //     name: 'deer',
    //     type: 'instancedMesh',
    //     modelPath: './public/models/low_poly_deer.glb', // <<<--- VERIFY/UPDATE PATH
    //     maxInstances: 500,
    //     baseScale: 0.8,
    //     scaleVariance: [0.9, 1.1],
    //     yOffset: 0.0,
    //     minPlacementHeight: 1.5,
    //     maxPlacementSlope: 0.9,
    //     alignToNormal: false,
    //     mergeGeometries: false,
    //     density: { [BIOME_ID.FOREST]: 0.02, [BIOME_ID.GRASSLAND]: 0.03 }
    // },
    // {
    //     name: 'fox',
    //     type: 'instancedMesh',
    //     modelPath: './public/models/low_poly_fox.glb', // <<<--- VERIFY/UPDATE PATH
    //     maxInstances: 500,
    //     baseScale: 0.4,
    //     scaleVariance: [0.9, 1.1],
    //     yOffset: 0.0,
    //     minPlacementHeight: 1.0,
    //     maxPlacementSlope: 0.85,
    //     alignToNormal: false,
    //     mergeGeometries: false,
    //     density: { [BIOME_ID.FOREST]: 0.025, [BIOME_ID.GRASSLAND]: 0.01, [BIOME_ID.SNOW]: 0.005 }
    // },
];

// Cloud Config
const CLOUD_COUNT = 75;
const CLOUD_AREA_SIZE = 1000;
const CLOUD_MIN_HEIGHT = 100;
const CLOUD_MAX_HEIGHT = 150;
const CLOUD_BASE_SIZE = 60;
const CLOUD_DRIFT_SPEED = 0.1;
const CLOUD_TEXTURE_PATHS = [
    './public/assets/clouds/cloud1.png',
    './public/assets/clouds/cloud2.png',
    './public/assets/clouds/cloud3.png',
];

// Placement Sampling Step
const PLACEMENT_SAMPLING_STEP = 4;

const DEBUG_FORCE_BASIC_MATERIAL = false;
// --- End Configuration ---

export class EntityManager {
    constructor(params) {
        this.scene = params.scene;
        this.world = params.world;
        this.chunkSize = params.chunkSize;
        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        this.entityData = new Map();
        this.activeChunkEntities = new Map();

        this.clouds = [];
        this.cloudTextures = [];

        this.isInitialized = false;
    }

    async initialize() {
        // ... (initialize method remains the same - loads models/textures) ...
        console.log("EntityManager: Initializing...");
        try {
            // Load Cloud Textures
            const cloudTexturePromises = CLOUD_TEXTURE_PATHS.map(path =>
                this.textureLoader.loadAsync(path).catch(e => { console.error(`Failed cloud texture: ${path}`, e); return null; })
            );

            // Load Entity Models
            const modelLoadPromises = [];
            for (const config of ENTITY_CONFIGS) {
                // console.log(`EntityManager: Loading model for type "${config.name}" from ${config.modelPath}`);
                modelLoadPromises.push(
                    this.loader.loadAsync(config.modelPath)
                        .then(gltf => ({ config, gltf }))
                        .catch(e => {
                            if (e instanceof SyntaxError && e.message.includes('<')) { console.error(`Failed model: ${config.name}. SyntaxError likely due to incorrect path: ${config.modelPath}.`); }
                            else { console.error(`Failed model: ${config.name}`, e); }
                            return { config, gltf: null };
                        })
                );
            }

            // Wait for all assets
            const [loadedCloudTexturesResult, ...loadedModels] = await Promise.all([Promise.all(cloudTexturePromises), ...modelLoadPromises]);

            // Process Clouds
            this.cloudTextures = loadedCloudTexturesResult.filter(tex => tex !== null);
            if (this.cloudTextures.length > 0) {
                this.cloudTextures.forEach(tex => { tex.colorSpace = THREE.SRGBColorSpace; });
                this.createClouds();
            } else { console.warn("EntityManager: No cloud textures loaded."); }


            // Process loaded models
            for (const { config, gltf } of loadedModels) {
                if (!gltf) { console.error(`Skipping setup for "${config.name}" due to load failure.`); continue; }
                // console.log(`EntityManager: Setting up entity type "${config.name}"...`);

                let entityGeometry = null; let entityMaterial = null; let foundMesh = false;
                let geometriesToProcess = [];

                gltf.scene.traverse((child) => {
                    if (child.isMesh) {
                        child.updateMatrixWorld();
                        const geometry = child.geometry.clone();
                        geometry.applyMatrix4(child.matrixWorld);
                        geometriesToProcess.push(geometry);
                        if (!foundMesh) {
                            entityMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
                            foundMesh = true;
                            if (entityMaterial) {
                                entityMaterial.side = THREE.DoubleSide;
                                if (entityMaterial.map && (entityMaterial.alphaTest > 0 || entityMaterial.transparent || entityMaterial.alphaMap)) {
                                    entityMaterial.transparent = true; entityMaterial.depthWrite = true;
                                } else { entityMaterial.transparent = false; entityMaterial.depthWrite = true; }
                                if (entityMaterial.map) { entityMaterial.map.colorSpace = THREE.SRGBColorSpace; entityMaterial.map.needsUpdate = true; }
                                if (entityMaterial.alphaMap) { entityMaterial.alphaMap.colorSpace = THREE.NoColorSpace; entityMaterial.alphaMap.needsUpdate = true; }
                                entityMaterial.metalness = entityMaterial.metalness !== undefined ? Math.min(entityMaterial.metalness, 0.1) : 0.0;
                                entityMaterial.roughness = entityMaterial.roughness !== undefined ? Math.max(entityMaterial.roughness, 0.7) : 0.8;
                            } else { console.warn(`Material missing for first mesh of ${config.name}.`); }
                        }
                         child.castShadow = true; child.receiveShadow = true;
                    }
                });

                if (geometriesToProcess.length === 0) { console.error(`No Mesh Geometry found for ${config.name}. Skipping.`); continue; }
                else if (geometriesToProcess.length === 1 || !config.mergeGeometries) {
                     if (!config.mergeGeometries && geometriesToProcess.length > 1) { console.warn(`Using first geometry for "${config.name}" as mergeGeometries is false.`); }
                     entityGeometry = geometriesToProcess[0];
                     if (!config.mergeGeometries) { for(let i=1; i<geometriesToProcess.length; i++) geometriesToProcess[i].dispose(); }
                } else {
                     // console.log(`Merging ${geometriesToProcess.length} geometries for ${config.name}...`);
                     try { entityGeometry = BufferGeometryUtils.mergeGeometries(geometriesToProcess, false); }
                     catch (mergeError) { console.error(`Merge error for ${config.name}:`, mergeError); entityGeometry = null; }
                     finally { geometriesToProcess.forEach(geom => geom.dispose()); }
                     if (!entityGeometry) { console.error(`Merge failed for ${config.name}. Skipping.`); continue; }
                }

                entityGeometry.computeBoundingBox();
                entityGeometry.computeBoundingSphere();

                if (DEBUG_FORCE_BASIC_MATERIAL || !entityMaterial) {
                    console.warn(`Using default/debug material for ${config.name}.`);
                    if (entityMaterial) entityMaterial.dispose();
                    entityMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
                }

                const instancedMesh = new THREE.InstancedMesh(entityGeometry, entityMaterial, config.maxInstances);
                instancedMesh.castShadow = true; instancedMesh.receiveShadow = true;
                instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                instancedMesh.frustumCulled = false;
                instancedMesh.computeBoundingSphere();
                this.scene.add(instancedMesh);

                const freeIndices = [];
                for (let i = config.maxInstances - 1; i >= 0; i--) {
                    freeIndices.push(i);
                    instancedMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
                }
                instancedMesh.instanceMatrix.needsUpdate = true; instancedMesh.count = 0;

                this.entityData.set(config.name, { mesh: instancedMesh, material: entityMaterial, geometry: entityGeometry, freeIndices: freeIndices, config: config });
                // console.log(`EntityManager: Setup complete for "${config.name}".`);
            }

            this.isInitialized = true;
            console.log("EntityManager: Initialization complete.");

        } catch (error) {
            console.error("EntityManager: Initialization failed:", error);
            this.isInitialized = false;
            this.dispose(); throw error;
        }
    }

    // --- Cloud Creation Method ---
    createClouds() {
       // ... (createClouds method remains the same) ...
        if (this.cloudTextures.length === 0) return;
        const heightRange = CLOUD_MAX_HEIGHT - CLOUD_MIN_HEIGHT;
        for (let i = 0; i < CLOUD_COUNT; i++) {
            const randomIndex = Math.floor(Math.random() * this.cloudTextures.length);
            const randomTexture = this.cloudTextures[randomIndex];
            const cloudMaterial = new THREE.SpriteMaterial({
                map: randomTexture, color: 0xffffff, transparent: true,
                opacity: 0.85, blending: THREE.NormalBlending,
                depthWrite: false, sizeAttenuation: true
            });
            const sprite = new THREE.Sprite(cloudMaterial);
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * CLOUD_AREA_SIZE;
            const x = Math.cos(angle) * radius; const z = Math.sin(angle) * radius;
            const y = CLOUD_MIN_HEIGHT + Math.random() * heightRange;
            sprite.position.set(x, y, z);
            const size = CLOUD_BASE_SIZE * (0.7 + Math.random() * 0.6);
            sprite.scale.set(size, size, 1);
            sprite.userData.drift = new THREE.Vector3(
                (Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1
            ).normalize().multiplyScalar(CLOUD_DRIFT_SPEED * (0.5 + Math.random()));
            this.clouds.push(sprite);
            this.scene.add(sprite);
        }
        console.log(`EntityManager: Created ${this.clouds.length} clouds.`);
    }


// Debugging in addDetailsForChunk method:

addDetailsForChunk(chunkData) {
    if (!this.isInitialized) {
        console.warn("EntityManager: addDetailsForChunk called before initialization.");
        return;
    }

    const { chunkX, chunkZ, positions, normals, biomes, res } = chunkData;
    const chunkKey = `${chunkX},${chunkZ}`;
    console.log(`EntityManager: Adding details for chunk ${chunkKey}`);

    const chunkOffsetX = chunkX * this.chunkSize;
    const chunkOffsetZ = chunkZ * this.chunkSize;

    const tempMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const worldNormal = new THREE.Vector3();
    let chunkEntityMap = this.activeChunkEntities.get(chunkKey);
    if (!chunkEntityMap) {
        chunkEntityMap = {};
        this.activeChunkEntities.set(chunkKey, chunkEntityMap);
    }
    let needsMatrixUpdate = {};
    let totalPlacedThisChunk = 0;

    const step = PLACEMENT_SAMPLING_STEP;
    const numVertsPerRow = res + 1;

    for (let iz = 0; iz <= res; iz += step) {
        for (let ix = 0; ix <= res; ix += step) {
            const i = ix + iz * numVertsPerRow;
            if (i >= biomes.length) continue;

            const biomeId = biomes[i];
            const yPos = positions[i * 3 + 1];  // Height
            const normalY = normals[i * 3 + 1];  // Slope

            // Log the height and slope to check placement conditions
            console.log(`Checking entity placement at [${ix}, ${iz}] in chunk ${chunkKey}`);
            console.log(`yPos: ${yPos.toFixed(2)}, normalY: ${normalY.toFixed(2)}, biomeId: ${biomeId}`);

            // Loop through each configured entity type
            for (const config of ENTITY_CONFIGS) {
                const entityType = config.name;
                const entityInfo = this.entityData.get(entityType);
                if (!entityInfo) continue;  // Skip if this type wasn't loaded/set up

                const placeDensity = config.density[biomeId] || 0;
                const meetsHeight = yPos >= config.minPlacementHeight;
                const meetsSlope = normalY >= config.maxPlacementSlope;

                // Log the density and placement conditions
                console.log(`  Checking ${entityType}:`);
                console.log(`  - Place density: ${placeDensity}`);
                console.log(`  - Meets height: ${meetsHeight}`);
                console.log(`  - Meets slope: ${meetsSlope}`);

                if (placeDensity > 0 && meetsHeight && meetsSlope) {
                    const densityCheckValue = placeDensity * step * step;
                    const randomCheckValue = Math.random();

                    // Log the density check
                    console.log(`  - Density check: ${densityCheckValue.toFixed(3)}, random check: ${randomCheckValue.toFixed(3)}`);

                    if (randomCheckValue < densityCheckValue) {
                        if (entityInfo.freeIndices.length > 0) {
                            const instanceId = entityInfo.freeIndices.pop();

                            const worldX = positions[i * 3 + 0] + chunkOffsetX;
                            const worldY = positions[i * 3 + 1];
                            const worldZ = positions[i * 3 + 2] + chunkOffsetZ;
                            position.set(worldX, worldY + config.yOffset, worldZ);

                            if (config.alignToNormal) {
                                worldNormal.set(normals[i * 3 + 0], normals[i * 3 + 1], normals[i * 3 + 2]).normalize();
                                quaternion.setFromUnitVectors(up, worldNormal);
                                const randomYRotation = new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI * 2);
                                quaternion.multiply(randomYRotation);
                            } else {
                                quaternion.setFromAxisAngle(up, Math.random() * Math.PI * 2);
                            }

                            const scaleRange = config.scaleVariance[1] - config.scaleVariance[0];
                            const scaleVariance = config.scaleVariance[0] + Math.random() * scaleRange;
                            scale.set(config.baseScale * scaleVariance, config.baseScale * scaleVariance, config.baseScale * scaleVariance);

                            tempMatrix.compose(position, quaternion, scale);
                            entityInfo.mesh.setMatrixAt(instanceId, tempMatrix);

                            if (!chunkEntityMap[entityType]) chunkEntityMap[entityType] = [];
                            chunkEntityMap[entityType].push(instanceId);
                            needsMatrixUpdate[entityType] = true;
                            totalPlacedThisChunk++;

                            console.log(`    -> Placed ${entityType} at position [${worldX.toFixed(1)}, ${worldY.toFixed(1)}, ${worldZ.toFixed(1)}]`);
                        } else {
                            console.warn(`EntityManager: Ran out of instances for type "${entityType}"!`);
                        }
                    }
                }
            } // End loop entity types
        } // End loop ix
    } // End loop iz

    // Update instance counts and signal GPU update
    if (totalPlacedThisChunk > 0) {
        console.log(`EntityManager: Placed ${totalPlacedThisChunk} total entities for chunk ${chunkKey}`);
        for (const entityType in needsMatrixUpdate) {
            const entityInfo = this.entityData.get(entityType);
            if (entityInfo) {
                entityInfo.mesh.instanceMatrix.needsUpdate = true;
                entityInfo.mesh.count = entityInfo.config.maxInstances - entityInfo.freeIndices.length;
                console.log(`Updated ${entityType}: count=${entityInfo.mesh.count}`);
            }
        }
    } else {
        console.log(`EntityManager: No entities placed for chunk ${chunkKey}`);
    }
}




    // Called by ChunkManager when a chunk is destroyed
    removeDetailsForChunk(chunkKey) {
       // ... (removeDetailsForChunk method remains the same) ...
        if (!this.isInitialized) return;
        const chunkEntityMap = this.activeChunkEntities.get(chunkKey);
        if (!chunkEntityMap) return;

        // console.log(`Removing details for chunk ${chunkKey}`); // Optional log
        const invisibleMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        let needsMatrixUpdate = {};

        for (const entityType in chunkEntityMap) {
            const entityInfo = this.entityData.get(entityType);
            const indicesToRemove = chunkEntityMap[entityType];
            if (entityInfo && indicesToRemove && indicesToRemove.length > 0) {
                // console.log(` - Removing ${indicesToRemove.length} of type ${entityType}`); // Optional log
                for (const instanceId of indicesToRemove) {
                    if (instanceId < entityInfo.config.maxInstances) {
                         entityInfo.mesh.setMatrixAt(instanceId, invisibleMatrix);
                         entityInfo.freeIndices.push(instanceId);
                    } else { console.error(`Invalid instanceId ${instanceId} for ${entityType}`); }
                }
                needsMatrixUpdate[entityType] = true;
            }
        }

        for (const entityType in needsMatrixUpdate) {
            const entityInfo = this.entityData.get(entityType);
            if (entityInfo) {
                entityInfo.mesh.instanceMatrix.needsUpdate = true;
                entityInfo.mesh.count = entityInfo.config.maxInstances - entityInfo.freeIndices.length;
                 // console.log(`   - Updated ${entityType} after removal: count=${entityInfo.mesh.count}`); // Optional log
            }
        }
        this.activeChunkEntities.delete(chunkKey);
    }


    // Update loop - Includes cloud update
    update(deltaTime, playerPosition) {
       // ... (update method remains the same) ...
        if (!this.isInitialized) return;

        // Cloud Update Logic
        if (playerPosition && this.clouds.length > 0) {
            const wrapDistanceSq = (CLOUD_AREA_SIZE * 1.2) * (CLOUD_AREA_SIZE * 1.2);
            for (const cloud of this.clouds) {
                if (cloud.userData.drift) {
                    cloud.position.addScaledVector(cloud.userData.drift, deltaTime);
                    const relativeX = cloud.position.x - playerPosition.x;
                    const relativeZ = cloud.position.z - playerPosition.z;
                    if (relativeX * relativeX + relativeZ * relativeZ > wrapDistanceSq) {
                        const angle = Math.random() * Math.PI * 2;
                        const radius = CLOUD_AREA_SIZE * (0.9 + Math.random() * 0.2);
                        cloud.position.x = playerPosition.x + Math.cos(angle) * radius;
                        cloud.position.z = playerPosition.z + Math.sin(angle) * radius;
                    }
                }
            }
        }
    }

    dispose() {
        // ... (dispose logic remains the same) ...
        console.log("EntityManager: Disposing...");
        for (const [name, data] of this.entityData.entries()) {
             console.log(`Disposing entity type: ${name}`);
             if (data.mesh) {
                 this.scene.remove(data.mesh);
                 if (data.mesh.geometry) data.mesh.geometry.dispose();
                 if (data.material) {
                     if (Array.isArray(data.material)) data.material.forEach(m => m.dispose());
                     else data.material.dispose();
                 }
             }
        }
        this.entityData.clear();
        this.clouds.forEach(cloud => {
            this.scene.remove(cloud);
            if (cloud.material) cloud.material.dispose();
        });
        this.cloudTextures.forEach(tex => tex?.dispose());
        this.clouds = []; this.cloudTextures = [];
        this.activeChunkEntities.clear();
        this.isInitialized = false;
         console.log("EntityManager: Disposal complete.");
    }
}
