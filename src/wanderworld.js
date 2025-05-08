// wanderworld.js
import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import RAPIER from '@dimforge/rapier3d-compat'

import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { ChunkManager } from './terrain.js';
import { Player, InputController } from './utils.js';
import { ThirdPersonCamera } from './ThirdPersonCamera.js';

const DEBUG = false;

let scene, camera, renderer, world, composer;
let sky, sun, elevation, azimuth, hemisphereLight, directionalLight;
let player, chunkManager, cameraSystem, input;
let debugMaterial, debugGeometry, debugMesh;

const clock = new THREE.Clock();
const PLAYER_MODEL_SCALE = 1;

async function runApp() {
    await RAPIER.init();
    await init();
    animate();
}

async function init() {

    if ( !WebGL.isWebGL2Available() ) {
        const warning = WebGL.getWebGL2ErrorMessage();
        document.getElementById( 'container' ).appendChild( warning );
    }

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.77;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const fov = 70;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 5000;
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

    const gravity = new RAPIER.Vector3(0.0, -10, 0.0);
    world = new RAPIER.World(gravity);

    scene = new THREE.Scene();

    lighting();
    scenery();
    postprocessing();
}

function lighting() {
    hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 1.4);
    scene.add(hemisphereLight);
    scene.add(new THREE.AmbientLight(0xffffbb, 0.6));
    
    directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    //console.log(directionalLight);
    directionalLight.position.set(100, 500, 100);
    directionalLight.castShadow = true;
    // shadow box
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    scene.fog = new THREE.Fog( 0x99DDFF, 5000, 10000 );

    sky = new Sky();
    sky.scale.setScalar( 450000 );
    scene.add( sky );

    // sky material uniform values
    sky.material.uniforms.mieCoefficient.value = 0.005;
    sky.material.uniforms.mieDirectionalG.value = 0.85;
    sky.material.uniforms.turbidity.value = 5;
    sky.material.uniforms.rayleigh.value = 2;
    
    sun = new THREE.Vector3();
    elevation = 4;
    azimuth = 180; // angle to 'rotate' sun on same level of elevation
    const phi = THREE.MathUtils.degToRad( 90 - elevation );
    const theta = THREE.MathUtils.degToRad( azimuth );
    sun.setFromSphericalCoords( 1, phi, theta );
    sky.material.uniforms[ 'sunPosition' ].value.copy( sun );
    
    //console.log(sky);

}

async function scenery() {

    player = new Player({
        scene: scene,
        scale: PLAYER_MODEL_SCALE,
        world: world
    });
    input = new InputController();

    cameraSystem = new ThirdPersonCamera({
        camera: camera,
        target: player,
        scene: scene
    });
    player.setCamera(cameraSystem);

    chunkManager = new ChunkManager({
        scene: scene,
        player: player,
        world: world,
        lights: {directional: directionalLight, hemisphere: hemisphereLight}
    });

    try {
        await chunkManager.initialize();
        console.log("Terrain generated -- World starting.");
    } catch (error) {
        console.error("Failed to initialize ChunkManager. World cannot start.", error);
    }

    if (DEBUG) {

        const geometry = new THREE.BoxGeometry( 1, 1, 1 );
        const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
        const cube = new THREE.Mesh( geometry, material );
        cube.position.set(5, 0, 5);
        scene.add( cube );
    
        let rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
        let cubeBody = world.createRigidBody(rigidBodyDesc);
        let colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
        world.createCollider(colliderDesc, cubeBody);

        debugMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true });
        debugGeometry = new THREE.BufferGeometry();
        debugMesh = new THREE.LineSegments(debugGeometry, debugMaterial);
        debugMesh.frustumCulled = false; // Prevent it from being culled by the camera
        scene.add(debugMesh);
    }

}

// bloom effect
function postprocessing() {

    composer = new EffectComposer(renderer);
    let renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    let width = window.innerWidth;
    let height = window.innerHeight;

    let bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);

    bloomPass.strength = 2.0;
    bloomPass.radius = 0.1;
    bloomPass.threshold = 0.3;
}


function animate() {

    requestAnimationFrame(animate);

        const dt = clock.getDelta();
        world.step();
        if (chunkManager) chunkManager.update(dt);
        if (cameraSystem) cameraSystem.update(dt);
        if (player && player.mesh && player.playerBody) player.update(input, dt);
        animateSky();
        composer.render();
        //renderer.render(scene, camera);

        if (DEBUG) {
            updateDebug();
        }
        
}

function animateSky() {
    const time = clock.getElapsedTime();
    const dayLength = 240; // in seconds

    const t = (time % dayLength) / dayLength; // in-game 'time' in range [0,1]

    elevation = Math.sin(t * 2 * Math.PI) * 25 + 10; // sun elevation in range [-10, 25]
    azimuth = t * 360; // rotate sun 360 degrees
    const phi = THREE.MathUtils.degToRad( 90 - elevation );
    const theta = THREE.MathUtils.degToRad( azimuth );
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sun);

    // move directionalLight with sun
    const MIN_ELEVATION = -10.0;
    const MAX_ELEVATION = 25.0;
    const MIN_INTENSITY = 0.75;
    const MAX_INTENSITY = 5.2;
    
    let normalizedElevation = (elevation - MIN_ELEVATION) / (MAX_ELEVATION - MIN_ELEVATION);
    normalizedElevation = Math.max(0, Math.min(1, normalizedElevation));
    let intensity = MIN_INTENSITY + normalizedElevation * (MAX_INTENSITY - MIN_INTENSITY);
    intensity = Math.max(0.1, intensity);
    
    if (directionalLight) {
        directionalLight.intensity = intensity;
        directionalLight.position.copy(sun).multiplyScalar(100);
    }

}

window.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
});

window.addEventListener('DOMContentLoaded', () => {
    runApp();
});


// updates physics debug geo/meshes
function updateDebug() {
  const { vertices, colors } = world.debugRender();

  debugGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  debugGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

  debugMesh.visible = true;
}