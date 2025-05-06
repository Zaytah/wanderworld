// utils.js
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEFAULT_SPEED = 3.75;
const SPRINT_SPEED = 95.25;
const LATERAL_SPEED = 3.0;
const JUMP_FORCE = 2.5; 

const ANIM_FADE_DURATION = 0.2; // in seconds
const SPRINT_ANIMATION_SPEED = SPRINT_SPEED / DEFAULT_SPEED;
const JUMP_ANIMATION_SPEED = 1.7;
const MODEL_OFFSET_Y = 0.025;

export class Player {
    constructor(params) {
        this.mesh = null;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.speed = DEFAULT_SPEED;
        this.scale = params.scale;
        this.world = params.world;
        this.playerBody = null;
        this.position = new THREE.Vector3(5, 0, 5);
        this.gameCamera = null;

        // Animation
        this.mixer = null;              // THREE.AnimationMixer
        this.animations = new Map();    // Store clips by name <string, THREE.AnimationClip>
        this.actions = new Map();       // Store actions by name <string, THREE.AnimationAction>
        this.currentState = 'Idle';     // Track current animation state ('idle', 'walk', 'run', 'wave')
        this.currentAction = null;
        this._animationListener = null;

        // Physics
        this.capsuleInfo = {
            height: 1.0,
            radius: 0.4,
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

                // Visual Setup
                this.mesh.scale.set(1, 1, 1);
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        // child.material.color = new THREE.Color(1.5, 1.5, 1.5);
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // Animation
                const gltfAnimations = gltf.animations;
                // console.log(`Found ${gltfAnimations.length} animations:`);
                this.mixer = new THREE.AnimationMixer(this.mesh);

                gltfAnimations.forEach((clip) => {
                    // console.log(`- ${clip.name}`);
                    this.animations.set(clip.name, clip);
                    this.actions.set(clip.name, this.mixer.clipAction(clip));
                });

                // set default action
                this.currentAction = this.actions.get(this._getAnimInfoForState('Idle').name);
                if (this.currentAction) {
                     this.currentAction.play();
                } else {
                     console.warn("Could not find default 'Idle' animation!");
                }

                params.scene.add(this.mesh);
                // console.log('Player model added to scene.');
                this.initPhysics(); // Initialize physics AFTER model is loaded

                // Apply visual scale factor
                if (this.mesh && this.scale) {
                    this.mesh.scale.set(this.scale, this.scale, this.scale);
                }
            },
            (xhr) => { console.log( 'Player: ' + (xhr.loaded / xhr.total * 100) + '% loaded.'); },
            (error) => { console.error('Error loading player model:', error); }
        );
    }

    initPhysics() {
        if (!this.mesh) return;
        console.log('Initializing player physics...');

        this.capsuleInfo.halfHeight = this.capsuleInfo.height / 2;
        this.capsuleInfo.offsetY = -this.capsuleInfo.halfHeight - this.capsuleInfo.radius + MODEL_OFFSET_Y;

        let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(5.0, 15.0, 5.0)
            .setLinearDamping(0.1)
            .setAngularDamping(1.0);

        this.playerBody = this.world.createRigidBody(rigidBodyDesc);
        this.playerBody.lockRotations(true);

        let colliderDesc = RAPIER.ColliderDesc.capsule(
            this.capsuleInfo.halfHeight,
            this.capsuleInfo.radius)
            .setFriction(0.7)
            .setRestitution(0.0)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

        this.world.createCollider(colliderDesc, this.playerBody);
        console.log('Player physics body and collider created.');
    }

    update(input, deltaTime) {
        if (!this.mesh || !this.playerBody || !this.mixer) return;

        // update animation mixer
        this.mixer.update(deltaTime);

        // determine target state
        let nextState = this.currentState;
        nextState = this.determineTargetState(input);

        // determine animation clip
        const animInfo = this._getAnimInfoForState(nextState);
        const animationName = animInfo.name;
        const targetTimeScale = animInfo.timeScale;

        // apply velocity
        let targetSpeed = 0;
            // Calculate movement direction and speed based on input
            this.direction.set(0, 0, 0);
            let direction = new THREE.Vector3();

            let forward = new THREE.Vector3();
            this.mesh.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();

            let right = new THREE.Vector3();
            right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

            if (input.forward)  { this.direction.z += 1; direction.add(forward); }
            if (input.backward) { this.direction.z -= 1; direction.sub(forward); }
            if (input.left) { this.direction.x += 1; direction.sub(right); }
            if (input.right) { this.direction.x -= 1; direction.add(right); }

            const isMoving = this.direction.lengthSq() > 0.01;
            if (isMoving) {
                this.direction.normalize();
                direction.normalize();
                 
                if (nextState === 'Run') {
                    targetSpeed = SPRINT_SPEED;
                } else if (nextState === 'Walk') {
                    targetSpeed = (input.left || input.right || input.backward) ? LATERAL_SPEED : DEFAULT_SPEED;
                }
            }

            this.velocity.copy(this.direction).multiplyScalar(targetSpeed);
            //this.velocity.copy(direction).multiplyScalar(targetSpeed);
            let currentVelocity = this.playerBody.linvel();
            // apply velocity only if not jumping
            if (nextState !== 'Jump') {
               this.playerBody.setLinvel({x: this.velocity.x, y: currentVelocity.y, z: this.velocity.z}, true);
            }
        


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
        const currentClipName = this.currentAction ? this.currentAction.getClip().name : null;
        const needsAnimChange = currentClipName !== animationName;

        // play animation if the clip needs to change OR if the state changed
        if (needsAnimChange || this.currentState !== nextState) {
            this.playAnimation(animationName, targetTimeScale);
            this.currentState = nextState;
        }
        // If state and clip are same, check timescale is correct
        else if (this.currentAction && Math.abs(this.currentAction.getEffectiveTimeScale() - targetTimeScale) > 0.01) {
            this.currentAction.setEffectiveTimeScale(targetTimeScale);
        }
    }


    playAnimation(name, timeScale = 1.0) { // name is the animation clip name
        const nextAction = this.actions.get(name);
        if (!nextAction) {
            console.warn(`Animation action for clip "${name}" not found!`);
            return;
        }

        // clean up previous listener
        if (this._animationListener && this.mixer) {
            this.mixer.removeEventListener('finished', this._animationListener);
            this._animationListener = null;
        }

        const currentAction = this.currentAction;

        // fade out current action if different and playing
        if (currentAction && currentAction !== nextAction) {
            if (!currentAction.paused && currentAction.getEffectiveWeight() > 0) {
                currentAction.fadeOut(ANIM_FADE_DURATION);
            }
        }
        // Skip reset/fade if it's the same action already playing correctly
        else if (currentAction && currentAction === nextAction) {
            if (Math.abs(currentAction.getEffectiveTimeScale() - timeScale) > 0.01) {
                currentAction.setEffectiveTimeScale(timeScale);
            }
            if (currentAction.paused) currentAction.paused = false;
            if (!currentAction.isRunning()) currentAction.play();
            return;
        }

        // configure next action
        nextAction
            .reset()
            .setEffectiveTimeScale(timeScale)
            .setEffectiveWeight(1)
            .fadeIn(ANIM_FADE_DURATION)
            .play();

        // handle loop behavior and state transitions
        let loopMode = THREE.LoopRepeat;
        let clamp = false;
        let nextStateOnFinish = 'Idle'; // always go back to Idle

        const jumpClipName = this._getAnimInfoForState('Jump').name;
        const waveClipName = this._getAnimInfoForState('Wave').name;
        switch (name) {
            case jumpClipName:
            case waveClipName:
                loopMode = THREE.LoopOnce;
                clamp = true;
                break;
             case this._getAnimInfoForState('Idle').name:
             case this._getAnimInfoForState('Walk').name:
                 loopMode = THREE.LoopRepeat;
                 break;
            default:
                // console.warn(`Unhandled animation clip name "${name}" for loop/finish logic.`);
                loopMode = THREE.LoopOnce;
                clamp = true;
                break;
        }

        nextAction.setLoop(loopMode);
        nextAction.clampWhenFinished = clamp;

        // listener for one shot animations (Jump, Wave)
        if (loopMode === THREE.LoopOnce) {
            this._animationListener = (event) => {
                if (event.action === nextAction) {

                    let finishedState = 'Unknown';
                    const stateMap = this._getStateToAnimMap();
                    for (const [state, clipName] of Object.entries(stateMap)) {
                        if (clipName === name) {
                            finishedState = state;
                            break;
                        }
                    }

                    // Only transition state if the state hasn't been changed
                    // by player input *since this animation started*.
                    if (this.currentState === finishedState) {
                         // console.log(`Animation clip '${name}' (state '${finishedState}') finished, transitioning to state '${nextStateOnFinish}'`);

                         // Start the animation for the next state (Idle)
                         const nextAnimInfo = this._getAnimInfoForState(nextStateOnFinish);
                         this.playAnimation(nextAnimInfo.name, nextAnimInfo.timeScale);
                         this.currentState = nextStateOnFinish;
                    }

                    // Clean up listener
                    if (this.mixer) this.mixer.removeEventListener('finished', this._animationListener);
                    this._animationListener = null;
                }
            };
            this.mixer.addEventListener('finished', this._animationListener);
        }

        this.currentAction = nextAction;
    }

    determineTargetState(input) {
        let nextState = this.currentState;
        const movementKey = input.forward || input.backward || input.left || input.right;
        let didConsumeJump = false;
        let didConsumeWave = false;

        // state logic --- Priority: jump > wave > move > idle
        if (input.jump) {
            nextState = 'Jump';
            this.playerBody.applyImpulse({ x: 0, y: JUMP_FORCE, z: 0 }, true);
            didConsumeJump = true;
        } else if (input.wave) {
             nextState = 'Wave';
             didConsumeWave = true;
        }
        else if (movementKey) {
            // Only allow moving if not currently in the Jump state
            if (this.currentState !== 'Jump') {
                nextState = (input.sprint && input.forward) ? 'Run' : 'Walk';
            } else {
                // Remain in Jump state if currently jumping
                nextState = 'Jump';
            }
        } else {
            // Transition to Idle only if not Jumping or Waving
            if (this.currentState !== 'Jump' && this.currentState !== 'Wave') {
                 nextState = 'Idle';
            }
            // Remain in Jump/Wave state if currently performing them and no other input
            else if (this.currentState === 'Jump') {
                 nextState = 'Jump';
            } else if (this.currentState === 'Wave') {
                 nextState = 'Wave';
            }
            // Default case if somehow in another state with no input
            else {
                 nextState = 'Idle';
            }
        }

        if(didConsumeJump) input.jump = false;
        if(didConsumeWave) input.wave = false;
        return nextState;
    }


    _getStateToAnimMap() {
        return {
            'Idle': 'bananaBones|idle',
            'Walk': 'bananaBones|walk',
            'Run': 'bananaBones|walk',
            'Jump': 'bananaBones|jump',
            'Wave': 'bananaBones|hiiiiiiiii'
        };
    }

    // Helper to get animation clip name and timescale for given state
    _getAnimInfoForState(state) {
        const map = this._getStateToAnimMap();
        const name = map[state] || map['Idle'];
        let timeScale = 1.0;
        if (state === 'Run') {
            timeScale = SPRINT_ANIMATION_SPEED;
        }
        if (state === 'Jump') {
            timeScale = JUMP_ANIMATION_SPEED;
        }
        return { name, timeScale };
    }

    // Getters/Setters
    getPosition() { return this.playerBody ? this.playerBody.translation() : new THREE.Vector3(5, 10, 5); }
    getQuaternion() { return this.mesh ? this.mesh.quaternion : new THREE.Quaternion(); }
    setCamera(camera) { this.gameCamera = camera; }
}

export class InputController {
    constructor() {
        this.forward = false;
        this.backward = false;
        this.left = false;
        this.right = false;
        this.sprint = false;

        // action states
        this.wave = false;      // G key
        this.jump = false;      // Space bar

        window.addEventListener('keydown', (event) => this.onKeyEvent(event, true));
        window.addEventListener('keyup', (event) => this.onKeyEvent(event, false));
        window.addEventListener('keypress', (event) => {
            if (event.code === 'KeyG' && !this.wave) {
                this.wave = true;
                return;
            }
        });
    }

    onKeyEvent(event, state) {

        switch (event.code) {
            case 'KeyW': this.forward = state; break;
            case 'KeyS': this.backward = state; break;
            case 'KeyA': this.left = state; break;
            case 'KeyD': this.right = state; break;
            case 'KeyR': this.sprint = state; break;
            case 'Space':
                if (!this.jump) this.jump = true;
                break;
        }
    }
}
