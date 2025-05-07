// noise.js
import { makeNoise2D } from 'open-simplex-noise';

// Initialize noise functions. Using different seeds can create more variation
// if you use multiple noise2D instances for different purposes.

// --- Using fixed seeds for debugging ---
const BASE_SEED = performance.now();
const WARP_SEED = BASE_SEED + 1;
const DETAIL_SEED = BASE_SEED + 2;
const RIDGE_SEED = BASE_SEED + 3;
const TEMP_SEED = BASE_SEED + 4;
const MOISTURE_SEED = BASE_SEED + 5;

const noise2D_base = makeNoise2D(BASE_SEED);
const noise2D_warp = makeNoise2D(WARP_SEED);
const noise2D_detail = makeNoise2D(DETAIL_SEED);
const noise2D_ridge = makeNoise2D(RIDGE_SEED);
const noise2D_temp = makeNoise2D(TEMP_SEED);
const noise2D_moist = makeNoise2D(MOISTURE_SEED);


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

function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t); //  3t^2 - 2t^3
    // alternative - perlin smoothstep
    // return t * t * t * (t * (6.0 * t - 15.0) + 10.0); // 6t^5 - 15t^4 + 10t^3
  }

/**
 * @param {*} h height
 * @param {*} m moisture level [0, 1]
 * @param {*} t temp level [0, 1]
 * @returns BIOME_ID
 */
function determineBiome(h, m, t) {
        // threshhold values
        const waterLevel = 1.0;         
        const beachLevelMax = waterLevel + 1.5;
        const forestMoistureMin = 0.5;
        const grasslandMoistureMin = 0.25;
        const treeLineTempMax = 0.3
        const snowLineHeightMin = 55.0;
        const rockyHeightMin = 40.0;
        const coldSnowTemp = treeLineTempMax - 0.1;
    
        if (h < waterLevel) return BIOME_ID.OCEAN;
        if (h < beachLevelMax) return BIOME_ID.BEACH;
    
        if (h > snowLineHeightMin) return BIOME_ID.SNOW;
        if (h > rockyHeightMin) {
            // high up, could be rock or snow based on temp
            return (t < coldSnowTemp) ? BIOME_ID.SNOW : BIOME_ID.ROCKY;
        }
        // colder regions
        if (t < treeLineTempMax) {
            return (m > grasslandMoistureMin) ? BIOME_ID.ROCKY : BIOME_ID.GRASSLAND;
        }
        // warmer regions
        if (m > forestMoistureMin) return BIOME_ID.FOREST;
        if (m > grasslandMoistureMin) return BIOME_ID.GRASSLAND;
    
        // default for remaining areas
        return BIOME_ID.ROCKY;
}

/**
 * Generates height for terrain.
 * @param {number} x 
 * @param {number} z 
 * @returns {number}
 */
export function genTerrain(x, z) {
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

    // ridge layer (1.5)
    const ridgeScale = 0.015;
    const ridgeOctaves = 5;
    const ridgePersistence = 0.45;
    const ridgeAmplitude = 25.0;
    // abs() help create V-shapes -- 'ridged fractal noise'
    let ridgeTurbulence = Math.abs(fbm(noise2D_ridge, warpedX, warpedZ, ridgeOctaves, ridgePersistence, ridgeScale));
    // Add ridges more prominently on already higher terrain
    if (baseHeight > 0.2) {
         height += ridgeTurbulence * ridgeAmplitude * baseHeight;
    }

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
        height = -Math.pow(Math.abs(height), 0.8); // lower value ( val < 1) 'broadens' valleys between mountains
    }

    // biomes
    const tempScale = 0.003;
    const moistScale = 0.009;
    const baseTemp = (fbm(noise2D_temp, x, z, 3, 0.5, tempScale) + 1) / 2; // normalized
    const heightTempFactor = 0.01; // how much temp drops per unit height
    const temperature = Math.max(0, Math.min(1, baseTemp - (Math.max(0, height) * heightTempFactor)));
    const moisture = (fbm(noise2D_moist, x + 1000, z - 1000, 4, 0.4, moistScale) + 1) / 2; // normalized
    
    const biome = determineBiome(height, moisture, temperature);
    
    if (biome === BIOME_ID.BEACH) {
        height = smoothstep(1.0, 1.0 + 1.5, height);
    } else if (biome === BIOME_ID.OCEAN) {
       height = Math.min(height, -5); // strange behavior here
    }

    const minHeight = -75.0;
    const maxHeight = 250.0;
    height = Math.max(minHeight, Math.min(height, maxHeight));

    //return height;
    return { height: height, biome: biome };
}


export const BIOME_ID = {
    OCEAN: 0.0,     // deep water
    BEACH: 1.0,     // sand near water
    GRASSLAND: 2.0, // standard plains
    FOREST: 3.0,    // wooded/more populated areas
    ROCKY: 4.0,     // exposed rock, mountainsides
    SNOW: 5.0       // high elevation / cold areas
};