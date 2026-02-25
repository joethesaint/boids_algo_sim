/**
 * Boids Flocking Simulation - Maximum Speed & Ultra Smoothness
 */

// --- Optimized Spatial Hash Grid ---
class SpatialHashGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }
    
    _hash(v) {
        const x = Math.floor(v.x / this.cellSize);
        const y = Math.floor(v.y / this.cellSize);
        const z = Math.floor(v.z / this.cellSize);
        // Optimized numeric hash to avoid string garbage
        return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    }

    clear() { this.cells.clear(); }

    add(obj) {
        const h = this._hash(obj.position);
        let cell = this.cells.get(h);
        if (!cell) {
            cell = [];
            this.cells.set(h, cell);
        }
        cell.push(obj);
    }

    getNearby(v, radius) {
        const results = [];
        const cellsToCheck = Math.ceil(radius / this.cellSize);
        const cx = Math.floor(v.x / this.cellSize), cy = Math.floor(v.y / this.cellSize), cz = Math.floor(v.z / this.cellSize);
        
        for (let x = cx - cellsToCheck; x <= cx + cellsToCheck; x++) {
            for (let y = cy - cellsToCheck; y <= cy + cellsToCheck; y++) {
                for (let z = cz - cellsToCheck; z <= cz + cellsToCheck; z++) {
                    const h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
                    const cell = this.cells.get(h);
                    if (cell) {
                        for (let i = 0; i < cell.length; i++) results.push(cell[i]);
                    }
                }
            }
        }
        return results;
    }
}

const BOID_TYPES = {
    SMALL_FISH: { name: 'Small Fish', geometry: () => new THREE.ConeGeometry(0.6, 2, 6), color: 0x00d2ff, maxSpeed: 4.5, maxForce: 0.25, fearRadiusSq: 1225, glow: 0.6 },
    LARGE_FISH: { name: 'Large Fish', geometry: () => new THREE.ConeGeometry(1.4, 4, 8), color: 0xff8c00, maxSpeed: 2.8, maxForce: 0.18, fearRadiusSq: 2025, glow: 0.8 },
    BIRD: { name: 'Bird', geometry: () => new THREE.ConeGeometry(1.0, 3, 6), color: 0x00ff88, maxSpeed: 5.5, maxForce: 0.35, fearRadiusSq: 2500, glow: 0.7 }
};

// Global scratch variables for zero-allocation math
let _v1, _v2, _v3, _v4, _v5, _dummy;
function initScratch() {
    if (_v1) return;
    _v1 = new THREE.Vector3(); _v2 = new THREE.Vector3(); _v3 = new THREE.Vector3();
    _v4 = new THREE.Vector3(); _v5 = new THREE.Vector3(); _dummy = new THREE.Object3D();
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
        this.active = true;
    }

    applyRules(neighbors, predators, foodSources, obstacles, params) {
        if (!this.active) return null;
        this.acceleration.set(0, 0, 0);
        const sep = _v1.set(0,0,0), ali = _v2.set(0,0,0), coh = _v3.set(0,0,0);
        let sC = 0, aC = 0, cC = 0;

        const sepDistSq = params.perception.separation * params.perception.separation;
        const flockDistSq = 1225; // 35^2

        for (let i = 0; i < neighbors.length; i++) {
            const other = neighbors[i];
            if (other === this || !other.active) continue;
            const dSq = this.position.distanceToSquared(other.position);
            
            if (dSq < sepDistSq && dSq > 0) {
                sep.add(_v4.subVectors(this.position, other.position).normalize().divideScalar(Math.sqrt(dSq)));
                sC++;
            }
            if (dSq < flockDistSq) {
                ali.add(other.velocity); aC++;
                coh.add(other.position); cC++;
            }
        }

        if (sC > 0) this.acceleration.add(sep.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(params.forces.separation));
        if (aC > 0) this.acceleration.add(ali.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(params.forces.alignment));
        if (cC > 0) this.acceleration.add(coh.divideScalar(cC).sub(this.position).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(params.forces.cohesion));

        for (let i = 0; i < predators.length; i++) {
            const dSq = this.position.distanceToSquared(predators[i].position);
            if (dSq < this.type.fearRadiusSq) {
                const flee = _v4.subVectors(this.position, predators[i].position).normalize().multiplyScalar(this.maxSpeed * 2.5);
                this.acceleration.add(flee.sub(this.velocity).clampLength(0, this.maxForce * 3).multiplyScalar(3.0));
            }
        }

        for (let i = 0; i < obstacles.length; i++) {
            const dSq = this.position.distanceToSquared(obstacles[i].position);
            if (dSq < 900) { // 30^2
                const avoid = _v4.subVectors(this.position, obstacles[i].position).normalize().multiplyScalar(this.maxSpeed * 2);
                this.acceleration.add(avoid.sub(this.velocity).clampLength(0, this.maxForce * 2.5).multiplyScalar(2.5));
            }
        }

        let closestF = null, minFDSq = Infinity;
        for (let i = 0; i < foodSources.length; i++) {
            const dSq = this.position.distanceToSquared(foodSources[i].position);
            if (dSq < 3600 && dSq < minFDSq) { closestF = foodSources[i]; minFDSq = dSq; }
        }
        if (closestF) {
            const seek = _v4.subVectors(closestF.position, this.position).normalize().multiplyScalar(this.maxSpeed);
            this.acceleration.add(seek.sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(1.8));
            if (minFDSq < 16) return { consume: closestF };
        }

        const m = params.bounds * 0.95;
        const bS = _v4.set(0,0,0);
        if (this.position.x < -m) bS.x = 1; else if (this.position.x > m) bS.x = -1;
        if (this.position.y < -m) bS.y = 1; else if (this.position.y > m) bS.y = -1;
        if (this.position.z < -m) bS.z = 1; else if (this.position.z > m) bS.z = -1;
        if (bS.lengthSq() > 0) this.acceleration.add(bS.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce * 4));

        return null;
    }

    update(params, dt) {
        if (!this.active) return;
        this.velocity.add(this.acceleration.multiplyScalar(dt * 60));
        this.velocity.clampLength(params.speed.min, params.speed.max);
        this.position.addScaledVector(this.velocity, dt * 60);
    }
}

