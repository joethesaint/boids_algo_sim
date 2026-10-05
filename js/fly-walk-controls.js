// Hollowmere-inspired first-person navigation, adapted for the current
// Three.js global build. It deliberately owns only camera movement; the
// application keeps ownership of the renderer, scene, menus, and frame loop.
class FlyWalkControls {
    constructor(camera, domElement, options = {}) {
        this.camera = camera;
        this.domElement = domElement;
        this.enabled = false;
        this.mode = 'fly';
        this.keys = new Set();
        this.yaw = 0;
        this.pitch = 0;
        this.targetYaw = 0;
        this.targetPitch = 0;
        this.velocity = new THREE.Vector3();
        this.groundHeight = options.groundHeight || (() => 0);
        this.walkEyeHeight = options.walkEyeHeight || 3;
        this.minWalkHeight = options.minWalkHeight || 0;
        this.maxFlyHeight = options.maxFlyHeight || 800;
        this.speedMultiplier = 1;
        this.dragging = false;
        this.lastPointer = new THREE.Vector2();
        this._bind();
        this.syncFromCamera();
    }

    _bind() {
        window.addEventListener('keydown', event => {
            if (!this.enabled || event.target.matches('input, textarea, select')) return;
            if (event.code === 'KeyF' && !event.repeat) {
                this.mode = this.mode === 'fly' ? 'walk' : 'fly';
                event.preventDefault();
                this.onModeChange && this.onModeChange(this.mode);
                return;
            }
            const movement = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (movement.includes(event.code)) {
                this.keys.add(event.code);
                event.preventDefault();
            }
        });
        window.addEventListener('keyup', event => this.keys.delete(event.code));
        window.addEventListener('blur', () => this.keys.clear());

        this.domElement.addEventListener('pointerdown', event => {
            if (!this.enabled || event.pointerType === 'touch') return;
            this.dragging = true;
            this.lastPointer.set(event.clientX, event.clientY);
            this.domElement.setPointerCapture && this.domElement.setPointerCapture(event.pointerId);
        });
        this.domElement.addEventListener('pointermove', event => {
            if (!this.enabled || event.pointerType === 'touch' || !this.dragging) return;
            this.look(event.clientX - this.lastPointer.x, event.clientY - this.lastPointer.y);
            this.lastPointer.set(event.clientX, event.clientY);
        });
        const stopDrag = event => {
            this.dragging = false;
            if (this.domElement.hasPointerCapture && this.domElement.hasPointerCapture(event.pointerId)) this.domElement.releasePointerCapture(event.pointerId);
        };
        this.domElement.addEventListener('pointerup', stopDrag);
        this.domElement.addEventListener('pointercancel', stopDrag);
        this.domElement.addEventListener('wheel', event => {
            if (!this.enabled) return;
            event.preventDefault();
            this.speedMultiplier = THREE.MathUtils.clamp(this.speedMultiplier * (event.deltaY > 0 ? 0.88 : 1.14), 0.25, 6);
        }, { passive: false });
    }

    syncFromCamera() {
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.yaw = this.targetYaw = Math.atan2(-direction.x, -direction.z);
        this.pitch = this.targetPitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    }

    look(dx, dy) {
        this.targetYaw -= dx * 0.0026;
        this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - dy * 0.0026, -1.45, 1.45);
    }

    update(dt) {
        if (!this.enabled) return;
        dt = Math.min(dt, 0.1);
        const ease = 1 - Math.exp(-16 * dt);
        this.yaw += (this.targetYaw - this.yaw) * ease;
        this.pitch += (this.targetPitch - this.pitch) * ease;

        let right = 0, forward = 0, vertical = 0;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right += 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right -= 1;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
        if (this.keys.has('KeyE') || this.keys.has('Space')) vertical += 1;
        if (this.keys.has('KeyQ') || this.keys.has('KeyC')) vertical -= 1;

        const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
        const speed = (this.mode === 'walk' ? 24 : 90) * (sprint ? 2.5 : 1) * this.speedMultiplier;
        const desired = new THREE.Vector3();
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        if (this.mode === 'walk') desired.set(-sin * forward + cos * right, 0, -cos * forward - sin * right);
        else {
            const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
            desired.set(-sin * cp * forward + cos * right, sp * forward + vertical, -cos * cp * forward - sin * right);
        }
        if (desired.lengthSq() > 1) desired.normalize();
        desired.multiplyScalar(speed);
        const velocityEase = 1 - Math.exp(-(desired.lengthSq() > 0 ? 7 : 4.5) * dt);
        this.velocity.lerp(desired, velocityEase);
        this.camera.position.addScaledVector(this.velocity, dt);

        const floor = this.groundHeight(this.camera.position.x, this.camera.position.z) + this.minWalkHeight;
        if (this.mode === 'walk') {
            this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, floor + this.walkEyeHeight, 1 - Math.exp(-14 * dt));
            this.velocity.y = 0;
        } else {
            this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y, floor + 1.2, this.maxFlyHeight);
        }
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.updateMatrixWorld();
    }
}
