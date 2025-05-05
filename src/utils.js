// utils.js
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEFAULT_SPEED = 3.75;
const SPRINT_SPEED = 5.25;
const LATERAL_SPEED = 3.0;

const ANIM_FADE_DURATION = 0.2; // in seconds
const SPRINT_ANIMATION_SPEED = SPRINT_SPEED / DEFAULT_SPEED; 
const MODEL_OFFSET_Y = 0.05;

export class Player {
    constructor(params) {
        this.mesh = null;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.speed = DEFAULT_SPEED;
        this.scale = params.scale; // Visual scale factor
        this.world = params.world;
        this.playerBody = null;
        this.position = new THREE.Vector3(5, 0, 5); // Keep track of visual position

        // Animation
        this.mixer = null;          // THREE.AnimationMixer
        this.animations = new Map(); // Store clips by name <string, THREE.AnimationClip>
        this.actions = new Map();   // Store actions by name <string, THREE.AnimationAction>
        this.currentState = 'bananaBones|idle'; // Track current animation state ('idle', 'walk', 'run', 'wave')
        this.currentAction = null;  // The currently playing THREE.AnimationAction

        // Physics
        this.capsuleInfo = {
            height: 1.0, // Adjusted height for bananacat?
            radius: 0.4, // Adjusted radius for bananacat?
            halfHeight: 0,
            offsetY: 0
        };

        this.loadModel(params);
    }

    loadModel(params) {
        const loader = new GLTFLoader();
        loader.load(
            'public/models/bananacat/scene.gltf',
            (gltf) => {
                console.log("GLTF Loaded:", gltf);
                this.mesh = gltf.scene;

                // Visual
                this.mesh.scale.set(1, 1, 1);
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.material.color = new THREE.Color(1.5, 1.5, 1.5);
                        child.castShadow = true;
                        // child.receiveShadow = true;
                    }
                });
                // this.mesh.position.set(5, 0, 5);

                // Animation
                const gltfAnimations = gltf.animations;
                console.log(`Found ${gltfAnimations.length} animations:`);
                this.mixer = new THREE.AnimationMixer(this.mesh);

                gltfAnimations.forEach((clip) => {
                    console.log(`- ${clip.name}`);
                    this.animations.set(clip.name, clip);
                    this.actions.set(clip.name, this.mixer.clipAction(clip));
                });

                // MUST know the exact names of your animations in the GLTF file.
                this.currentAction = this.actions.get('bananaBones|idle'); // idle
                if (this.currentAction) {
                     this.currentAction.play();
                } else {
                     console.warn("Could not find default 'Idle' animation!");
                }


                params.scene.add(this.mesh);
                console.log('Player model added to scene.');
                this.initPhysics(); // Initialize physics AFTER model is loaded

