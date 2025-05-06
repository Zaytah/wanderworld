// utils.js
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Constants ---
const DEFAULT_SPEED = 3.75;
const SPRINT_SPEED = 5.25;
const LATERAL_SPEED = 3.0;
const JUMP_FORCE = 6.0; 

const ANIM_FADE_DURATION = 0.2; // in seconds
const SPRINT_ANIMATION_SPEED = SPRINT_SPEED / DEFAULT_SPEED;
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
                console.log(`Found ${gltfAnimations.length} animations:`);
                this.mixer = new THREE.AnimationMixer(this.mesh);

                gltfAnimations.forEach((clip) => {
                    console.log(`- ${clip.name}`);
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
                console.log('Player model added to scene.');
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
            .setTranslation(5.0, 10.0, 5.0)
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

        // determine movement and target state
        let nextState = this.currentState;
        const movementKey = input.forward || input.backward || input.left || input.right;
        let blockMovementPhysics = false; // Not used currently, but kept for structure
        let blockVisualRotation = false;
        // Flags to track which inputs were consumed this frame
        let didConsumeJump = false;
        let didConsumeWave = false;
        // Removed Look/Sit flags as they are not implemented in this version

        // --- State Logic (Simplified) ---
        // Priority: Jump > Wave > Move > Idle
        if (input.jump) {
            nextState = 'Jump';
            this.playerBody.applyImpulse({ x: 0, y: JUMP_FORCE, z: 0 }, true);
            //blockVisualRotation = true; // Stop character turning mid-air during jump animation
            didConsumeJump = true;
        } else if (input.wave) {
             nextState = 'Wave';
             blockMovementPhysics = true; // Stop movement during wave
             blockVisualRotation = true; // Stop rotation during wave
             didConsumeWave = true;
        }
        else if (movementKey) {
            // Only allow moving if not currently in the Jump state
            if (this.currentState !== 'Jump') {
                nextState = (input.sprint && input.forward) ? 'Run' : 'Walk';
                blockMovementPhysics = false;
                blockVisualRotation = false;
            } else {
                // Remain in Jump state if currently jumping
                nextState = 'Jump';
                blockVisualRotation = true; // Keep rotation blocked
            }
        } else {
            // Transition to Idle only if not Jumping or Waving
            if (this.currentState !== 'Jump' && this.currentState !== 'Wave') {
                 nextState = 'Idle';
            }
            // Remain in Jump/Wave state if currently performing them and no other input
            else if (this.currentState === 'Jump') {
                 nextState = 'Jump';
                 blockVisualRotation = true;
            } else if (this.currentState === 'Wave') {
                 nextState = 'Wave';
                 blockMovementPhysics = true;
                 blockVisualRotation = true;
            }
            // Default case if somehow in another state with no input
            else {
                 nextState = 'Idle';
            }
            blockMovementPhysics = false; // Generally allow physics unless blocked above
            blockVisualRotation = false;
        }


        // --- Consume Input Flags ---
        if(didConsumeJump) input.jump = false;
        if(didConsumeWave) input.wave = false;


        // --- 3. Determine Animation Clip Name and TimeScale ---
        const animInfo = this._getAnimInfoForState(nextState);
        const animationName = animInfo.name;
        const targetTimeScale = animInfo.timeScale;

        // --- 4. Apply Velocity / Handle Blocked Movement ---
        let targetSpeed = 0;
        if (blockMovementPhysics) {
             // Force zero horizontal velocity if movement is blocked by state
             let currentVelocity = this.playerBody.linvel();
             if (Math.abs(currentVelocity.x) > 0.01 || Math.abs(currentVelocity.z) > 0.01) {
                  this.playerBody.setLinvel({ x: 0, y: currentVelocity.y, z: 0 }, true);
             }
        } else {
             // Calculate movement direction and speed based on input
             this.direction.set(0, 0, 0);
             if (input.forward) this.direction.z += 1;
             if (input.backward) this.direction.z -= 1;
             if (input.left) this.direction.x += 1;
             if (input.right) this.direction.x -= 1;

             const isMoving = this.direction.lengthSq() > 0.01;
             if (isMoving) {
                 this.direction.normalize();
                 // Determine speed based on conceptual state
                 if (nextState === 'Run') {
                     targetSpeed = SPRINT_SPEED;
                 } else if (nextState === 'Walk') {
                     targetSpeed = (input.left || input.right || input.backward) ? LATERAL_SPEED : DEFAULT_SPEED;
                 }
             }

             this.velocity.copy(this.direction).multiplyScalar(targetSpeed);
             let currentVelocity = this.playerBody.linvel();
             // Apply velocity only if not jumping
             if (nextState !== 'Jump') {
                this.playerBody.setLinvel({x: this.velocity.x, y: currentVelocity.y, z: this.velocity.z}, true);
             }
        }


        // --- 5. Sync Visual Mesh Position (with Offset) ---
        const pos = this.playerBody.translation();
        this.position.set(
            pos.x,
            pos.y + this.capsuleInfo.offsetY,
            pos.z
        );
        this.mesh.position.copy(this.position);

        // --- 6. Update Visual Rotation ---
        // Rotate towards movement direction if not blocked and moving
        if (!blockVisualRotation && this.direction.lengthSq() > 0.01) {
            const angle = Math.atan2(this.direction.x, this.direction.z);
            const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            this.mesh.quaternion.slerp(targetQuaternion, 0.15);
        }

        // --- 7. Transition Animations ---
        const currentClipName = this.currentAction ? this.currentAction.getClip().name : null;
        const needsAnimChange = currentClipName !== animationName;

        // Play animation if the clip needs to change OR if the conceptual state changed
        if (needsAnimChange || this.currentState !== nextState) {
             this.playAnimation(animationName, targetTimeScale);
             this.currentState = nextState; // Update conceptual state
        }
        // If state and clip are the same, just ensure timescale is correct (e.g. walk -> run)
        else if (this.currentAction && Math.abs(this.currentAction.getEffectiveTimeScale() - targetTimeScale) > 0.01) {
             this.currentAction.setEffectiveTimeScale(targetTimeScale);
        }
    }

    // Modified playAnimation to accept timeScale
    playAnimation(name, timeScale = 1.0) { // name is the animation clip name
        const nextAction = this.actions.get(name);
        if (!nextAction) {
            console.warn(`Animation action for clip "${name}" not found!`);
            return;
        }

        // Clean up previous listener
        if (this._animationListener && this.mixer) {
            this.mixer.removeEventListener('finished', this._animationListener);
            this._animationListener = null;
        }

        const currentAction = this.currentAction;

        // Fade out current action if different and playing
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

        // Configure and Fade In next action
        nextAction
            .reset()
            .setEffectiveTimeScale(timeScale) // Apply calculated timescale
            .setEffectiveWeight(1)
            .fadeIn(ANIM_FADE_DURATION)
            .play();

        // --- Handle Loop Behavior and State Transitions on Finish ---
        let loopMode = THREE.LoopRepeat; // Default to looping
        let clamp = false;
        // Default next conceptual state after one-shot anims
        let nextStateOnFinish = 'Idle'; // Simplified: always go back to Idle

        // --- !! VERIFY ALL THESE ANIMATION CLIP NAMES !! ---
        const jumpClipName = this._getAnimInfoForState('Jump').name;
        const waveClipName = this._getAnimInfoForState('Wave').name;
        switch (name) {
            case jumpClipName:
            case waveClipName:
                loopMode = THREE.LoopOnce;
                clamp = true;
                // nextStateOnFinish is 'Idle'
                break;
            // Removed Sit/Stand/Look cases
             case this._getAnimInfoForState('Idle').name:
             case this._getAnimInfoForState('Walk').name: // Walk clip loops (used for Walk and Run states)
                 loopMode = THREE.LoopRepeat;
                 break; // No automatic transition needed
            default:
                console.warn(`Unhandled animation clip name "${name}" for loop/finish logic.`);
                loopMode = THREE.LoopOnce; // Play once if unknown
                clamp = true;
                break;
        }

        nextAction.setLoop(loopMode);
        nextAction.clampWhenFinished = clamp;

        // Add listener for one-shot animations (Jump, Wave)
        if (loopMode === THREE.LoopOnce) {
            this._animationListener = (event) => {
                if (event.action === nextAction) {
                    // Find the conceptual state associated with this finished animation clip
                    let finishedState = 'Unknown';
                    const stateMap = this._getStateToAnimMap();
                    for (const [state, clipName] of Object.entries(stateMap)) {
                        if (clipName === name) {
                            finishedState = state;
                            break;
                        }
                    }

                    // Only transition state if the conceptual state hasn't been changed
                    // by player input *since this animation started*.
                    if (this.currentState === finishedState) {
                         // console.log(`Animation clip '${name}' (state '${finishedState}') finished, transitioning to state '${nextStateOnFinish}'`);

                         // Start the animation for the *next conceptual state* (Idle)
                         const nextAnimInfo = this._getAnimInfoForState(nextStateOnFinish);
                         this.playAnimation(nextAnimInfo.name, nextAnimInfo.timeScale);
                         this.currentState = nextStateOnFinish; // Update conceptual state
                    }

                    // Clean up listener
                    if (this.mixer) this.mixer.removeEventListener('finished', this._animationListener);
                    this._animationListener = null;
                }
            };
            this.mixer.addEventListener('finished', this._animationListener);
        }

        this.currentAction = nextAction; // Update reference
    }

    // Helper to map conceptual states to animation clip names
    // --- !! VERIFY ALL THESE NAMES !! ---
    _getStateToAnimMap() {
        // Simplified map
        return {
            'Idle': 'bananaBones|idle',
            'Walk': 'bananaBones|walk',
            'Run': 'bananaBones|walk', // Run uses walk clip
            'Jump': 'bananaBones|jump', // Added Jump mapping
            'Wave': 'bananaBones|hiiiiiiiii' // Kept Wave mapping
            // Removed Sit/Stand/Look mappings
        };
    }

    // Helper to get animation clip name and timescale for a given conceptual state
    _getAnimInfoForState(state) {
        const map = this._getStateToAnimMap();
        const name = map[state] || map['Idle']; // Fallback to idle clip name
        let timeScale = 1.0;
        if (state === 'Run') {
            timeScale = SPRINT_ANIMATION_SPEED;
        }
        return { name, timeScale };
    }


    // Getters
    getPosition() { return this.playerBody ? this.playerBody.translation() : new THREE.Vector3(5, 10, 5); }
    getQuaternion() { return this.mesh ? this.mesh.quaternion : new THREE.Quaternion(); }
}