class Predator {
    constructor(position, params) {
        const geo = new THREE.SphereGeometry(4, 12, 12);
        const mat = new THREE.MeshPhongMaterial({ color: 0xff3333, emissive: 0xff0000, emissiveIntensity: 1.0 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.position = position.clone();
        this.velocity = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize().multiplyScalar(3.0);
        this.maxSpeed = params.predators.speed;
        this.huntCooldown = 0;
    }
    update(boids, params, dt) {
        const step = dt * 60;
        if (this.huntCooldown > 0) this.huntCooldown -= step;
        let target = null, minDistSq = Infinity;
        const huntRadiusSq = params.predators.huntRadius * params.predators.huntRadius;
        for (let i = 0; i < boids.length; i++) {
            if (!boids[i].active) continue;
            const dSq = this.position.distanceToSquared(boids[i].position);
            if (dSq < huntRadiusSq && dSq < minDistSq) { target = boids[i]; minDistSq = dSq; }
        }
        const acc = _v4.set(0,0,0);
        let caught = null;
        if (target && this.huntCooldown <= 0) {
            acc.subVectors(target.position, this.position).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, 0.6);
            if (minDistSq < 36) { this.huntCooldown = 180; caught = target; }
        } else {
            acc.set(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(0.2);
        }
        this.velocity.add(acc.multiplyScalar(step)).clampLength(0, this.maxSpeed);
        this.position.addScaledVector(this.velocity, step);
        const b = params.bounds * 1.4;
        if (Math.abs(this.position.x) > b) this.position.x *= -0.9;
        if (Math.abs(this.position.y) > b) this.position.y *= -0.9;
        if (Math.abs(this.position.z) > b) this.position.z *= -0.9;
        this.mesh.position.copy(this.position);
        return caught;
    }
}

class Simulation {
    constructor() {
        this.params = {
            count: 300, bounds: 150,
            boidTypes: { smallFishRatio: 0.5, largeFishRatio: 0.3, birdRatio: 0.2 },
            predators: { count: 4, huntRadius: 70, speed: 5.0 },
            food: { count: 25, spawnRate: 0.03, attractionRadius: 60 },
            speed: { min: 1.2, max: 6.0 },
            forces: { separation: 2.2, alignment: 1.6, cohesion: 1.2 },
            perception: { separation: 18 },
            lighting: { ambient: 0.5, bloom: 1.8 }
        };
        this.boids = []; this.predators = []; this.foodSources = []; this.obstacles = []; this.instancedMeshes = {};
        this.grid = new SpatialHashGrid(30); this.clock = new THREE.Clock(); this.isPaused = false; this.followedBoid = null;
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x010103);
        this.scene.fog = new THREE.Fog(0x010103, 200, 1500);
        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth/window.innerHeight, 0.1, 10000);
        this.camera.position.set(0, 200, 500);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        document.body.appendChild(this.renderer.domElement);
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        try {
            this.composer = new THREE.EffectComposer(this.renderer);
            this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
            this.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.8, 0.4, 0.85);
            this.composer.addPass(this.bloomPass);
        } catch(e) { this.composer = null; }

