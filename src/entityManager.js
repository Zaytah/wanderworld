// entityManager.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BIOME_ID } from './noise.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ENTITY_CONFIGS = [
    {
        name: 'rock',
        type: 'instancedMesh',
        modelPath: './public/models/low_poly_rock_pack/scene.gltf',
        maxInstances: 1000,
        baseScale: 1.3,
        scaleVariance: [0.4, 1.6],
        yOffset: -2.0,
        minPlacementHeight: -5.0,
        maxPlacementSlope: 0.65,
        alignToNormal: false,
        mergeGeometries: false,
        density: {
            [BIOME_ID.ROCKY]: 0.025,
            [BIOME_ID.SNOW]: 0.1,
            [BIOME_ID.GRASSLAND]: 0.15,
            [BIOME_ID.BEACH]: 0.1,
            [BIOME_ID.DRY_BASIN]: 0.2,
            [BIOME_ID.FOREST]: 0.05,
            [BIOME_ID.OCEAN]: 0.08
        },
        correctionMatrix: null,
    },
    {
        name: 'tree',
        type: 'instancedMesh',
        modelPath: './public/models/giant_low_poly_tree/scene.gltf',
        maxInstances: 3000,
        baseScale: 1.5,
        scaleVariance: [0.7, 1.4],
        yOffset: 0.0,
        minPlacementHeight: 1.0,
        maxPlacementSlope: 0.9,
        alignToNormal: false,
        mergeGeometries: true,
        density: {
         [BIOME_ID.FOREST]: 0.25,
         [BIOME_ID.GRASSLAND]: 0.1,
         [BIOME_ID.SNOW]: 0.1,
        },
         correctionMatrix: null,
         // correctionMatrix: new THREE.Matrix4().makeRotationZ(Math.PI),
         // correctionMatrix: new THREE.Matrix4().makeRotationY(Math.PI).multiply(new THREE.Matrix4().makeRotationX(Math.PI)),
     },
     {
        name: 'grass',
        type: 'instancedMesh',
        modelPath: './public/models/grass_variations/scene.gltf',
        maxInstances: 20000,
        baseScale: 0.13,
        scaleVariance: [0.4, 0.575],
        yOffset: -0.8,
        minPlacementHeight: -5.0,
        maxPlacementSlope: 0.85,
        alignToNormal: false,
        mergeGeometries: true,
        density: {
            [BIOME_ID.ROCKY]: 0.01,
            [BIOME_ID.SNOW]: 0.01,
            [BIOME_ID.GRASSLAND]: 0.525,
            [BIOME_ID.BEACH]: 0.09,
            [BIOME_ID.DRY]: 0.1,
            [BIOME_ID.FOREST]: 0.18,
            [BIOME_ID.OCEAN]: 0.08
        },
        correctionMatrix: null,
    },
    {
        name: 'deer',
        type: 'instancedMesh',
        modelPath: './public/models/low_poly_deer/scene.gltf',
        maxInstances: 400,
        baseScale: 4.5,
        scaleVariance: [0.6, 1.5],
        yOffset: -0.15,
        minPlacementHeight: -1.0,
        maxPlacementSlope: 0.9,
        alignToNormal: false,
        mergeGeometries: true,
        density: { [BIOME_ID.FOREST]: 0.004, [BIOME_ID.GRASSLAND]: 0.01 },
        correctionMatrix: new THREE.Matrix4().makeRotationX(Math.PI / 2),
    },
    {
        name: 'fox',
        type: 'instancedMesh',
        modelPath: './public/models/low_poly_fox/scene.gltf',
        maxInstances: 300,
        baseScale: 0.15,
        scaleVariance: [0.4, 1.3],
        yOffset: -0.15,
        minPlacementHeight: -1.0,
        maxPlacementSlope: 0.85,
        alignToNormal: false,
        mergeGeometries: true,
        density: { [BIOME_ID.FOREST]: 0.04, [BIOME_ID.GRASSLAND]: 0.005, [BIOME_ID.SNOW]: 0.05 }
     },
     {
        name: 'wolf',
        type: 'instancedMesh',
        modelPath: './public/models/low-poly_wolf/scene.gltf',
        maxInstances: 150,
        baseScale: 0.015,
        scaleVariance: [0.5, 1.3],
        yOffset: 0.0,
        minPlacementHeight: 1.0,
        maxPlacementSlope: 0.87,
        alignToNormal: false,
        mergeGeometries: true,
        density: { [BIOME_ID.FOREST]: 0.04, [BIOME_ID.GRASSLAND]: 0.005, [BIOME_ID.SNOW]: 0.04 }
     },
     {
        name: 'horse',
        type: 'instancedMesh',
        modelPath: './public/models/low-poly_horse/scene.gltf',
        maxInstances: 200,
        baseScale: 1.75,
        scaleVariance: [0.7, 1.1],
        yOffset: -0.15,
        minPlacementHeight: -3.0,
        maxPlacementSlope: 0.9,
        alignToNormal: false,
        mergeGeometries: true,
        density: { [BIOME_ID.FOREST]: 0.01, [BIOME_ID.GRASSLAND]: 0.04, [BIOME_ID.SNOW]: 0.0005, [BIOME_ID.BEACH]: 0.01 },
        correctionMatrix: new THREE.Matrix4().makeRotationX(Math.PI / 2)
    },
    {
        name: 'fantasyAnimal',
        type: 'instancedMesh',
        modelPath: './public/models/fantasy_mount_animal/scene.gltf',
        maxInstances: 5,
        baseScale: 1.0,
        scaleVariance: [6, 11],
        yOffset: -1.0,
        minPlacementHeight: -3.0,
        maxPlacementSlope: 0.6,
        alignToNormal: false,
        mergeGeometries: true,
        density: { 
            [BIOME_ID.ROCKY]: 0.01,
            [BIOME_ID.SNOW]: 0.05,
            [BIOME_ID.GRASSLAND]: 0.01,
            [BIOME_ID.BEACH]: 0.01,
            [BIOME_ID.DRY_BASIN]: 0.01,
            [BIOME_ID.FOREST]: 0.025,
            [BIOME_ID.OCEAN]: 0.01
        }
    },
];

