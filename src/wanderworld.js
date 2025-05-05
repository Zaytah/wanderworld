import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import RAPIER from '@dimforge/rapier3d-compat'
import wasmUrl from '@dimforge/rapier3d/rapier_wasm3d_bg.wasm?url';

import { Sky } from 'three/examples/jsm/objects/Sky.js';

import { ChunkManager } from './terrain.js';
import { Player, InputController } from './utils.js';
import { ThirdPersonCamera } from './ThirdPersonCamera.js';


let scene, camera, renderer, world;
let sky, sun, elevation, azimuth;
let player, chunkManager, cameraSystem, input;
let debugMaterial, debugGeometry, debugMesh;

const clock = new THREE.Clock();
const PLAYER_MODEL_SCALE = 0.005;

async function runApp() {
    await RAPIER.init();

    init();
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
    renderer.toneMappingExposure = 0.5;

    const fov = 70;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 5000;
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.set(-20, 10, 0);

    const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
    world = new RAPIER.World(gravity);

    scene = new THREE.Scene();

    lighting();
    scenery();
    renderer.setAnimationLoop(animate());
}

function lighting() {
    /*
        Should adjust lighting with sun/sky animation to be more accurate
    */
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    sky = new Sky();
    sky.scale.setScalar( 450000 );
    scene.add( sky );

    // sky material uniform values
    sky.material.uniforms.mieCoefficient.value = 0.0005;
    sky.material.uniforms.mieDirectionalG.value = 0.99;
    sky.material.uniforms.turbidity.value = 2;
    sky.material.uniforms.rayleigh.value = 1;
    
    sun = new THREE.Vector3();
    elevation = 2;
    azimuth = 180; // angle to 'rotate' sun on same level of elevation
    const phi = THREE.MathUtils.degToRad( 90 - elevation );
    const theta = THREE.MathUtils.degToRad( azimuth );
    sun.setFromSphericalCoords( 1, phi, theta );
    sky.material.uniforms[ 'sunPosition' ].value.copy( sun ); // sky.material.uniforms.sunPosition.value.copy(sun);
    camera.lookAt(sun);
    
    console.log(sky);
    console.log(sky.material.uniforms);

}

function scenery() {

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

    chunkManager = new ChunkManager({
        scene: scene,
        player: player,
        world: world
    });

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


function animate() {

    requestAnimationFrame(() => {
        const timeElapsed = clock.getDelta();
        world.step();
        if (chunkManager) chunkManager.update();
        renderer.render(scene, camera);
        if (player.mesh) player.update(input);
        if (cameraSystem) cameraSystem.update(timeElapsed);
        animateSky();
        animate();
        updateDebug();

    });
}

function animateSky() {
    const time = clock.getElapsedTime();
    const dayLength = 1200; // in seconds

    const t = (time % dayLength) / dayLength; // in-game 'time' in range [0,1]

    elevation = Math.sin(t * 2 * Math.PI) * 25 + 10; // sun elevation in range [-10, 25]
    azimuth = t * 360; // rotate sun 360 degrees
    const phi = THREE.MathUtils.degToRad( 90 - elevation );
    const theta = THREE.MathUtils.degToRad( azimuth );
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sun);

    // move with player to keep world 'infinite'
}

window.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
});

window.addEventListener('DOMContentLoaded', () => {
    runApp();
});



// Update the debug shapes in your animation loop
function updateDebug() {
  const { vertices, colors } = world.debugRender(); // Get the vertices and colors for debug shapes

  // Update the geometry with the new vertices and colors
  debugGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  debugGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

  // Set the visibility of the debug mesh based on your needs
  debugMesh.visible = true;  // You can toggle this based on a debug flag
}