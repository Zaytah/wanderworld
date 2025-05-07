// noise.js
import { makeNoise2D } from 'open-simplex-noise';

// Initialize noise functions. Using different seeds can create more variation
// if you use multiple noise2D instances for different purposes.

// --- Using fixed seeds for debugging ---
const BASE_SEED = performance.now();
const WARP_SEED = BASE_SEED + 1;
const DETAIL_SEED = BASE_SEED + 2;

const noise2D_base = makeNoise2D(BASE_SEED);
const noise2D_warp = makeNoise2D(WARP_SEED);
const noise2D_detail = makeNoise2D(DETAIL_SEED);
// console.log("Noise - typeof noise2D_base:", typeof noise2D_base);


/**
 * @param {function} noiseFn - 2D noise function to use 
 * @param {number} x
 * @param {number} y
 * @param {number} octaves - Layers of Noise
 * @param {number} persistence - How much to scale amplitude per octave
 * @param {number} scale - How zoomed out the noise is in first octave
 * @returns {number}
 */
export function fbm(noiseFn, x, y, octaves = 6, persistence = 0.35, scale = 0.05) {
    if (typeof noiseFn !== 'function') return 0;

    let total = 0, amplitude = 1, maxValue = 0;
    for (let i = 0; i < octaves; i++) {
        total += noiseFn(x * scale, y * scale) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        scale *= 2;
    }

    return maxValue === 0 ? 0 : total / maxValue;
}

/**
 * Generates height for terrain.
 * @param {number} x 
 * @param {number} z 
 * @returns {number}
 */
export function genTerrainHeight(x, z) {
    let height = 0;

    // 'domain warping' - idk if its doing much
    const warpStrength = 35.0;
    const warpScale = 0.015;

    const warpX = fbm(noise2D_warp, x, z, 3, 0.4, warpScale) * warpStrength;
    const warpZ = fbm(noise2D_warp, z, x, 3, 0.4, warpScale) * warpStrength;

    const warpedX = x + warpX;
    const warpedZ = z + warpZ;

    // base layer (1)
    const baseScale = 0.008;
    const baseOctaves = 5;
    const basePersistence = 0.5;
    const baseAmplitude = 30.0;
    let baseHeight = fbm(noise2D_base, warpedX, warpedZ, baseOctaves, basePersistence, baseScale);
    height += baseHeight * baseAmplitude;

    // medium detail layer (2)
    const mediumScale = 0.03;
    const mediumOctaves = 4;
    const mediumPersistence = 0.4;
    const mediumAmplitude = 8.0;
    let mediumHeight = fbm(noise2D_detail, warpedX * 0.8, warpedZ * 0.8, mediumOctaves, mediumPersistence, mediumScale);
    height += mediumHeight * mediumAmplitude;


    // fine detail layer (3)
    const fineScale = 0.1;
    const fineOctaves = 3;
    const finePersistence = 0.3;
    const fineAmplitude = 1.5;
    let fineDetail = fbm(noise2D_detail, x, z, fineOctaves, finePersistence, fineScale);
    height += fineDetail * fineAmplitude;

    let preHeight = height;
    // shaping
    if (height > 0) {
        height = Math.pow(height, 1.25);
        if (!isFinite(height)) height = preHeight;
    } else {
        height = -Math.pow(Math.abs(height), 0.9); // lower value ( val < 1) 'broadens' valleys between mountains
    }

    const minHeight = -75.0;
    const maxHeight = 200.0;
    height = Math.max(minHeight, Math.min(height, maxHeight));

    return height;
}
