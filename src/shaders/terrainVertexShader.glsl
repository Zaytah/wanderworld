// Attributes from BufferGeometry
attribute float biome;
attribute vec3 position;
attribute vec2 uv;
attribute vec3 normal;

// Uniforms from THREE.js / JavaScript
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform mat4 modelMatrix; // Pass modelMatrix for world space calculations

// Varyings sent to Fragment Shader
varying vec2 vUv;
varying float vBiome;
varying vec3 vNormalWorld; // Pass world normal
varying vec3 vPositionWorld; // Pass world position

void main() {
    vUv = uv;
    vBiome = biome; // Pass biome ID along

    // Calculate world position and normal
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vPositionWorld = worldPosition.xyz;
    vNormalWorld = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal ); // More robust world normal calculation

    // Calculate final screen position
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}