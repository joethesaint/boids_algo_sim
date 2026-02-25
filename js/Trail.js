export class Trail {
    constructor(scene, color, length = 20) {
        this.scene = scene;
        this.maxLength = length;
        this.points = [];
        
        const geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.maxLength * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        
        this.material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });
        
        this.line = new THREE.Line(geometry, this.material);
        this.line.frustumCulled = false;
        this.scene.add(this.line);
    }

    update(position) {
        this.points.unshift(position.clone());
        if (this.points.length > this.maxLength) {
            this.points.pop();
        }

        const posAttr = this.line.geometry.attributes.position;
        for (let i = 0; i < this.maxLength; i++) {
            const p = this.points[i] || position;
            this.positions[i * 3] = p.x;
            this.positions[i * 3 + 1] = p.y;
            this.positions[i * 3 + 2] = p.z;
        }
        posAttr.needsUpdate = true;
    }

    destroy() {
        this.scene.remove(this.line);
        this.line.geometry.dispose();
        this.material.dispose();
    }
}
