/**
 * Boids Flocking Simulation - Robust Implementation
 */

// --- Spatial Hash Grid ---
class SpatialHashGrid {
    constructor(bounds, cellSize) {
        this.bounds = bounds;
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    _key(v) {
        const x = Math.floor(v.x / this.cellSize);
        const y = Math.floor(v.y / this.cellSize);
        const z = Math.floor(v.z / this.cellSize);
        return `${x},${y},${z}`;
    }

    clear() {
        this.cells.clear();
    }

    add(obj) {
        const key = this._key(obj.position);
        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }
        this.cells.get(key).push(obj);
    }

    getNearby(v, radius) {
        const results = [];
        const cellsToCheck = Math.ceil(radius / this.cellSize);
        const center_x = Math.floor(v.x / this.cellSize);
        const center_y = Math.floor(v.y / this.cellSize);
        const center_z = Math.floor(v.z / this.cellSize);

        for (let x = center_x - cellsToCheck; x <= center_x + cellsToCheck; x++) {
            for (let y = center_y - cellsToCheck; y <= center_y + cellsToCheck; y++) {
                for (let z = center_z - cellsToCheck; z <= center_z + cellsToCheck; z++) {
                    const key = `${x},${y},${z}`;
                    const cell = this.cells.get(key);
                    if (cell) results.push(...cell);
                }
            }
        }
        return results;
    }
}

// --- Boid & Predator Logic ---
const BOID_TYPES = {
    SMALL_FISH: {
        name: 'Small Fish',
        geometry: () => new THREE.ConeGeometry(0.8, 2.5, 6),
        color: 0x00aaff,
        maxSpeed: 4.0,
        maxForce: 0.3,
        perceptionRadius: { separation: 8, alignment: 15, cohesion: 15 },
        fearRadius: 25
    },
    LARGE_FISH: {
        name: 'Large Fish',
        geometry: () => new THREE.ConeGeometry(1.8, 5, 8),
        color: 0xff6600,
        maxSpeed: 2.5,
        maxForce: 0.2,
        perceptionRadius: { separation: 12, alignment: 25, cohesion: 25 },
        fearRadius: 30
    },
    BIRD: {
        name: 'Bird',
        geometry: () => new THREE.ConeGeometry(1.2, 3.5, 6),
        color: 0x00ff00,
        maxSpeed: 5.0,
        maxForce: 0.4,
        perceptionRadius: { separation: 10, alignment: 20, cohesion: 20 },
        fearRadius: 35
    }
};

// Scratch variables to avoid GC
let _v1, _v2, _v3, _v4, _v5, _v6, _dummy;
function initScratch() {
    if (_v1) return;
    _v1 = new THREE.Vector3();
    _v2 = new THREE.Vector3();
    _v3 = new THREE.Vector3();
    _v4 = new THREE.Vector3();
    _v5 = new THREE.Vector3();
    _v6 = new THREE.Vector3();
    _dummy = new THREE.Object3D();
}

class Boid {
    constructor(type, position, params) {
        initScratch();
        this.type = type;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize().multiplyScalar(params.speed.min);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.maxSpeed = type.maxSpeed;
        this.maxForce = type.maxForce;
        this.matrix = new THREE.Matrix4();
    }

