import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';

import { OrbitControls } from 'three/examples/jsm/Addons.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { makeNoise2D } from 'open-simplex-noise'; // noise2D(x, y) gives random value in range [-1, 1]

const PLAYER_MODEL_SCALE = 0.005;

let scene, camera, renderer, controls;
let sky, sun;
let player, chunkManager, input;

const noise2D = makeNoise2D(performance.now());

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
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(5, 10, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    sky = new Sky();
    sky.scale.setScalar( 450000 );
    scene.add( sky );

    // sky material uniform values
    sky.material.uniforms.mieCoefficient.value = 0.003;
    //sky.material.uniforms.mieDirectionalG.value = ;
    //sky.material.uniforms.turbidity.value = ;
    //sky.material.uniforms.rayleigh.value = ;
    
    sun = new THREE.Vector3();
    let elevation = 2;
    let azimuth = 180; // angle to 'rotate' sun on same level of elevation
    const phi = THREE.MathUtils.degToRad( 90 - elevation );
    const theta = THREE.MathUtils.degToRad( azimuth );
    sun.setFromSphericalCoords( 1, phi, theta );
    sky.material.uniforms[ 'sunPosition' ].value.copy( sun ); // sky.material.uniforms.sunPosition.value.copy(sun);
    camera.lookAt(sun);
    
    console.log(sky);
    console.log(sky.material.uniforms);

}

function scenery() {

    //let chunk = new TerrainChunk({scale: 4, width: 4});
    //chunk.addChunk();

    player = new Player();
    input = new InputController();
    chunkManager = new ChunkManager();

}


function animate() {

     /* 
     sky has position attribute type THREE.Vector3() to constantly move with player (or the attributes on GUI sliders https://threejs.org/examples/?q=shader#webgl_shaders_sky)
    
     */
     

    requestAnimationFrame(() => {
        controls.update();
        // if (chunkManager) chunkManager.update();
        renderer.render(scene, camera);
        player.update(input);
        //updateCamera();
        animate();
    });
}

window.addEventListener('DOMContentLoaded', () => {
    runApp();
});

class TerrainChunk {
    constructor(params) {
        this.group = params.group;
        this._Init(params);
    }

    _Init(params) {
        const size = new THREE.Vector3(params.chunkSize, 0, params.chunkSize);
        let planeGeometry = new THREE.PlaneGeometry(size.x, size.z, params.res, params.res);
        planeGeometry.rotateX(-Math.PI / 2);
        this.plane = new THREE.Mesh(
            planeGeometry,
            new THREE.MeshStandardMaterial({
                wireframe: true,
                color: 0xFFFFFF,
                side: THREE.DoubleSide,
                //vertexColors: THREE.VertexColors
            }));
    
        const vertices = this.plane.geometry.attributes.position;
        /* would need to lerp between chunks next to each other and rand is different */
        // let rand = Math.floor(Math.random() * 10) + 1;
        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i) + size.x * params.chunkX;
            const z = vertices.getZ(i) + size.z * params.chunkZ;
            const y = fbm(x, z) * 5;
            vertices.setY(i, y);
        }

        vertices.needsUpdate = true;
        this.plane.geometry.computeVertexNormals();
        
    }

    addChunk() {
        this.group.add(this.plane);
    }
}

class ChunkManager {
    constructor() {
        this.chunkSize = 32;
        this.renderDistance = 4;
        this.resolution = 128; // # of 'intermediate' lines for each chunk
        this._Init();
    }