const CLOUD_COUNT = 80;
const CLOUD_AREA_SIZE = 1000;
const CLOUD_MIN_HEIGHT = 80;
const CLOUD_MAX_HEIGHT = 130;
const CLOUD_BASE_SIZE = 85;
const CLOUD_DRIFT_SPEED = 0.1;
const CLOUD_TEXTURE_PATHS = [
    './public/assets/clouds/cloud1.png',
    './public/assets/clouds/cloud2.png',
    './public/assets/clouds/cloud3.png',
    './public/assets/clouds/cloud4.png',
    './public/assets/clouds/cloud5.png',
    './public/assets/clouds/cloud6.png',
];

const PLACEMENT_SAMPLING_STEP = 4;

export class EntityManager {
    constructor(params) {
        this.scene = params.scene;
        this.world = params.world;
        this.chunkSize = params.chunkSize;
        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        this.entityData = new Map(); // { entityName: { mesh, material, geometry, freeIndices, config } }
        this.activeEntities = new Map(); // { chunkKey: { entityName: [instanceId] } }
        this.clouds = [];
        this.cloudTextures = [];

        this.isInitialized = false;
    }

    async initialize() {
        console.log("EntityManager: Initializing.");
        this.isInitialized = false;

        try {
            // load cload textures
            const cloudTexturePromises = CLOUD_TEXTURE_PATHS.map(path =>
                this.textureLoader.loadAsync(path).catch(e => { console.error(`Failed cloud texture: ${path}`, e); return null; })
            );

            // load models
            const modelLoadPromises = [];
            for (const config of ENTITY_CONFIGS) {
                modelLoadPromises.push(
                    this.loader.loadAsync(config.modelPath)
                        .then(gltf => ({ config, gltf }))
                        .catch(e => {
                            console.error(`Failed model: ${config.name}. Error:`, e);
                            return { config, gltf: null };
                        })
                );
            }

            const [loadedCloudTexturesResult, ...loadedModels] = await Promise.all([Promise.all(cloudTexturePromises), ...modelLoadPromises]);

            // handle clouds
            this.cloudTextures = loadedCloudTexturesResult.filter(tex => tex !== null);
            if (this.cloudTextures.length > 0) {
                this.cloudTextures.forEach(tex => { tex.colorSpace = THREE.SRGBColorSpace; });
                this.createClouds();
            }


            // handle models
            for (const { config, gltf } of loadedModels) {
                if (!gltf) { console.error(`Skipping setup for "${config.name}" due to load failure.`); continue; }
                console.log(`EntityManager: Setting up entity type "${config.name}".`);

                let entityGeometry = null;

                let collectedGeometriesWithRef = []; // { geometry: clone, originalMesh: child }
                let collectedMaterialsWithRef = []; // { material: originalMat, originalMesh: child }

                // traverse ALL meshes
                gltf.scene.traverse((child) => {
                    if (child.isMesh) {
                        // apply child world matrix -- local transformations for merging meshes in models
                        child.updateMatrixWorld(true);
                        const geometry = child.geometry.clone();
                        geometry.applyMatrix4(child.matrixWorld);
                        collectedGeometriesWithRef.push({ geometry: geometry, originalMesh: child });

                        let childMaterials = Array.isArray(child.material) ? child.material : [child.material];
                        childMaterials.forEach(mat => { if (mat) collectedMaterialsWithRef.push({ material: mat, originalMesh: child }); });
                    }
                });


                let finalGeometry = null;
                let finalMaterial = null;

                try {
                    let originalGeometries = collectedGeometriesWithRef.map(item => item.geometry);
                    let originalMaterials = collectedMaterialsWithRef.map(item => item.material);

                    if (originalGeometries.length > 1 && config.mergeGeometries !== false) {
                    //    console.log(`EntityManager: Merging ${originalGeometries.length} geometries for ${config.name}.`);
                        finalGeometry = BufferGeometryUtils.mergeGeometries(originalGeometries, true);

                        // 
                        if (finalGeometry && finalGeometry.groups && finalGeometry.groups.length > 0) {
                            let uniqueOriginalMaterials = originalMaterials.filter((value, index, self) => self.indexOf(value) === index);
                            finalMaterial = uniqueOriginalMaterials.map(mat => {
                                if (mat) {
                                    const clonedMat = mat.clone();
                                    clonedMat.side = THREE.DoubleSide;
                                    if (clonedMat.map && (clonedMat.alphaTest > 0 || clonedMat.transparent || clonedMat.alphaMap)) { clonedMat.transparent = true; clonedMat.depthWrite = true; } else { clonedMat.transparent = false; clonedMat.depthWrite = true; }
                                    if (clonedMat.map) { clonedMat.map.colorSpace = THREE.SRGBColorSpace; }
                                    if (clonedMat.alphaMap) { clonedMat.alphaMap.colorSpace = THREE.NoColorSpace; }
                                    clonedMat.metalness = clonedMat.metalness !== undefined ? Math.min(clonedMat.metalness, 0.1) : 0.0;
                                    clonedMat.roughness = clonedMat.roughness !== undefined ? Math.max(clonedMat.roughness, 0.7) : 0.8;
                                    return clonedMat;
                                }
                                return null;
                            }).filter(mat => mat !== null);


                            if (finalMaterial.length === 1) finalMaterial = finalMaterial[0];
                            else if (finalMaterial.length === 0) finalMaterial = null;

                        } else {
                            // If merge didn't create groups, or only one geometry, use the first material, cloned
                            finalMaterial = originalMaterials.length > 0 ? originalMaterials[0].clone() : null;
                            // Basic material properties
                            if (finalMaterial) {
                                finalMaterial.side = THREE.DoubleSide;
                                if (finalMaterial.map && (finalMaterial.alphaTest > 0 || finalMaterial.transparent || finalMaterial.alphaMap)) { 
                                    finalMaterial.transparent = true; finalMaterial.depthWrite = true; 
                                } else { finalMaterial.transparent = false; finalMaterial.depthWrite = true; }

                                if (finalMaterial.map) { finalMaterial.map.colorSpace = THREE.SRGBColorSpace; }
                                if (finalMaterial.alphaMap) { finalMaterial.alphaMap.colorSpace = THREE.NoColorSpace; }
                                finalMaterial.metalness = finalMaterial.metalness !== undefined ? Math.min(finalMaterial.metalness, 0.1) : 0.0;
                                finalMaterial.roughness = finalMaterial.roughness !== undefined ? Math.max(finalMaterial.roughness, 0.7) : 0.8;
                        }
                    }

                    } else {
                        if (originalGeometries.length > 1 && config.mergeGeometries === false) {
                            console.warn(`EntityManager: 'mergeGeometries' was set to false.`);
                        }
                         finalGeometry = originalGeometries[0];
                         finalMaterial = originalMaterials.length > 0 ? originalMaterials[0].clone() : null;
                          //  material properties
                         if (finalMaterial) {
                             finalMaterial.side = THREE.DoubleSide;
                             if (finalMaterial.map && (finalMaterial.alphaTest > 0 || finalMaterial.transparent || finalMaterial.alphaMap)) { 
                                finalMaterial.transparent = true; finalMaterial.depthWrite = true; 
                            } else { finalMaterial.transparent = false; finalMaterial.depthWrite = true; }

                            if (finalMaterial.map) { finalMaterial.map.colorSpace = THREE.SRGBColorSpace; }
                            if (finalMaterial.alphaMap) { finalMaterial.alphaMap.colorSpace = THREE.NoColorSpace; }
                            finalMaterial.metalness = finalMaterial.metalness !== undefined ? Math.min(finalMaterial.metalness, 0.1) : 0.0;
                            finalMaterial.roughness = finalMaterial.roughness !== undefined ? Math.max(finalMaterial.roughness, 0.7) : 0.8;
                        }
                    }
                } catch (processError) {
                    // created geometries/mats are deleted on error
                    if (entityGeometry && !entityGeometry.disposed) entityGeometry.dispose();
                    if (finalGeometry && finalGeometry !== entityGeometry && !finalGeometry.disposed) finalGeometry.dispose();

                    collectedGeometriesWithRef.forEach(item => { if(item.geometry && !item.geometry.disposed) item.geometry.dispose(); });
                    collectedMaterialsWithRef.forEach(item => { if(item.material && !item.material.disposed) item.material.dispose(); });
                     
                    if (Array.isArray(finalMaterial)) finalMaterial.forEach(m => { if(m && !m.disposed) m.dispose(); });
                    else if (finalMaterial && !finalMaterial.disposed) finalMaterial.dispose();

                    continue;
                } finally {
                    // all original collected geometries/mats are deleted if they weren't used
                    collectedGeometriesWithRef.forEach(item => { if(item.geometry && item.geometry !== finalGeometry && !item.geometry.disposed) item.geometry.dispose(); });
                    collectedMaterialsWithRef.forEach(item => {
                        let originalMat = item.material;
                        let isFinal = false;
                        if(Array.isArray(finalMaterial)) { isFinal = finalMaterial.some(m => m.uuid === originalMat.uuid && m !== originalMat); } // check for clone in final array
                        else if (finalMaterial) { isFinal = (finalMaterial.uuid === originalMat.uuid && finalMaterial !== originalMat); } // Check for clone in final mat
                        if (!isFinal && originalMat && !originalMat.disposed) {
                            originalMat.dispose();
                        }
                    });
                }


                if (!finalGeometry) { console.warn(`EntityManager: Failed to get valid geometry for ${config.name} after processing.`); continue; }

                 if (!finalMaterial || (Array.isArray(finalMaterial) && finalMaterial.length === 0)) {
                    //  delete materials if forcing material
                    if (Array.isArray(finalMaterial)) finalMaterial.forEach(m => { if(m && !m.disposed) m.dispose(); });
                    else if (finalMaterial && !finalMaterial.disposed) finalMaterial.dispose();

                    const debugMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8, side: THREE.DoubleSide });
                    finalMaterial = debugMaterial;
                } else if (Array.isArray(finalMaterial) && finalMaterial.some(m => m === null || m === undefined)) {
                    let filteredFinalMaterial = finalMaterial.filter(m => m !== null && m !== undefined);
                    // Dispose the original array materials before cloning the filtered ones
                    finalMaterial.forEach(m => { if(m && !m.disposed) m.dispose(); });

                        finalMaterial = filteredFinalMaterial.map(m => {
                            if(m) {
                                const clonedMat = m.clone();
                                clonedMat.side = THREE.DoubleSide;
                                return clonedMat;
                            }
                            return null;
                       }).filter(m => m !== null);
                       
                    if (finalMaterial.length === 1) finalMaterial = finalMaterial[0];

                }

                // correct models if needed (declared above)
                 if (config.correctionMatrix && finalGeometry) {
                    // console.log(`Correcting matrix for ${config.name}.`);
                    finalGeometry.applyMatrix4(config.correctionMatrix);
                    finalGeometry.computeBoundingBox();
                    finalGeometry.computeBoundingSphere();
                }

                // think can remove these
                //finalGeometry.computeBoundingBox();
                //finalGeometry.computeBoundingSphere();

                const instancedMesh = new THREE.InstancedMesh(
                    finalGeometry,
                    finalMaterial,
                    config.maxInstances
                );

                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = true;
                instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                instancedMesh.frustumCulled = false;

                this.scene.add(instancedMesh);

                const freeIndices = [];
                const invisibleMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
                for (let i = config.maxInstances - 1; i >= 0; i--) {
                    freeIndices.push(i);
                    instancedMesh.setMatrixAt(i, invisibleMatrix);
                }
                instancedMesh.instanceMatrix.needsUpdate = true;
                instancedMesh.count = 0;

                // store data
                 this.entityData.set(config.name, {
                     mesh: instancedMesh,
                     material: finalMaterial,
                     geometry: finalGeometry,
                     freeIndices: freeIndices,
                     config: config,
                 });
            }