    applyRules(neighbors, predators, foodSources, obstacles, params) {
        this.acceleration.set(0, 0, 0);
        const sepSteer = _v1.set(0,0,0);
        const aliSum = _v2.set(0,0,0);
        const cohSum = _v3.set(0,0,0);
        let sC = 0, aC = 0, cC = 0;

        const sD = params.perception.separation;
        const aD = this.type.perceptionRadius.alignment;
        const cD = this.type.perceptionRadius.cohesion;

        for (let other of neighbors) {
            if (other === this) continue;
            const dist = this.position.distanceTo(other.position);
            if (dist < sD && dist > 0) {
                sepSteer.add(_v4.subVectors(this.position, other.position).normalize().divideScalar(dist));
                sC++;
            }
            if (dist < aD) { aliSum.add(other.velocity); aC++; }
            if (dist < cD) { cohSum.add(other.position); cC++; }
        }

        if (sC > 0) {
            sepSteer.divideScalar(sC).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce);
            this.acceleration.add(sepSteer.multiplyScalar(params.forces.separation));
        }
        if (aC > 0) {
            aliSum.divideScalar(aC).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce);
            this.acceleration.add(aliSum.multiplyScalar(params.forces.alignment));
        }
        if (cC > 0) {
            const desired = cohSum.divideScalar(cC).sub(this.position);
            desired.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce);
            this.acceleration.add(desired.multiplyScalar(params.forces.cohesion));
        }

        // Simple avoidance
        for (let obs of obstacles) {
            const dist = this.position.distanceTo(obs.position);
            if (dist < params.perception.avoidance + 5) {
                const rep = _v4.subVectors(this.position, obs.position).normalize().multiplyScalar((params.perception.avoidance + 5 - dist) * 0.1);
                this.acceleration.add(rep.clampLength(0, this.maxForce).multiplyScalar(params.forces.avoidance));
            }
        }

        // Fear
        for (let pred of predators) {
            const dist = this.position.distanceTo(pred.position);
            if (dist < this.type.fearRadius) {
                const flee = _v4.subVectors(this.position, pred.position).normalize().multiplyScalar(this.maxSpeed * 2);
                this.acceleration.add(flee.sub(this.velocity).clampLength(0, this.maxForce * 2).multiplyScalar(params.forces.fear));
            }
        }

        // Food
        let consume = null;
        let closestF = null, minFD = Infinity;
        for (let f of foodSources) {
            const dist = this.position.distanceTo(f.position);
            if (dist < params.food.attractionRadius && dist < minFD) { closestF = f; minFD = dist; }
        }
        if (closestF) {
            const steer = _v4.subVectors(closestF.position, this.position).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce);
            this.acceleration.add(steer.multiplyScalar(params.forces.foodAttraction));
            if (minFD < 2) consume = closestF;
        }

        // Bounds
        const m = params.bounds * 0.9;
        const bS = _v4.set(0,0,0);
        if (this.position.x < -m) bS.x = 1; else if (this.position.x > m) bS.x = -1;
        if (this.position.y < -m) bS.y = 1; else if (this.position.y > m) bS.y = -1;
        if (this.position.z < -m) bS.z = 1; else if (this.position.z > m) bS.z = -1;
        if (bS.lengthSq() > 0) this.acceleration.add(bS.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce * 2));

        return consume ? { consume } : null;
    }

    update(params, dt) {
        this.velocity.add(_v4.copy(this.acceleration).multiplyScalar(dt * 60));
        this.velocity.clampLength(params.speed.min, params.speed.max);
        this.position.addScaledVector(this.velocity, dt * 60);

        _dummy.position.copy(this.position);
        _dummy.rotation.set(0,0,0);
        if (this.velocity.lengthSq() > 0.001) {
            _dummy.lookAt(_v4.copy(this.position).add(this.velocity));
            _dummy.rotateX(Math.PI / 2);
        }
        _dummy.updateMatrix();
        this.matrix.copy(_dummy.matrix);
    }
}

