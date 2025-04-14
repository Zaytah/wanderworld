import { makeNoise2D } from 'open-simplex-noise'; // noise2D(x, y) gives random value in range [-1, 1]

const noise2D = makeNoise2D(performance.now());

/* needs more testing, different functions might be better */

/**
 * Basic Fractional Brownian Motion Function
 * @param {*} x 
 * @param {*} y 
 * @param {*} octaves Layers of Noise
 * @param {*} persistence How much to scale amplitude per octave
 * @param {*} scale How zoomed out the noise is in first octave
 * @returns 
 */
export function fbm(x, y, octaves = 6, persistence = 0.35, scale = 0.05) { 
    let total = 0, amplitude = 1, maxValue = 0;
    for (let i = 0; i < octaves; i++) {
        total += noise2D(x * scale, y * scale) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        scale *= 2;
    }

    return total / maxValue;
}