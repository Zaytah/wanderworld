precision highp float;

// Textures
uniform sampler2D grassTexture;
uniform sampler2D rockTexture;
uniform sampler2D snowTexture;
uniform sampler2D sandTexture;
uniform sampler2D dryBasinTexture;

// Lighting
uniform vec3 ambientLightColor;
uniform vec3 directionalLightDirection;
uniform vec3 directionalLightColor;

varying vec2 vUv;
varying float vBiome;
varying vec3 vNormalWorld;
varying vec3 vPositionWorld;

const float WATER_LEVEL = -6.0;
const float BEACH_LEVEL_MAX = -4.5; 
const float GRASS_LEVEL_MAX = 25.0; 
const float ROCK_LEVEL_MAX = 55.0; 

const float BEACH_GRASS_BLEND = 1.5;
const float GRASS_ROCK_BLEND = 10.0;
const float ROCK_SNOW_BLEND = 12.0;

const vec2 repeatVal = vec2(20.0, 20.0);

void main() {
    vec4 finalTexColor = vec4(0.8, 0.8, 0.8, 1.0);
    float height = vPositionWorld.y;

    vec4 sandColor = texture2D(sandTexture, vUv * repeatVal);
    vec4 grassColor = texture2D(grassTexture, vUv * repeatVal);
    vec4 rockColor = texture2D(rockTexture, vUv * repeatVal);
    vec4 snowColor = texture2D(snowTexture, vUv * repeatVal);

    // Blend between Sand and Grass
    float sandGrassFactor = smoothstep(BEACH_LEVEL_MAX - BEACH_GRASS_BLEND / 2.0,
                                       BEACH_LEVEL_MAX + BEACH_GRASS_BLEND / 2.0,
                                       height);
    // Blend between Grass and Rock
    float grassRockFactor = smoothstep(GRASS_LEVEL_MAX - GRASS_ROCK_BLEND / 2.0,
                                       GRASS_LEVEL_MAX + GRASS_ROCK_BLEND / 2.0,
                                       height);
    // Blend between Rock and Snow
    float rockSnowFactor = smoothstep(ROCK_LEVEL_MAX - ROCK_SNOW_BLEND / 2.0,
                                      ROCK_LEVEL_MAX + ROCK_SNOW_BLEND / 2.0,
                                      height);


    finalTexColor = sandColor;
    finalTexColor = mix(finalTexColor, grassColor, sandGrassFactor);
    finalTexColor = mix(finalTexColor, rockColor, grassRockFactor);
    finalTexColor = mix(finalTexColor, snowColor, rockSnowFactor);

    // darken texture in 'forest' biome (mixed results)
    float biomeId = floor(vBiome + 0.5);
    const float BIOME_FOREST = 3.0;
    if (biomeId == BIOME_FOREST && height > BEACH_LEVEL_MAX + BEACH_GRASS_BLEND / 2.0) {
        finalTexColor *= vec4(0.1, 0.7, 0.1, 1.0);
    }

    vec3 normal = normalize(vNormalWorld);
    float lightIntensity = max(dot(normal, directionalLightDirection), 0.0);
    vec3 diffuseColor = finalTexColor.rgb * directionalLightColor * lightIntensity;
    vec3 finalLightingColor = finalTexColor.rgb * ambientLightColor + diffuseColor;

    if (height < WATER_LEVEL) {
         // If water plane covers this, make terrain black/transparent or very dark blue
         gl_FragColor = vec4(0.0, 0.07, 0.1, 1.0);
    } else {
        gl_FragColor = vec4(finalLightingColor, finalTexColor.a);
    }

}