// --- Input Controller Class ---
export class InputController {
    constructor() {
        this.forward = false;
        this.backward = false;
        this.left = false;
        this.right = false;
        this.sprint = false;

        // Action States
        this.wave = false;      // G key
        this.jump = false;      // Space bar
        // Removed sitToggle and lookAround flags

        // Removed _isShiftDown helper

        // Use keydown/keyup for movement and jump
        window.addEventListener('keydown', (event) => this.onKeyEvent(event, true));
        window.addEventListener('keyup', (event) => this.onKeyEvent(event, false));
        window.addEventListener('keypress', (event) => {
            if (event.key === 'KeyG' && !this.wave) {
                this.wave = true;
            }
        });
    }

    // Handles keydown/keyup for movement and jump
    onKeyEvent(event, isDown) {
        // Ignore repeats for jump
        if (event.repeat && event.code === 'Space') {
             return;
        }

        // --- Jump (on KeyDown) ---
        if (isDown) {
            switch (event.code) {
                case 'Space':
                    // Set jump flag only once on key down
                    if (!this.jump) this.jump = true; // Player.update resets this
                    break;
                // Removed Shift handling
            }
        }
        // No specific keyup handling needed here anymore

        // --- Movement & Sprint Keys (Update state based on isDown) ---
        switch (event.code) {
            case 'KeyW': this.forward = isDown; break;
            case 'KeyS': this.backward = isDown; break;
            case 'KeyA': this.left = isDown; break;
            case 'KeyD': this.right = isDown; break;
            case 'KeyR': this.sprint = isDown; break;
        }
    }

    onKeyPressEvent(event) {
         const key = event.key.toLowerCase();
         if (key === 'g') { // Wave
             if (!this.wave) { 
                 this.wave = true;
             }
         }
    }
}