            this.isInitialized = true;
            console.log("EntityManager: Initialization complete.");
        } catch (error) {
            console.error("EntityManager: Initialization failed:", error);
            this.isInitialized = false;
            throw error;
        }
    }

    // loop thru cloud textures as sprites
    createClouds() {
        if (this.cloudTextures.length === 0) return;
        const heightRange = CLOUD_MAX_HEIGHT - CLOUD_MIN_HEIGHT;
        for (let i = 0; i < CLOUD_COUNT; i++) {
            const rdx = Math.floor(Math.random() * this.cloudTextures.length);
            const randomTexture = this.cloudTextures[rdx];
            const cloudMaterial = new THREE.SpriteMaterial({
                map: randomTexture, 
                color: 0xffffff, 
                transparent: true,
                opacity: 0.85, 
                blending: THREE.NormalBlending,
                depthWrite: false, 
                sizeAttenuation: true
            });
            const sprite = new THREE.Sprite(cloudMaterial);
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * CLOUD_AREA_SIZE;
            const x = Math.cos(angle) * radius; 
            const z = Math.sin(angle) * radius;
            const y = CLOUD_MIN_HEIGHT + Math.random() * heightRange;
            sprite.position.set(x, y, z);
            const size = CLOUD_BASE_SIZE * (0.7 + Math.random() * 0.6);
            sprite.scale.set(size, size, 1);
            sprite.userData.drift = new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1)
                            .normalize()
                            .multiplyScalar(CLOUD_DRIFT_SPEED * (0.5 + Math.random()));
            this.clouds.push(sprite);
            this.scene.add(sprite);
        }
        //console.log(`EntityManager: Created ${this.clouds.length} clouds.`);
    }

    addDetailsForChunk(chunkData) {
        if (!this.isInitialized) return;

        const { chunkX, chunkZ, positions, normals, biomes, res } = chunkData;
        const key = `${chunkX},${chunkZ}`;

        if (this.activeEntities.has(key)) return;

        const chunkOffsetX = chunkX * this.chunkSize;
        const chunkOffsetZ = chunkZ * this.chunkSize;

        const tempMat = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const worldNormal = new THREE.Vector3();

        let entityMap = {};
        this.activeEntities.set(key, entityMap);

        let needsMatrixUpdate = {};

        const step = PLACEMENT_SAMPLING_STEP;
        const numVertsPerRow = res + 1;

        for (let iz = 0; iz <= res; iz += step) {
            for (let ix = 0; ix <= res; ix += step) {
                const i = ix + iz * numVertsPerRow;

                if (i * 3 + 2 >= positions.length || i >= biomes.length || i * 3 + 2 >= normals.length) {
                    continue;
                }

                const biomeId = biomes[i];
                const yPos = positions[i * 3 + 1];
                const normalY = normals[i * 3 + 1];


                for (const config of ENTITY_CONFIGS) {
                    const entityType = config.name;
                    const entityInfo = this.entityData.get(entityType);

                    const placeDensity = config.density[biomeId] || 0;
                    if (placeDensity <= 0) continue;

                    const meetsHeight = yPos >= config.minPlacementHeight;
                    const meetsSlope = normalY >= config.maxPlacementSlope;

                    if (meetsHeight && meetsSlope) {
                        const probability = placeDensity;
                        const randomCheckValue = Math.random();

                        if (randomCheckValue < probability) {
                            if (entityInfo.freeIndices.length > 0) {
                                const instanceId = entityInfo.freeIndices.pop();

                                const terrainX = positions[i * 3 + 0];
                                const terrainY = positions[i * 3 + 1];
                                const terrainZ = positions[i * 3 + 2];

                                const wx = terrainX + chunkOffsetX;
                                const wy = terrainY;
                                const wz = terrainZ + chunkOffsetZ;

                                position.set(wx, wy + config.yOffset, wz);

                                if (config.alignToNormal && normals[i * 3 + 1] !== undefined) {
                                    worldNormal.set(normals[i * 3 + 0], normals[i * 3 + 1], normals[i * 3 + 2]).normalize();
                                    quaternion.setFromUnitVectors(up, worldNormal);
                                    const axis = new THREE.Vector3().copy(worldNormal);
                                    const angle = Math.random() * Math.PI * 2;
                                    const normalRotation = new THREE.Quaternion().setFromAxisAngle(axis, angle);
                                    quaternion.multiply(normalRotation);

                                } else {
                                    quaternion.setFromAxisAngle(up, Math.random() * Math.PI * 2);
                                }

                                const scaleRange = config.scaleVariance[1] - config.scaleVariance[0];
                                const scaleVariance = config.scaleVariance[0] + Math.random() * scaleRange;
                                const finalScale = config.baseScale * scaleVariance;
                                scale.set(finalScale, finalScale, finalScale);

                                tempMat.compose(position, quaternion, scale);
                                entityInfo.mesh.setMatrixAt(instanceId, tempMat);

                                if (!entityMap[entityType]) entityMap[entityType] = [];
                                entityMap[entityType].push(instanceId);
                                needsMatrixUpdate[entityType] = true;

                            } else {
                            //    console.warn(`EntityManager: Ran out of instances for type "${entityType}"! Cannot place more in chunk ${chunkKey}.`);
                            }
                        }
                    }
                }
            }
        }

         for (const entityType in needsMatrixUpdate) {
             const entityInfo = this.entityData.get(entityType);
             if (entityInfo && entityInfo.mesh) {
                 entityInfo.mesh.instanceMatrix.needsUpdate = true;
                 entityInfo.mesh.count = entityInfo.config.maxInstances - entityInfo.freeIndices.length;
             }
         }
    }

    removeDetailsForChunk(chunkKey) {
        if (!this.isInitialized) return;
        const chunkEntityMap = this.activeEntities.get(chunkKey);
        if (!chunkEntityMap) return;

        const invisibleMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        let needsMatrixUpdate = {};

        for (const entityType in chunkEntityMap) {
            const entityInfo = this.entityData.get(entityType);
            const indicesToRemove = chunkEntityMap[entityType];
            if (entityInfo && entityInfo.mesh && indicesToRemove && indicesToRemove.length > 0) {
                for (const instanceId of indicesToRemove) {
                    if (instanceId >= 0 && instanceId < entityInfo.config.maxInstances) {
                        entityInfo.mesh.setMatrixAt(instanceId, invisibleMatrix);
                        entityInfo.freeIndices.push(instanceId);
                    }
                }
                needsMatrixUpdate[entityType] = true;
            }
        }

        for (const entityType in needsMatrixUpdate) {
            const entityInfo = this.entityData.get(entityType);
            if (entityInfo && entityInfo.mesh) {
                entityInfo.mesh.instanceMatrix.needsUpdate = true;
                entityInfo.mesh.count = entityInfo.config.maxInstances - entityInfo.freeIndices.length;
            }
        }
        this.activeEntities.delete(chunkKey);
    }

    update(dt, playerPosition) {
        if (!this.isInitialized) return;

        // cloud sprites
        if (playerPosition && this.clouds.length > 0) {
            const wrapDistanceSq = (CLOUD_AREA_SIZE * 1.2) * (CLOUD_AREA_SIZE * 1.2);
            for (const cloud of this.clouds) {
                if (cloud.userData.drift) {
                    cloud.position.addScaledVector(cloud.userData.drift, dt);
                    const relativeX = cloud.position.x - playerPosition.x;
                    const relativeZ = cloud.position.z - playerPosition.z;
                    const distSq = relativeX * relativeX + relativeZ * relativeZ;

                    if (distSq > wrapDistanceSq) {
                        const angle = Math.random() * Math.PI * 2;
                        const radius = CLOUD_AREA_SIZE * (0.9 + Math.random() * 0.2);
                        cloud.position.x = playerPosition.x + Math.cos(angle) * radius;
                        cloud.position.z = playerPosition.z + Math.sin(angle) * radius;
                    }
                }
            }
        }
    }
}