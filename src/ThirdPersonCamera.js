import * as THREE from 'three';

export class ThirdPersonCamera {
    constructor(params) {
        this.params = params;
        this.camera = params.camera;
        this.target = params.target;
        this.scene = params.scene;
        this._Init();
    }

    _Init() {

        this.pivot = new THREE.Object3D();
        let targetPos = this.target.getPosition();
        this.pivot.position.copy(new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z));
        this.pivot.add(this.camera);
        this.scene.add(this.pivot);

        this.camera.position.set(-0.25, 2, -4);
        this.rotation = { x: 0, y: 0 };

        this.mouseControls();
    }

    mouseControls() {
        window.addEventListener('mousemove', (e) => {
            const movementX = e.movementX || 0;
            const movementY = e.movementY || 0;

            const sensitivity = 0.003;
            this.rotation.y -= movementX * sensitivity;
            this.rotation.x -= movementY * sensitivity;

            const maxPitch = Math.PI / 2.5;
            this.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.rotation.x));
        });
    }

    update(dt) {
        const targetPos = this.target.getPosition();
        this.pivot.position.lerp(new THREE.Vector3(targetPos.x - 0.05, targetPos.y, targetPos.z + 1), 0.25);
        this.pivot.rotation.set(this.rotation.x, this.rotation.y, 0);
        this.camera.lookAt(this.pivot.position);
    }

}