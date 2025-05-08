attribute float biome;

varying vec2 vUv;
varying float vBiome;
varying vec3 vNormalWorld;
varying vec3 vPositionWorld;

void main() {
    vUv = uv;
    vBiome = biome;

    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vPositionWorld = worldPosition.xyz;
    vNormalWorld = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );

    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}