class Predator {
    constructor(position, speed) {
        initScratch();
        const geo = new THREE.SphereGeometry(2.5, 12, 12);
        const mat = new THREE.MeshPhongMaterial({ color: 0xff3333, shininess: 100 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.position = position.clone();
        this.velocity = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize().multiplyScalar(1.5);
        this.maxSpeed = speed;
        this.huntCooldown = 0;
    }

    update(boids, params, dt) {
        const step = dt * 60;
        if (this.huntCooldown > 0) this.huntCooldown -= step;
        
        let target = null, minDist = Infinity;
        for (let b of boids) {
            const d = this.position.distanceTo(b.position);
            if (d < params.predators.huntRadius && d < minDist) { target = b; minDist = d; }
        }

        const acc = _v4.set(0,0,0);
        let caught = null;
        if (target && this.huntCooldown <= 0) {
            acc.subVectors(target.position, this.position).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, 0.3);
            if (minDist < 3) { this.huntCooldown = 120; caught = target; }
        } else {
            acc.set(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(0.1);
        }

        this.velocity.add(acc.multiplyScalar(step)).clampLength(0, this.maxSpeed);
        this.position.addScaledVector(this.velocity, step);

        // Simple wrap
        const b = params.bounds * 1.5;
        ['x','y','z'].forEach(axis => {
            if (this.position[axis] > b) this.position[axis] = -b;
            else if (this.position[axis] < -b) this.position[axis] = b;
        });

        this.mesh.position.copy(this.position);
        if (this.velocity.lengthSq() > 0.001) this.mesh.lookAt(_v4.copy(this.position).add(this.velocity));
        return caught;
    }
}

// --- Simulation Engine ---
class Simulation {
    constructor() {
        this.params = {
            count: 150, bounds: 100,
            boidTypes: { smallFishRatio: 0.5, largeFishRatio: 0.3, birdRatio: 0.2 },
            predators: { count: 3, huntRadius: 40, speed: 3.5 },
            food: { count: 15, spawnRate: 0.02, attractionRadius: 30 },
            speed: { min: 0.5, max: 3.0 },
            forces: { separation: 1.5, alignment: 1.0, cohesion: 1.0, avoidance: 1.5, fear: 2.0, foodAttraction: 1.2 },
            perception: { separation: 10, alignment: 20, cohesion: 20, avoidance: 15 },
            lighting: { ambient: 0.4, directional: 0.8, edge: 0.6 }
        };

        this.boids = [];
        this.predators = [];
        this.foodSources = [];
        this.obstacles = [];
        this.instancedMeshes = {};
        this.grid = new SpatialHashGrid(this.params.bounds, 20);
        this.clock = new THREE.Clock();
        this.lastTime = performance.now();
        this.isPaused = false;

        try {
            this.init();
        } catch (e) {
            console.error("Initialization failed:", e);
            document.getElementById('title').textContent = "Error: Check Console";
        }
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x05050a);
        this.scene.fog = new THREE.Fog(0x05050a, 80, 300);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 50, 150);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.setupLighting();
        this.setupEnvironment();
        this.createBoids(this.params.count);
        this.createPredators(this.params.predators.count);
        this.createFoodSources(this.params.food.count);
        this.createObstacles(5);
        this.setupUI();

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        this.animate();
    }

    setupLighting() {
        this.lights = {
            amb: new THREE.AmbientLight(0x404040, this.params.lighting.ambient),
            dir: new THREE.DirectionalLight(0xffffff, this.params.lighting.directional)
        };
        this.lights.dir.position.set(1,1,1);
        this.scene.add(this.lights.amb, this.lights.dir);
    }