                // Apply visual scale factor AFTER physics init (uses this.scale)
                if (this.mesh && this.scale) {
                    this.mesh.scale.set(this.scale, this.scale, this.scale);
                    console.log('Player visual scale applied:', this.scale);
                }
            },
            (xhr) => {
                console.log( 'Player: ' + (xhr.loaded / xhr.total * 100) + '% loaded.');
            }
        );
    }

    initPhysics() {
        if (!this.mesh) {
            console.error("Attempted to initPhysics before player mesh was loaded!");
            return;
        }
        console.log('Initializing player physics...');

        // capsule properties
        this.capsuleInfo.halfHeight = this.capsuleInfo.height / 2;
        this.capsuleInfo.offsetY = -this.capsuleInfo.halfHeight - this.capsuleInfo.radius + MODEL_OFFSET_Y; // Offset for mesh position

        let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(5.0, 10.0, 5.0)
            .setLinearDamping(0.1)
            .setAngularDamping(1.0);

        this.playerBody = this.world.createRigidBody(rigidBodyDesc);
        this.playerBody.lockRotations(true);

        let colliderDesc = RAPIER.ColliderDesc.capsule(
            this.capsuleInfo.halfHeight,
            this.capsuleInfo.radius
        )
        .setFriction(0.7)
        .setRestitution(0.0);

        this.world.createCollider(colliderDesc, this.playerBody);
        console.log('Player physics body and collider created.');
    }

    update(input, deltaTime) { 
        if (!this.mesh || !this.playerBody || !this.mixer) {
            return;
        }

        // update animation mixer
        this.mixer.update(deltaTime);

        // determine movement and target state
        this.direction.set(0, 0, 0);
        let targetSpeed = 0;
        let nextState = 'bananaBones|idle'; // Default to Idle <<<--- CHECK NAME!

        if (input.forward) this.direction.z += 1;
        if (input.backward) this.direction.z -= 1;
        if (input.left) this.direction.x += 1;
        if (input.right) this.direction.x -= 1;

        const isMoving = this.direction.lengthSq() > 0.01;

        if (isMoving) {
            this.direction.normalize();
            // Determine speed and animation state based on input
            if (input.sprint && input.forward) {
                targetSpeed = SPRINT_SPEED;
                nextState = 'bananaBones|walk'; // run
            } else if (input.forward || input.left || input.right || input.backward) {
                 // Use walk speed if moving forward without sprint OR moving laterally/backward
                 targetSpeed = (input.left || input.right || input.backward) ? LATERAL_SPEED : DEFAULT_SPEED;
                 nextState = 'bananaBones|walk'; // walk
            }
        } else {
            targetSpeed = 0;
            nextState = 'bananaBones|idle'; // idle
        }

        // other animations
        if (input.wave) {
             nextState = 'bananaBones|hiiiiiiiii'; // wave
             input.wave = false; // Reset wave trigger in the input controller after use
        }

        // Physics 
        this.velocity.copy(this.direction).multiplyScalar(targetSpeed);
        let currentVelocity = this.playerBody.linvel();
        this.playerBody.setLinvel({x: this.velocity.x, y: currentVelocity.y, z: this.velocity.z}, true);

        // Sync visual mesh with rapier.js world
        const pos = this.playerBody.translation();
        this.position.set(
            pos.x,
            pos.y + this.capsuleInfo.offsetY,
            pos.z
        );
        this.mesh.position.copy(this.position);

        // update facing direction
        if (isMoving) {
            const angle = Math.atan2(this.direction.x, this.direction.z);
            const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            this.mesh.quaternion.slerp(targetQuaternion, 0.15);
        }

        // transition animations
        if (this.currentState !== nextState) {
            this.playAnimation(nextState);
            this.currentState = nextState;
        }
    }

    playAnimation(name) {
        const nextAction = this.actions.get(name);
        if (!nextAction) {
            console.warn(`Animation action "${name}" not found!`);
            return;
        }

        // fade out current action
        if (this.currentAction && this.currentAction !== nextAction) {
            this.currentAction.fadeOut(ANIM_FADE_DURATION);
        }

        let timeScale = 1;


        // Set up and fade in the next action
        nextAction
            .reset()
            .setEffectiveTimeScale(1)
            .setEffectiveWeight(1)
            .fadeIn(ANIM_FADE_DURATION)
            .play();

        

        // handle 'emotes'
        if (name === 'bananaBones|hiiiiiiiii') { // wave
            nextAction.setLoop(THREE.LoopOnce, 1);
            nextAction.clampWhenFinished = true; // Prevent flickering when finished

            // transition back after wave finishes
            const listener = (event) => {
                if (event.action === nextAction) {
                    // Don't transition if we were interrupted by another state change
                    if (this.currentState === 'bananaBones|hiiiiiiiii') {
                        console.log("Wave finished, returning to Idle");
                        this.playAnimation('bananaBones|idle'); // idle
                        this.currentState = 'bananaBones|idle'; // idle
                    }
                    this.mixer.removeEventListener('finished', listener);
                }
            };
            this.mixer.addEventListener('finished', listener);

        } else {
             nextAction.setLoop(THREE.LoopRepeat);
             nextAction.clampWhenFinished = false; // allow looping
        }

        this.currentAction = nextAction;
    }

    // Return position of the physics body (capsule center)
    getPosition() {
        return this.playerBody ? this.playerBody.translation() : new THREE.Vector3(5, 15, 5); // Estimate if not ready
    }

    // Return the visual mesh's quaternion
    getQuaternion() {
       return this.mesh ? this.mesh.quaternion : new THREE.Quaternion();
    }
}

export class InputController {
    constructor() {
        this.forward = false;
        this.backward = false;
        this.left = false;
        this.right = false;
        this.sprint = false;
        this.wave = false;

        window.addEventListener('keydown', (event) => this.onKeyDown(event, true) );
        window.addEventListener('keyup', (event) => this.onKeyDown(event, false) );
        window.addEventListener('keypress', (event) => {
            if (event.code === 'KeyG' && !this.wave) {
                this.wave = true;
                return;
            }
        })
    }


    onKeyDown(event, state) {
        /*
        // Only trigger wave on key down (state is true)
        // and prevent holding the key down from re-triggering
        if (event.code === 'KeyG' && state && !this.wave) {
            this.wave = true; // Set the trigger
            // Note: Player update loop should reset this to false after use
            return; // Don't process other keys if waving
        }
        // Reset wave trigger on key up
        if (event.code === 'KeyG' && !state) {
            // this.wave = false; // Resetting here might be too early, let player update handle it.
        }
            */

        // Handle movement keys (allow moving while waving starts)
        switch (event.code) {
            case 'KeyW': this.forward = state; break;
            case 'KeyS': this.backward = state; break;
            case 'KeyA': this.left = state; break;
            case 'KeyD': this.right = state; break;
            case 'KeyR': this.sprint = state; break;
            // Don't set wave based on state here, just trigger on keydown above
        }
    }
}