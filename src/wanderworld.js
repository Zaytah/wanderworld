import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';

import { OrbitControls } from 'three/examples/jsm/Addons.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

import { ChunkManager } from './terrain.js';
import { Player, InputController } from './utils.js';


let scene, camera, renderer, controls;
let sky, sun, elevation, azimuth;
let player, chunkManager, input;

const clock = new THREE.Clock();
const PLAYER_MODEL_SCALE = 0.005;

function runApp() {
    init();
}

function init() {

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
            
    controls = new OrbitControls( camera, renderer.domElement );
    camera.position.set(-20, 10, 0);
    //camera.lookAt(new THREE.Vector3(, , ));
    controls.update();
    
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
        scale: PLAYER_MODEL_SCALE
    });

    input = new InputController();

    chunkManager = new ChunkManager({
        scene: scene,
        player: player
    });

}


function animate() {

     /* 
     sky has position attribute type THREE.Vector3() to constantly move with player (or the attributes on GUI sliders https://threejs.org/examples/?q=shader#webgl_shaders_sky)
     */

    requestAnimationFrame(() => {
        controls.update();
        if (chunkManager) chunkManager.update();
        renderer.render(scene, camera);
        player.update(input);
        updateCamera();
        animateSky();
        animate();
    });
}

function updateCamera() {
    const target = player.getPosition();
    const cameraOffset = new THREE.Vector3(0, 4, -7);
    const targetPosition = target.clone().add(cameraOffset);
    camera.position.lerp(targetPosition, 0.1); // speed the camera 'corrects' itself
    // console.log("PLAYER: ", target, " TARGET: ", targetPosition);
    camera.lookAt(targetPosition);
}

function animateSky() {
    const time = clock.getElapsedTime();
    const dayLength = 10; // in seconds

    const t = (time % dayLength) / dayLength; // in-game 'time' in range [0,1]

    elevation = Math.sin(t * 2 * Math.PI) * 25 + 10; // sun elevation in range [-10, 25]
    azimuth = t * 360; // rotate sun 360 degrees
    const phi = THREE.MathUtils.degToRad( 90 - elevation );
    const theta = THREE.MathUtils.degToRad( azimuth );
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sun);

    // move with player to keep world 'infinite'
}

window.addEventListener('DOMContentLoaded', () => {
    runApp();
});