    _Init() {
        this.chunks = new Map();
        this.group = new THREE.Group();

        const playerPos = player.getPosition();
        const currentChunkX = Math.floor(playerPos.x / this.chunkSize);
        const currentChunkZ = Math.floor(playerPos.z / this.chunkSize);

        for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
            for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
                let cx = currentChunkX + dx;
                let cz = currentChunkZ + dz;
                let key = this.getChunkKey(cx, cz);
        
                if (!this.chunks.has(key)) {
                    let chunk = new TerrainChunk({
                        chunkSize: this.chunkSize,
                        chunkX: cx,
                        chunkZ: cz,
                        res: this.resolution,
                        group: this.group
                    });
                    chunk.plane.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
                    this.chunks.set(key, chunk);
                    chunk.addChunk();
                }
            }
        }
        scene.add(this.group);
    }

    update() {
        const playerPos = player.getPosition();
        const currentChunkX = Math.floor(playerPos.x / this.chunkSize);
        const currentChunkZ = Math.floor(playerPos.z / this.chunkSize);

        const neededChunks = new Set();

        for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
            for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
                let cx = currentChunkX + dx;
                let cz = currentChunkZ + dz;
                let key = this.getChunkKey(cx, cz);
                neededChunks.add(key);
            }
        }
        

        for (chunk in this.chunks) {
            this.group.add(chunk);
        }
        console.log(this.group);

    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }
}

/**
 * 
 * @param {*} x 
 * @param {*} y 
 * @param {*} octaves Layers of Noise
 * @param {*} persistence How much to scale amplitude per octave
 * @param {*} scale How zoomed out the noise is in first octave
 * @returns 
 */
function fbm(x, y, octaves = 5, persistence = 0.20, scale = 0.05) { 
    let total = 0, amplitude = 1, maxValue = 0;
    for (let i = 0; i < octaves; i++) {
        total += noise2D(x * scale, y * scale) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        scale *= 2;
    }

    return total / maxValue;
}

class Player {
    constructor() {
        this.mesh = null;
        this.mixer = null; // animations?
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.speed = 0.25;

        this.loadModel();
    }

    loadModel() {
        const loader = new GLTFLoader();
        const size = new THREE.Vector3(PLAYER_MODEL_SCALE, PLAYER_MODEL_SCALE, PLAYER_MODEL_SCALE);
        loader.load(
            'public/models/low-poly_sekiro/scene.gltf',
            (gltf) => {
                this.mesh = gltf.scene;
                this.mesh.scale.set(size.x, size.y, size.z);
                this.mesh.position.set(0, 0, 0);
                this.position = this.mesh.position;
                scene.add(this.mesh);
            },
            (xhr) => {
                console.log( 'Player: ' + (xhr.loaded / xhr.total * 100) + '% loaded.');
            }
        );
    }

    update(input) {
        if (!this.mesh) return;

        this.direction.set(0, 0, 0);

        if (input.forward) this.direction.z += 1;
        if (input.backward) this.direction.z -= 1;
        if (input.left) this.direction.x += 1;
        if (input.right) this.direction.x -= 1;
        
        //console.log(this.direction);

        this.direction.normalize();
        this.velocity.copy(this.direction).multiplyScalar(this.speed);
        this.mesh.position.add(this.velocity);
    }

    getPosition() {
        return this.mesh ? this.mesh.position : new THREE.Vector3(0, 0, 0);
    }
}

function updateCamera() {
    const target = player.getPosition();
    const cameraOffset = new THREE.Vector3(0, 4, -7);
    const targetPosition = target.clone().add(cameraOffset);
    camera.position.lerp(targetPosition, 0.1); // speed the camera 'corrects' itself
    camera.lookAt(targetPosition);
}

class InputController {
    constructor() {
        this.forward = false;
        this.backward = false;
        this.left = false;
        this.right = false;

        window.addEventListener('keydown', (event) => this.onKeyPress(event, true) );
        window.addEventListener('keyup', (event) => this.onKeyPress(event, false) );
    }

    onKeyPress(event, state) {
        switch (event.code) {
            case 'KeyW': this.forward = state; break;
            case 'KeyS': this.backward = state; break;
            case 'KeyA': this.left = state; break;
            case 'KeyD': this.right = state; break;
        }
    }

}