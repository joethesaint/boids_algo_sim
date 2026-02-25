/**
 * Boids Flocking Simulation - Enhanced Visuals & Robust Engine
 */

class SpatialHashGrid {
    constructor(bounds, cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }
    _key(v) {
        return `${Math.floor(v.x / this.cellSize)},${Math.floor(v.y / this.cellSize)},${Math.floor(v.z / this.cellSize)}`;
    }
    clear() { this.cells.clear(); }
    add(obj) {
        const key = this._key(obj.position);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(obj);
    }
    getNearby(v, radius) {
        const results = [];
        const cellsToCheck = Math.ceil(radius / this.cellSize);
        const cx = Math.floor(v.x / this.cellSize);
        const cy = Math.floor(v.y / this.cellSize);
        const cz = Math.floor(v.z / this.cellSize);
        for (let x = cx - cellsToCheck; x <= cx + cellsToCheck; x++) {
            for (let y = cy - cellsToCheck; y <= cy + cellsToCheck; y++) {
                for (let z = cz - cellsToCheck; z <= cz + cellsToCheck; z++) {
                    const cell = this.cells.get(`${x},${y},${z}`);
                    if (cell) results.push(...cell);
                }
            }
        }
        return results;
    }
}

// --- Trail Logic ---
class Trail {
    constructor(scene, color, length = 15) {
        this.scene = scene;
        this.maxLength = length;
        this.points = [];
        this.visible = true;
        
        const geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.maxLength * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        
        this.material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        
        this.line = new THREE.Line(geometry, this.material);
        this.line.frustumCulled = false;
        this.scene.add(this.line);
    }

    update(position) {
        if (!this.visible) {
            this.line.visible = false;
            return;
        }
        this.line.visible = true;
        
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

const BOID_TYPES = {
    SMALL_FISH: { name: 'Small Fish', geometry: () => new THREE.ConeGeometry(0.6, 2, 6), color: 0x00d2ff, maxSpeed: 4.5, maxForce: 0.25, fearRadius: 25, glow: 0.5 },
    LARGE_FISH: { name: 'Large Fish', geometry: () => new THREE.ConeGeometry(1.4, 4, 8), color: 0xff8c00, maxSpeed: 2.8, maxForce: 0.18, fearRadius: 35, glow: 0.8 },
    BIRD: { name: 'Bird', geometry: () => new THREE.ConeGeometry(1.0, 3, 6), color: 0x00ff88, maxSpeed: 5.5, maxForce: 0.35, fearRadius: 40, glow: 0.6 }
};

let _v1, _v2, _v3, _v4, _v5, _dummy;
function initScratch() {
    if (_v1) return;
    _v1 = new THREE.Vector3(); _v2 = new THREE.Vector3(); _v3 = new THREE.Vector3();
    _v4 = new THREE.Vector3(); _v5 = new THREE.Vector3(); _dummy = new THREE.Object3D();
}

class Boid {
    constructor(type, position, params, scene) {
        initScratch();
        this.type = type;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize().multiplyScalar(params.speed.min);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.maxSpeed = type.maxSpeed;
        this.maxForce = type.maxForce;
        this.matrix = new THREE.Matrix4();
        
        if (scene) {
            this.trail = new Trail(scene, type.color, 15);
            this.trail.visible = params.showTrails;
        }
    }

    applyRules(neighbors, predators, foodSources, obstacles, params) {
        this.acceleration.set(0, 0, 0);
        const sep = _v1.set(0,0,0), ali = _v2.set(0,0,0), coh = _v3.set(0,0,0);
        let sC = 0, aC = 0, cC = 0;

        for (let other of neighbors) {
            if (other === this) continue;
            const d = this.position.distanceTo(other.position);
            if (d < params.perception.separation && d > 0) {
                sep.add(_v4.subVectors(this.position, other.position).normalize().divideScalar(d));
                sC++;
            }
            if (d < 20) { ali.add(other.velocity); aC++; }
            if (d < 20) { coh.add(other.position); cC++; }
        }

        if (sC > 0) this.acceleration.add(sep.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(params.forces.separation));
        if (aC > 0) this.acceleration.add(ali.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(params.forces.alignment));
        if (cC > 0) this.acceleration.add(coh.divideScalar(cC).sub(this.position).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(params.forces.cohesion));

        const m = params.bounds * 0.95;
        const bS = _v4.set(0,0,0);
        if (this.position.x < -m) bS.x = 1; else if (this.position.x > m) bS.x = -1;
        if (this.position.y < -m) bS.y = 1; else if (this.position.y > m) bS.y = -1;
        if (this.position.z < -m) bS.z = 1; else if (this.position.z > m) bS.z = -1;
        if (bS.lengthSq() > 0) this.acceleration.add(bS.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce * 2));
    }

    update(params, dt) {
        this.velocity.add(this.acceleration.multiplyScalar(dt * 60));
        this.velocity.clampLength(params.speed.min, params.speed.max);
        this.position.addScaledVector(this.velocity, dt * 60);
        _dummy.position.copy(this.position);
        if (this.velocity.lengthSq() > 0.001) {
            _dummy.lookAt(_v4.copy(this.position).add(this.velocity));
            _dummy.rotateX(Math.PI / 2);
        }
        _dummy.updateMatrix();
        this.matrix.copy(_dummy.matrix);

        if (this.trail) {
            this.trail.update(this.position);
        }
    }

    destroy() {
        if (this.trail) {
            this.trail.destroy();
        }
    }
}

class Simulation {
    constructor() {
        this.params = {
            count: 200, bounds: 100,
            boidTypes: { smallFishRatio: 0.5, largeFishRatio: 0.3, birdRatio: 0.2 },
            speed: { min: 0.6, max: 3.5 },
            forces: { separation: 1.8, alignment: 1.2, cohesion: 1.0 },
            perception: { separation: 12 },
            lighting: { ambient: 0.4, bloom: 1.5 },
            showTrails: true
        };
        this.boids = [];
        this.instancedMeshes = {};
        this.grid = new SpatialHashGrid(this.params.bounds, 20);
        this.clock = new THREE.Clock();
        this.isPaused = false;
        this.followedBoid = null;
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020205);
        this.scene.fog = new THREE.Fog(0x020205, 100, 400);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 80, 200);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        document.body.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.composer = new THREE.EffectComposer(this.renderer);
        this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
        this.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        this.composer.addPass(this.bloomPass);