        this.setupLighting();
        this.setupEnvironment();
        this.initInstancedMeshes();
        this.createBoids(this.params.count);
        this.createPredators(this.params.predators.count);
        this.createFoodSources(this.params.food.count);
        this.createObstacles(8);
        this.setupUI();
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            if(this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
        });
        this.animate();
    }

    setupLighting() {
        this.scene.add(new THREE.AmbientLight(0xffffff, this.params.lighting.ambient));
        const p1 = new THREE.PointLight(0x00d2ff, 3, 1500); p1.position.set(300, 300, 300);
        const p2 = new THREE.PointLight(0xff8c00, 2, 1500); p2.position.set(-300, -300, -300);
        this.scene.add(p1, p2);
    }

    setupEnvironment() {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(this.params.bounds*2, this.params.bounds*2, this.params.bounds*2)), new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.15 }));
        this.scene.add(edges);
        const grid = new THREE.GridHelper(this.params.bounds*2, 15, 0x1e293b, 0x0f172a);
        grid.position.y = -this.params.bounds; this.scene.add(grid);
    }

    initInstancedMeshes() {
        const MAX = 5000;
        const types = [BOID_TYPES.SMALL_FISH, BOID_TYPES.LARGE_FISH, BOID_TYPES.BIRD];
        types.forEach(type => {
            const mat = new THREE.MeshPhongMaterial({ color: type.color, shininess: 100, emissive: type.color, emissiveIntensity: type.glow });
            const imesh = new THREE.InstancedMesh(type.geometry(), mat, MAX);
            imesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            imesh.count = 0;
            this.scene.add(imesh);
            this.instancedMeshes[type.name] = imesh;
        });
    }

    updateInstancedMeshes() {
        const counts = {};
        for (let k in this.instancedMeshes) { counts[k] = 0; }
        
        for (let i = 0; i < this.boids.length; i++) {
            const b = this.boids[i];
            if (!b.active) continue;
            
            const imesh = this.instancedMeshes[b.type.name];
            const idx = counts[b.type.name];
            
            _dummy.position.copy(b.position);
            if (b.velocity.lengthSq() > 0.001) {
                _dummy.lookAt(_v4.copy(b.position).add(b.velocity));
                _dummy.rotateX(Math.PI / 2);
            }
            _dummy.updateMatrix();
            imesh.setMatrixAt(idx, _dummy.matrix);
            counts[b.type.name]++;
        }
        
        for (let k in this.instancedMeshes) {
            this.instancedMeshes[k].count = counts[k];
            this.instancedMeshes[k].instanceMatrix.needsUpdate = true;
        }
    }

    createBoids(count) {
        const r = [this.params.boidTypes.smallFishRatio, this.params.boidTypes.largeFishRatio];
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            const type = rand < r[0] ? BOID_TYPES.SMALL_FISH : (rand < r[0]+r[1] ? BOID_TYPES.LARGE_FISH : BOID_TYPES.BIRD);
            this.boids.push(new Boid(type, new THREE.Vector3((Math.random()-0.5)*300, (Math.random()-0.5)*300, (Math.random()-0.5)*300), this.params));
        }
    }

    createPredators(count) {
        this.predators.forEach(p => this.scene.remove(p.mesh)); this.predators = [];
        for (let i=0; i<count; i++) {
            const p = new Predator(new THREE.Vector3((Math.random()-0.5)*400, (Math.random()-0.5)*400, (Math.random()-0.5)*400), this.params);
            this.scene.add(p.mesh); this.predators.push(p);
        }
    }

    createFoodSources(count) {
        const geo = new THREE.SphereGeometry(1.8, 8, 8);
        const mat = new THREE.MeshPhongMaterial({ color: 0x32cd32, emissive: 0x32cd32, emissiveIntensity: 0.8 });
        for (let i=0; i<count; i++) {
            const m = new THREE.Mesh(geo, mat); m.position.set((Math.random()-0.5)*350, (Math.random()-0.5)*350, (Math.random()-0.5)*350);
            this.scene.add(m); this.foodSources.push({ mesh: m, position: m.position });
        }
    }

    createObstacles(count) {
        const geo = new THREE.SphereGeometry(12, 12, 12);
        const mat = new THREE.MeshPhongMaterial({ color: 0x1e293b, transparent: true, opacity: 0.4 });
        for (let i=0; i<count; i++) {
            const m = new THREE.Mesh(geo, mat); m.position.set((Math.random()-0.5)*250, (Math.random()-0.5)*250, (Math.random()-0.5)*250);
            m.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x63b3ed, transparent: true, opacity: 0.15 })));
            this.scene.add(m); this.obstacles.push(m);
        }
    }

    setupUI() {
        const bind = (id, param, obj) => {
            const el = document.getElementById(id); if (!el) return;
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                obj[param] = id.includes('fish') || id === 'birds' ? val/100 : val;
                const vEl = document.getElementById(id+'-value'); if (vEl) vEl.textContent = val;
                if (id === 'bloom' && this.bloomPass) this.bloomPass.strength = val;
                if (id === 'ambient') this.scene.children.filter(c => c.type === 'AmbientLight').forEach(l => l.intensity = val);
            });
        };
        ['separation', 'alignment', 'cohesion'].forEach(k => bind(k, k, this.params.forces));
        bind('small-fish', 'smallFishRatio', this.params.boidTypes);
        bind('large-fish', 'largeFishRatio', this.params.boidTypes);
        bind('bloom', 'bloom', this.params.lighting);
        bind('ambient', 'ambient', this.params.lighting);
        document.getElementById('pauseResume').onclick = (e) => { this.isPaused = !this.isPaused; e.target.textContent = this.isPaused ? "Resume" : "Pause"; };
        document.getElementById('reset').onclick = () => location.reload();
        document.getElementById('addBoids').onclick = () => this.createBoids(100);
        document.getElementById('removeBoids').onclick = () => { 
            let count = 0;
            for (let i = this.boids.length - 1; i >= 0 && count < 100; i--) {
                if (this.boids[i].active) { this.boids[i].active = false; count++; }
            }
        };
        document.getElementById('fps-view').onclick = (e) => {
            if (this.followedBoid) { this.followedBoid = null; e.target.classList.remove('active'); e.target.textContent = "Follow Boid"; this.controls.enabled = true; }
            else {
                const activeOnes = this.boids.filter(b => b.active);
                if (activeOnes.length > 0) {
                    this.followedBoid = activeOnes[Math.floor(Math.random()*activeOnes.length)];
                    e.target.classList.add('active'); e.target.textContent = "Stop Following"; this.controls.enabled = false;
                }
            }
        };
        window.toggleSection = (h) => {
            const c = h.nextElementSibling; const a = h.querySelector('.arrow');
            c.classList.toggle('collapsed'); a.textContent = c.classList.contains('collapsed') ? '▼' : '▲';
        };
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = Math.min(this.clock.getDelta(), 0.05);
        if (!this.isPaused) {
            this.grid.clear();
            for (let i = 0; i < this.boids.length; i++) if (this.boids[i].active) this.grid.add(this.boids[i]);
            
            for (let i = 0; i < this.boids.length; i++) {
                const b = this.boids[i];
                if (!b.active) continue;
                const res = b.applyRules(this.grid.getNearby(b.position, 45), this.predators, this.foodSources, this.obstacles, this.params);
                if (res && res.consume) {
                    const idx = this.foodSources.indexOf(res.consume);
                    if (idx !== -1) { this.scene.remove(res.consume.mesh); this.foodSources.splice(idx, 1); }
                }
                b.update(this.params, dt);
            }
            this.updateInstancedMeshes();
            this.predators.forEach(p => {
                const caught = p.update(this.boids, this.params, dt);
                if (caught) caught.active = false;
            });
            if (Math.random() < this.params.food.spawnRate && this.foodSources.length < 50) this.createFoodSources(1);
        }
        if (this.followedBoid && this.followedBoid.active) {
            const offset = _v5.copy(this.followedBoid.velocity).normalize().multiplyScalar(-35).add(_v1.set(0, 15, 0));
            this.camera.position.lerp(_v2.copy(this.followedBoid.position).add(offset), 0.1);
            this.camera.lookAt(this.followedBoid.position);
        } else if (this.followedBoid) {
            this.followedBoid = null;
            this.controls.enabled = true;
            document.getElementById('fps-view').classList.remove('active');
            document.getElementById('fps-view').textContent = "Follow Boid";
        }
        document.getElementById('fps').textContent = Math.round(1/(dt||0.01));
        document.getElementById('boidCount').textContent = this.boids.filter(b => b.active).length;
        this.controls.update();
        if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => new Simulation());