    setupEnvironment() {
        const bounds = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(this.params.bounds*2, this.params.bounds*2, this.params.bounds*2)),
            new THREE.LineBasicMaterial({ color: 0x4299e1, transparent: true, opacity: 0.3 })
        );
        this.scene.add(bounds);
        const grid = new THREE.GridHelper(this.params.bounds*2, 20, 0x334155, 0x1e293b);
        grid.position.y = -this.params.bounds;
        this.scene.add(grid);
    }

    reconstructInstancedMeshes() {
        for (let k in this.instancedMeshes) { this.scene.remove(this.instancedMeshes[k]); this.instancedMeshes[k].geometry.dispose(); this.instancedMeshes[k].material.dispose(); }
        this.instancedMeshes = {};
        const groups = {};
        this.boids.forEach(b => { if(!groups[b.type.name]) groups[b.type.name] = []; b.idx = groups[b.type.name].length; groups[b.type.name].push(b); });
        for (let name in groups) {
            const type = Object.values(BOID_TYPES).find(t => t.name === name);
            const imesh = new THREE.InstancedMesh(type.geometry(), new THREE.MeshPhongMaterial({ color: type.color, shininess: 100 }), groups[name].length);
            this.scene.add(imesh);
            this.instancedMeshes[name] = imesh;
        }
    }

    createBoids(count) {
        const r = [this.params.boidTypes.smallFishRatio, this.params.boidTypes.largeFishRatio];
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            const type = rand < r[0] ? BOID_TYPES.SMALL_FISH : (rand < r[0]+r[1] ? BOID_TYPES.LARGE_FISH : BOID_TYPES.BIRD);
            this.boids.push(new Boid(type, new THREE.Vector3((Math.random()-0.5)*150, (Math.random()-0.5)*150, (Math.random()-0.5)*150), this.params));
        }
        this.reconstructInstancedMeshes();
    }

    createPredators(count) {
        for (let i=0; i<count; i++) {
            const p = new Predator(new THREE.Vector3((Math.random()-0.5)*180, (Math.random()-0.5)*180, (Math.random()-0.5)*180), this.params.predators.speed);
            this.scene.add(p.mesh); this.predators.push(p);
        }
    }

    createFoodSources(count) {
        const geo = new THREE.SphereGeometry(1, 8, 8);
        const mat = new THREE.MeshPhongMaterial({ color: 0x32cd32 });
        for (let i=0; i<count; i++) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set((Math.random()-0.5)*160, (Math.random()-0.5)*160, (Math.random()-0.5)*160);
            this.scene.add(m); this.foodSources.push({ mesh: m, position: m.position });
        }
    }

    createObstacles(count) {
        const geo = new THREE.SphereGeometry(5, 16, 16);
        const mat = new THREE.MeshPhongMaterial({ color: 0x334155, transparent: true, opacity: 0.8 });
        for (let i=0; i<count; i++) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set((Math.random()-0.5)*120, (Math.random()-0.5)*120, (Math.random()-0.5)*120);
            this.scene.add(m); this.obstacles.push(m);
        }
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
            });
        };
        ['separation', 'alignment', 'cohesion', 'avoidance', 'fear', 'food-attraction'].forEach(k => bind(k, k.replace('-',''), this.params.forces));
        bind('small-fish', 'smallFishRatio', this.params.boidTypes);
        bind('large-fish', 'largeFishRatio', this.params.boidTypes);
        bind('birds', 'birdRatio', this.params.boidTypes);
        
        document.getElementById('pauseResume').onclick = (e) => { this.isPaused = !this.isPaused; e.target.textContent = this.isPaused ? "Resume" : "Pause"; };
        document.getElementById('reset').onclick = () => { location.reload(); };
        document.getElementById('addBoids').onclick = () => this.createBoids(10);
        document.getElementById('removeBoids').onclick = () => { const removed = this.boids.splice(-10); removed.forEach(() => {}); this.reconstructInstancedMeshes(); };

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
        const fps = 1000 / (performance.now() - this.lastTime);
        this.lastTime = performance.now();
        
        document.getElementById('fps').textContent = Math.floor(fps);
        document.getElementById('boidCount').textContent = this.boids.length;

        if (!this.isPaused) {
            this.grid.clear(); this.boids.forEach(b => this.grid.add(b));
            
            for (let i = this.boids.length - 1; i >= 0; i--) {
                const b = this.boids[i];
                const res = b.applyRules(this.grid.getNearby(b.position, 30), this.predators, this.foodSources, this.obstacles, this.params);
                if (res && res.consume) {
                    const idx = this.foodSources.indexOf(res.consume);
                    if (idx !== -1) { this.scene.remove(res.consume.mesh); this.foodSources.splice(idx, 1); }
                }
                b.update(this.params, dt);
                const imesh = this.instancedMeshes[b.type.name];
                if (imesh) imesh.setMatrixAt(b.idx, b.matrix);
            }
            for (let k in this.instancedMeshes) this.instancedMeshes[k].instanceMatrix.needsUpdate = true;

            for (let i = this.predators.length - 1; i >= 0; i--) {
                const caught = this.predators[i].update(this.boids, this.params, dt);
                if (caught) {
                    const idx = this.boids.indexOf(caught);
                    if (idx !== -1) { this.boids.splice(idx, 1); this.reconstructInstancedMeshes(); }
                }
            }
            if (Math.random() < this.params.food.spawnRate && this.foodSources.length < 30) this.createFoodSources(1);
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Start
window.addEventListener('load', () => {
    if (window.location.protocol === 'file:') {
        console.warn("Detected file:// protocol. ES modules might be blocked. Consolidation should help.");
    }
    new Simulation();
});
