// terrainWorker.js

// pretty much copied logic from three.js source code for calculations (vectors, normals, etc.) :p

import { genTerrain } from './noise.js';

const Vec3 = {
    create: (x = 0, y = 0, z = 0) => ({ x, y, z }),
    set: (v, x, y, z) => { v.x = x; v.y = y; v.z = z; return v; },
    subVectors: (v_target, a, b) => { v_target.x = a.x - b.x; v_target.y = a.y - b.y; v_target.z = a.z - b.z; return v_target; },
    crossVectors: (v_target, a, b) => {
        const ax = a.x, ay = a.y, az = a.z;
        const bx = b.x, by = b.y, bz = b.z;
        v_target.x = ay * bz - az * by;
        v_target.y = az * bx - ax * bz;
        v_target.z = ax * by - ay * bx;
        return v_target;
    }
};

self.onmessage = function(event) {
    const params = event.data;
    const chunkData = generateChunkData(params);
    self.postMessage(chunkData, [
        chunkData.positions.buffer,
        chunkData.indices.buffer,
        chunkData.worldVertices.buffer,
        chunkData.uvs.buffer,
        chunkData.normals.buffer,
        chunkData.biomes.buffer
    ]);
};

/**
 * generates all necessary vertex data for a terrain chunk.
 * @param {object} params - Parameters containing chunkSize, chunkX, chunkZ, res.
 * @returns {object}
 */
function generateChunkData(params) {
    const { chunkSize, chunkX, chunkZ, res } = params;
    const numVertices = (res + 1) * (res + 1);
    const numIndices = res * res * 6;

    const positions = new Float32Array(numVertices * 3);
    const indices = new Uint32Array(numIndices);
    const worldVertices = new Float32Array(numVertices * 3); // for physics collider
    const uvs = new Float32Array(numVertices * 2);
    const normals = new Float32Array(numVertices * 3);
    const biomes = new Float32Array(numVertices);

    const segmentSizeX = chunkSize / res;
    const segmentSizeZ = chunkSize / res;
    const halfSizeX = chunkSize / 2;
    const halfSizeZ = chunkSize / 2;
    const chunkOffsetX = chunkX * chunkSize;
    const chunkOffsetZ = chunkZ * chunkSize;

    let vertIndex = 0;
    let uvIndex = 0;
    let biomeIndex = 0;

    // Positions, World Vertices, UVs, Biomes
    for (let iz = 0; iz <= res; iz++) {
        const localZ = iz * segmentSizeZ - halfSizeZ;
        for (let ix = 0; ix <= res; ix++) {
            const localX = ix * segmentSizeX - halfSizeX;
            const wx = localX + chunkOffsetX;
            const wz = localZ + chunkOffsetZ;

            const terrainInfo = genTerrain(wx, wz);
            const y = terrainInfo.height;
            const biomeId = terrainInfo.biome;

            positions[vertIndex + 0] = localX;
            positions[vertIndex + 1] = y;
            positions[vertIndex + 2] = localZ;

            worldVertices[vertIndex + 0] = wx;
            worldVertices[vertIndex + 1] = y;
            worldVertices[vertIndex + 2] = wz;

            uvs[uvIndex++] = (localX / chunkSize) + 0.5;
            uvs[uvIndex++] = (localZ / chunkSize) + 0.5;

            biomes[biomeIndex++] = biomeId;

            vertIndex += 3;
        }
    }

    // Indices
    let indexIndex = 0;
    for (let iz = 0; iz < res; iz++) {
        for (let ix = 0; ix < res; ix++) {

            const a = ix + (res + 1) * iz;
            const b = ix + (res + 1) * (iz + 1);
            const c = (ix + 1) + (res + 1) * (iz + 1);
            const d = (ix + 1) + (res + 1) * iz;

            // First triangle (a, b, d)
            indices[indexIndex++] = a;
            indices[indexIndex++] = b;
            indices[indexIndex++] = d;
            // Second triangle (b, c, d)
            indices[indexIndex++] = b;
            indices[indexIndex++] = c;
            indices[indexIndex++] = d;
        }
    }

    // Normals
    const tempNormal = Vec3.create();
    const vA = Vec3.create(); 
    const vB = Vec3.create(); 
    const vC = Vec3.create();
    const cb = Vec3.create(); 
    const ab = Vec3.create();

    for (let i = 0; i < normals.length; i++) { normals[i] = 0; }

    // iterate over faces
    for (let i = 0; i < indices.length; i += 3) {
        const iA = indices[i + 0] * 3;
        const iB = indices[i + 1] * 3;
        const iC = indices[i + 2] * 3;

        // get vertices of the face using positions 
        Vec3.set(vA, positions[iA], positions[iA + 1], positions[iA + 2]);
        Vec3.set(vB, positions[iB], positions[iB + 1], positions[iB + 2]);
        Vec3.set(vC, positions[iC], positions[iC + 1], positions[iC + 2]);

        // calc face normal
        Vec3.subVectors(cb, vC, vB);
        Vec3.subVectors(ab, vA, vB);
        Vec3.crossVectors(tempNormal, cb, ab);

        // add face normal to vertex normals
        normals[iA] += tempNormal.x; normals[iA + 1] += tempNormal.y; normals[iA + 2] += tempNormal.z;
        normals[iB] += tempNormal.x; normals[iB + 1] += tempNormal.y; normals[iB + 2] += tempNormal.z;
        normals[iC] += tempNormal.x; normals[iC + 1] += tempNormal.y; normals[iC + 2] += tempNormal.z;
    }

    // normalize the vertex normals
    for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i];
        const ny = normals[i+1];
        const nz = normals[i+2];
        let len = Math.sqrt(nx*nx + ny*ny + nz*nz);
        if (len < 0.00001) len = 1; // prevent div by 0
        normals[i]   /= len;
        normals[i+1] /= len;
        normals[i+2] /= len;
    }

    return {
        chunkX: chunkX,
        chunkZ: chunkZ,
        positions: positions,
        indices: indices,
        worldVertices: worldVertices,
        uvs: uvs,
        normals: normals,
        biomes: biomes
    };
}
