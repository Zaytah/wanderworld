import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEFAULT_SPEED = 0.25;
const SPRINT_SPEED = 0.4;

export class Player {
    constructor(params) {
        this.mesh = null;
        //this.mixer = null; // animations?
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.speed = DEFAULT_SPEED;

        this.loadModel(params);
    }

    loadModel(params) {
        const loader = new GLTFLoader();
        const size = new THREE.Vector3(params.scale, params.scale, params.scale);
        loader.load(
            'public/models/low-poly_sekiro/scene.gltf',
            (gltf) => {
                this.mesh = gltf.scene;
                this.mesh.scale.set(size.x, size.y, size.z);
                this.mesh.position.set(0, 0, 0);
                this.position = this.mesh.position;
                params.scene.add(this.mesh);
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
    
        // player can only sprint when moving forward
        this.speed = (input.sprint && input.forward) ? SPRINT_SPEED : DEFAULT_SPEED;
        
        //console.log(this.direction);

        this.direction.normalize();
        this.velocity.copy(this.direction).multiplyScalar(this.speed);
        this.mesh.position.add(this.velocity);
    }

    getPosition() {
        return this.mesh ? this.mesh.position : new THREE.Vector3(0, 0, 0);
    }
}

export class InputController {
    constructor() {
        this.forward = false;
        this.backward = false;
        this.left = false;
        this.right = false;
        this.sprint = false;

        window.addEventListener('keydown', (event) => this.onKeyPress(event, true) );
        window.addEventListener('keyup', (event) => this.onKeyPress(event, false) );
    }

    onKeyPress(event, state) {
        switch (event.code) {
            case 'KeyW': this.forward = state; break;
            case 'KeyS': this.backward = state; break;
            case 'KeyA': this.left = state; break;
            case 'KeyD': this.right = state; break;
            case 'KeyR': this.sprint = state; break;
        }
    }

}