precision highp float; // Good practice for floats

// Uniforms from JavaScript
uniform sampler2D grassTexture;
uniform sampler2D rockTexture;
uniform sampler2D snowTexture;
uniform sampler2D sandTexture;
// Add other texture uniforms...

// Lighting Uniforms
uniform vec3 ambientLightColor;
// Direction *TO* the light source (pre-normalized in world space)
uniform vec3 directionalLightDirection;
uniform vec3 directionalLightColor;

// Varyings from Vertex Shader
varying vec2 vUv;
varying float vBiome;
varying vec3 vNormalWorld; // World normal
varying vec3 vPositionWorld; // World position

// Biome IDs (match noise.js)
const float BIOME_OCEAN = 0.0;
const float BIOME_BEACH = 1.0;
const float BIOME_GRASSLAND = 2.0;
const float BIOME_FOREST = 3.0;
const float BIOME_ROCKY = 4.0;
const float BIOME_SNOW = 5.0;

const vec2 grassRepeat = vec2(16.0, 16.0);
const vec2 rockRepeat = vec2(8.0, 8.0);
const vec2 snowRepeat = vec2(12.0, 12.0);
const vec2 sandRepeat = vec2(8.0, 8.0);

void main() {
    vec4 texColor = vec4(0.8, 0.8, 0.8, 1.0); // Default grey

   // --- Texture Selection ---
   float biomeId = floor(vBiome + 0.5); // Use floor to handle potential interpolation

    if (biomeId == BIOME_BEACH) {
        texColor = texture2D(sandTexture, vUv * sandRepeat);
    } else if (biomeId == BIOME_ROCKY) {
        texColor = texture2D(rockTexture, vUv * rockRepeat);
    } else if (biomeId == BIOME_SNOW) {
        texColor = texture2D(snowTexture, vUv * snowRepeat);
    } else if (biomeId == BIOME_FOREST) {
        texColor = texture2D(grassTexture, vUv * grassRepeat) * vec4(0.7, 0.9, 0.7, 1.0); // Forest tint
    } else if (biomeId == BIOME_GRASSLAND) {
        texColor = texture2D(grassTexture, vUv * grassRepeat);
    }
    // Ignore OCEAN for terrain texture

    // --- Basic World-Space Lambertian Lighting ---
    vec3 normal = normalize(vNormalWorld); // Use world normal
    // Assuming directionalLightDirection is the direction *TO* the light
    float lightIntensity = max(dot(normal, directionalLightDirection), 0.0);
    vec3 diffuseColor = texColor.rgb * directionalLightColor * lightIntensity;

    // Combine with ambient light
    vec3 finalColor = texColor.rgb * ambientLightColor + diffuseColor;

    // Apply gamma correction (approximate) if not using SRGB output encoding
    // finalColor = pow(finalColor, vec3(1.0/2.2));

    gl_FragColor = vec4(finalColor, texColor.a);
}