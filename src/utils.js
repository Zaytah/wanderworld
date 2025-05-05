import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEFAULT_SPEED = 3.75; // 0.25;
const SPRINT_SPEED = 5.25; // 0.4;
const LATERAL_SPEED = 0.6; // 0.2;

export class Player {
    constructor(params) {
        this.mesh = null;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.mixer = null;
        this.speed = DEFAULT_SPEED;
        this.scale = params.scale;
        this.world = params.world;

        this.loadModel(params);
    }

    loadModel(params) {
        const loader = new GLTFLoader();
        const size = new THREE.Vector3(params.scale, params.scale, params.scale);
        loader.load(
            'public/models/bananacat/scene.gltf',
            (gltf) => {
                this.mesh = gltf.scene;
                this.mesh.scale.set(1, 1, 1);
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.material.color = new THREE.Color(1.5, 1.5, 1.5);
                        child.castShadow = true;
                    }
                });
                this.mesh.position.set(5, 0, 5);
                this.position = this.mesh.position;
                const gltfAnimations = gltf.animations;
                this.mixer = new THREE.AnimationMixer(this.mesh);
                const animationsMap = new Map();
                
                params.scene.add(this.mesh);
                this.initPhysics();
            },
            (xhr) => {
                console.log( 'Player: ' + (xhr.loaded / xhr.total * 100) + '% loaded.');
            }
        );
    }

    update(input) {
        if (!this.mesh || !this.playerBody) return;

        this.direction.set(0, 0, 0);

        if (input.forward) this.direction.z += 1;
        if (input.backward) this.direction.z -= 1;
        if (input.left) this.direction.x += 1;
        if (input.right) this.direction.x -= 1;
    
        this.speed = (input.left || input.right || input.backward) ?  LATERAL_SPEED : DEFAULT_SPEED;
        // player can only sprint when moving forward
        this.speed = (input.sprint && input.forward) ? SPRINT_SPEED : DEFAULT_SPEED;
        
        //console.log(this.direction);

        this.direction.normalize();
        this.velocity.copy(this.direction).multiplyScalar(this.speed);
        //let target = this.mesh.position.clone().add(this.velocity);
        //this.mesh.position.lerp(target, 0.2);
        let currentVelocity = this.playerBody.linvel();
        this.playerBody.setLinvel({x: this.velocity.x, y: currentVelocity.y, z: this.velocity.z}, true);

        const pos = this.playerBody.translation();
        const rot = this.playerBody.rotation();
        this.mesh.position.set(pos.x, pos.y, pos.z);
        this.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    }

    initPhysics() {
        const playerHeight = 1.6;
        const playerRadius = 0.3;
        let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(5.0, 3.0, 5.0)
            .setLinearDamping(0.1)
            .setAngularDamping(1.0);
        this.playerBody = this.world.createRigidBody(rigidBodyDesc);
        this.playerBody.setEnabledRotations(false, false, false);
        let colliderDesc = RAPIER.ColliderDesc.capsule(playerHeight / 2, playerRadius);
        this.world.createCollider(colliderDesc, this.playerBody);
    }

    getPosition() {
        return this.mesh ? this.mesh.position : new THREE.Vector3(0, 0, 0);
    }

    getQuaternion() {
       return this.mesh ? this.mesh.quaternion : new THREE.Vector3(0, 0, 0);
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