        this.setupLighting();
        this.setupEnvironment();
        this.createBoids(this.params.count);
        this.setupUI();

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.composer.setSize(window.innerWidth, window.innerHeight);
        });

        this.animate();
    }

    setupLighting() {
        const amb = new THREE.AmbientLight(0xffffff, this.params.lighting.ambient);
        const point = new THREE.PointLight(0x63b3ed, 2, 500);
        point.position.set(100, 100, 100);
        this.scene.add(amb, point);
    }

    setupEnvironment() {
        const box = new THREE.BoxGeometry(this.params.bounds*2, this.params.bounds*2, this.params.bounds*2);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.2 }));
        this.scene.add(edges);
        const grid = new THREE.GridHelper(this.params.bounds*2, 10, 0x1e293b, 0x0f172a);
        grid.position.y = -this.params.bounds;
        this.scene.add(grid);
    }

    reconstructInstancedMeshes() {
        for (let k in this.instancedMeshes) { this.scene.remove(this.instancedMeshes[k]); }
        this.instancedMeshes = {};
        const groups = {};
        this.boids.forEach(b => { if(!groups[b.type.name]) groups[b.type.name] = []; b.idx = groups[b.type.name].length; groups[b.type.name].push(b); });
        for (let name in groups) {
            const type = Object.values(BOID_TYPES).find(t => t.name === name);
            const mat = new THREE.MeshPhongMaterial({ color: type.color, shininess: 100, emissive: type.color, emissiveIntensity: type.glow });
            const imesh = new THREE.InstancedMesh(type.geometry(), mat, groups[name].length);
            this.scene.add(imesh);
            this.instancedMeshes[name] = imesh;
        }
    }

    createBoids(count) {
        const r = [this.params.boidTypes.smallFishRatio, this.params.boidTypes.largeFishRatio];
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            const type = rand < r[0] ? BOID_TYPES.SMALL_FISH : (rand < r[0]+r[1] ? BOID_TYPES.LARGE_FISH : BOID_TYPES.BIRD);
            this.boids.push(new Boid(type, new THREE.Vector3((Math.random()-0.5)*180, (Math.random()-0.5)*180, (Math.random()-0.5)*180), this.params, this.scene));
        }
        this.reconstructInstancedMeshes();
    }

    setupUI() {
        const bind = (id, param, obj) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                obj[param] = id.includes('fish') || id === 'birds' ? val/100 : val;
                const vEl = document.getElementById(id+'-value');
                if (vEl) vEl.textContent = val;
                if (id === 'bloom') this.bloomPass.strength = val;
                if (id === 'ambient') this.scene.children.filter(c => c.type === 'AmbientLight').forEach(l => l.intensity = val);
            });
        };
        ['separation', 'alignment', 'cohesion'].forEach(k => bind(k, k, this.params.forces));
        bind('small-fish', 'smallFishRatio', this.params.boidTypes);
        bind('large-fish', 'largeFishRatio', this.params.boidTypes);
        bind('birds', 'birdRatio', this.params.boidTypes);
        bind('bloom', 'bloom', this.params.lighting);
        bind('ambient', 'ambient', this.params.lighting);
        
        document.getElementById('pauseResume').onclick = (e) => { this.isPaused = !this.isPaused; e.target.textContent = this.isPaused ? "Resume" : "Pause"; };
        document.getElementById('reset').onclick = () => location.reload();
        document.getElementById('addBoids').onclick = () => this.createBoids(20);
        document.getElementById('removeBoids').onclick = () => { 
            const removed = this.boids.splice(-20); 
            removed.forEach(b => b.destroy());
            this.reconstructInstancedMeshes(); 
        };
        document.getElementById('fps-view').onclick = (e) => {
            if (this.followedBoid) { this.followedBoid = null; e.target.classList.remove('active'); e.target.textContent = "Follow Boid"; this.controls.enabled = true; }
            else { this.followedBoid = this.boids[Math.floor(Math.random()*this.boids.length)]; e.target.classList.add('active'); e.target.textContent = "Stop Following"; this.controls.enabled = false; }
        };

        const toggleTrails = document.createElement('button');
        toggleTrails.textContent = "Toggle Trails";
        toggleTrails.onclick = () => {
            this.params.showTrails = !this.params.showTrails;
            this.boids.forEach(b => b.trail && (b.trail.visible = this.params.showTrails));
        };
        document.querySelector('.control-content').appendChild(toggleTrails);

        window.toggleSection = (h) => {
            const c = h.nextElementSibling;
            const a = h.querySelector('.arrow');
            c.classList.toggle('collapsed');
            a.textContent = c.classList.contains('collapsed') ? '▼' : '▲';
        };
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = Math.min(this.clock.getDelta(), 0.1);
        if (!this.isPaused) {
            this.grid.clear(); this.boids.forEach(b => this.grid.add(b));
            this.boids.forEach(b => {
                b.applyRules(this.grid.getNearby(b.position, 30), [], [], [], this.params);
                b.update(this.params, dt);
                const imesh = this.instancedMeshes[b.type.name];
                if (imesh) imesh.setMatrixAt(b.idx, b.matrix);
            });
            for (let k in this.instancedMeshes) this.instancedMeshes[k].instanceMatrix.needsUpdate = true;
        }
        if (this.followedBoid) {
            const offset = new THREE.Vector3().copy(this.followedBoid.velocity).normalize().multiplyScalar(-20).add(new THREE.Vector3(0, 8, 0));
            this.camera.position.copy(this.followedBoid.position).add(offset);
            this.camera.lookAt(this.followedBoid.position);
        }
        document.getElementById('fps').textContent = Math.round(1/dt);
        document.getElementById('boidCount').textContent = this.boids.length;
        this.controls.update();
        this.composer.render();
    }
}

window.addEventListener('load', () => new Simulation());
