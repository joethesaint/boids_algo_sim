/**
 * Boids Flocking Simulation - Premium Cinematic Edition
 * Optimized with Spatial Partitioning & Instanced Rendering
 */

class SpatialHashGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
        this._results = []; // Pre-allocated reusable array
    }

    _hash(v) {
        const x = Math.floor(v.x / this.cellSize);
        const y = Math.floor(v.y / this.cellSize);
        const z = Math.floor(v.z / this.cellSize);
        return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    }

    clear() { this.cells.clear(); }

    add(obj) {
        const h = this._hash(obj.position);
        let cell = this.cells.get(h);
        if (!cell) { cell = []; this.cells.set(h, cell); }
        cell.push(obj);
    }

    getNearby(v, radius) {
        this._results.length = 0; // Clear without re-allocating
        const cellsToCheck = Math.ceil(radius / this.cellSize);
        const cx = Math.floor(v.x / this.cellSize), cy = Math.floor(v.y / this.cellSize), cz = Math.floor(v.z / this.cellSize);
        for (let x = cx - cellsToCheck; x <= cx + cellsToCheck; x++) {
            for (let y = cy - cellsToCheck; y <= cy + cellsToCheck; y++) {
                for (let z = cz - cellsToCheck; z <= cz + cellsToCheck; z++) {
                    const h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
                    const cell = this.cells.get(h);
                    if (cell) {
                        for (let i = 0; i < cell.length; i++) this._results.push(cell[i]);
                    }
                }
            }
        }
        return this._results;
    }
}

// --- Batched Trail System ---
// All trails of a given boid type share ONE LineSegments mesh (one draw call)
// instead of one THREE.Line per boid. This is the single biggest win for
// boid counts in the hundreds: 250 boids previously meant 250 draw calls
// just for trails.
class TrailSystem {
    constructor(scene, color, maxTrails, trailLength = 20) {
        this.maxTrails = maxTrails;
        this.trailLength = trailLength;
        this.segmentsPerTrail = trailLength - 1;
        this.vertsPerTrail = this.segmentsPerTrail * 2;

        // Ring-buffer state per trail slot
        this.heads = new Uint16Array(maxTrails);
        this.points = new Array(maxTrails);
        for (let t = 0; t < maxTrails; t++) {
            const arr = new Array(trailLength);
            for (let i = 0; i < trailLength; i++) arr[i] = new THREE.Vector3();
            this.points[t] = arr;
        }

        // Free-list of trail slot indices
        this.freeIndices = [];
        for (let i = maxTrails - 1; i >= 0; i--) this.freeIndices.push(i);

        const totalVerts = maxTrails * this.vertsPerTrail;
        const geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(totalVerts * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

        // Alpha only depends on a vertex's age-within-trail, which is the
        // same pattern for every slot, so it's static (never re-uploaded).
        const alphas = new Float32Array(totalVerts);
        const pattern = new Float32Array(this.vertsPerTrail);
        let vi = 0;
        for (let s = 0; s < this.segmentsPerTrail; s++) {
            pattern[vi++] = s / (trailLength - 1);
            pattern[vi++] = (s + 1) / (trailLength - 1);
        }
        for (let t = 0; t < maxTrails; t++) alphas.set(pattern, t * this.vertsPerTrail);
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: { color: { value: new THREE.Color(color) } },
            vertexShader: `
                attribute float alpha;
                varying float vAlpha;
                void main() {
                    vAlpha = alpha;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                varying float vAlpha;
                void main() {
                    gl_FragColor = vec4(color, vAlpha * 0.3);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.mesh = new THREE.LineSegments(geometry, this.material);
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }

    allocate() {
        if (this.freeIndices.length === 0) return -1;
        return this.freeIndices.pop();
    }

    release(index) {
        if (index < 0) return;
        this.collapse(index);
        this.freeIndices.push(index);
    }

    // Collapse a slot's segments to zero length so it stops rendering
    // without needing to touch draw range / index buffers.
    collapse(index) {
        const pts = this.points[index];
        const last = pts[(this.heads[index] - 1 + this.trailLength) % this.trailLength];
        for (let i = 0; i < this.trailLength; i++) pts[i].copy(last);
        this._writeSegments(index);
    }

    update(index, position) {
        const pts = this.points[index];
        pts[this.heads[index]].copy(position);
        this.heads[index] = (this.heads[index] + 1) % this.trailLength;
        this._writeSegments(index);
    }

    _writeSegments(index) {
        const pts = this.points[index];
        const head = this.heads[index];
        const base = index * this.vertsPerTrail * 3;
        let vi = base;
        for (let s = 0; s < this.segmentsPerTrail; s++) {
            const a = pts[(head + s) % this.trailLength];
            const b = pts[(head + s + 1) % this.trailLength];
            this.positions[vi] = a.x; this.positions[vi + 1] = a.y; this.positions[vi + 2] = a.z; vi += 3;
            this.positions[vi] = b.x; this.positions[vi + 1] = b.y; this.positions[vi + 2] = b.z; vi += 3;
        }
    }

    commit() {
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }

    destroy() {
        this.mesh.parent && this.mesh.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}

const BOID_TYPES = {
    SMALL_FISH: { name: 'Small Fish', geometry: () => new THREE.ConeGeometry(0.5, 1.8, 4), color: 0x00d2ff, maxSpeed: 4.5, maxForce: 0.25, fearRadiusSq: 1225, glow: 0.8 },
    LARGE_FISH: { name: 'Large Fish', geometry: () => new THREE.ConeGeometry(1.2, 3.5, 6), color: 0xff8c00, maxSpeed: 2.8, maxForce: 0.18, fearRadiusSq: 2025, glow: 1.0 },
    BIRD: { name: 'Bird', geometry: () => new THREE.ConeGeometry(0.8, 2.5, 3), color: 0x00ff88, maxSpeed: 5.5, maxForce: 0.35, fearRadiusSq: 2500, glow: 0.9 }
};

let _v1, _v2, _v3, _v4, _v5, _dummy;
function initScratch() {
    if (_v1) return;
    _v1 = new THREE.Vector3(); _v2 = new THREE.Vector3(); _v3 = new THREE.Vector3();
    _v4 = new THREE.Vector3(); _v5 = new THREE.Vector3(); _dummy = new THREE.Object3D();
}

class Boid {
    constructor(type, position, params, trailSystem) {
        initScratch();
        this.type = type;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(params.speed.min);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.quaternion = new THREE.Quaternion();
        this.maxSpeed = type.maxSpeed;
        this.maxForce = type.maxForce;
        this.active = true;
        this.trailSystem = trailSystem || null;
        this.trailIndex = trailSystem ? trailSystem.allocate() : -1;
    }

    applyRules(neighbors, predators, foodSources, obstacles, params, mouse3D) {
        if (!this.active) return null;
        this.acceleration.set(0, 0, 0);
        const sep = _v1.set(0, 0, 0), ali = _v2.set(0, 0, 0), coh = _v3.set(0, 0, 0);
        let sC = 0, aC = 0, cC = 0;

        const sepDistSq = params.perception.separation * params.perception.separation;
        const flockDistSq = 1225; // 35^2
        const isSmallFish = this.type === BOID_TYPES.SMALL_FISH;
        let fleeX = 0, fleeY = 0, fleeZ = 0, fC = 0;

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
            // Species Interaction: small fish avoid large fish. Folded into
            // this same neighbor pass instead of a second full scan below.
            if (isSmallFish && dSq < 1600 && other.type === BOID_TYPES.LARGE_FISH) {
                fleeX += this.position.x - other.position.x;
                fleeY += this.position.y - other.position.y;
                fleeZ += this.position.z - other.position.z;
                fC++;
            }
        }

        if (sC > 0) this.acceleration.add(sep.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(params.forces.separation));
        if (aC > 0) this.acceleration.add(ali.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(params.forces.alignment));
        if (cC > 0) this.acceleration.add(coh.divideScalar(cC).sub(this.position).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce).multiplyScalar(params.forces.cohesion));

        // Mouse Influence
        if (mouse3D && params.features.followMouse) {
            const dSq = this.position.distanceToSquared(mouse3D);
            if (dSq < 20000) {
                const steer = _v4.subVectors(this.position, mouse3D).normalize().multiplyScalar(this.maxSpeed * 2.5);
                this.acceleration.add(steer.sub(this.velocity).clampLength(0, this.maxForce * 3).multiplyScalar(-1.5));
            }
        }

        // Species Interaction: Small fish avoid large fish (accumulated in
        // the neighbor loop above instead of a second full scan here).
        if (fC > 0) {
            const flee = _v4.set(fleeX, fleeY, fleeZ).normalize().multiplyScalar(this.maxSpeed * 1.5);
            this.acceleration.add(flee.sub(this.velocity).clampLength(0, this.maxForce * 2).multiplyScalar(1.2));
        }

        // Slight Wander for natural motion
        this.acceleration.add(_v4.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.3));

        // Ecosystem Layering
        if (params.features.layering) {
            const targetY = this.type === BOID_TYPES.BIRD ? params.bounds * 0.6 : -params.bounds * 0.2;
            const distY = targetY - this.position.y;
            this.acceleration.y += distY * 0.02;
        }

        if (params.features.predators) {
            for (let i = 0; i < predators.length; i++) {
                const dSq = this.position.distanceToSquared(predators[i].position);
                if (dSq < this.type.fearRadiusSq) {
                    const flee = _v4.subVectors(this.position, predators[i].position).normalize().multiplyScalar(this.maxSpeed * 3);
                    this.acceleration.add(flee.sub(this.velocity).clampLength(0, this.maxForce * 4).multiplyScalar(3.5));
                }
            }
        }

        for (let i = 0; i < obstacles.length; i++) {
            const dSq = this.position.distanceToSquared(obstacles[i].position);
            if (dSq < 900) {
                const avoid = _v4.subVectors(this.position, obstacles[i].position).normalize().multiplyScalar(this.maxSpeed * 2);
                this.acceleration.add(avoid.sub(this.velocity).clampLength(0, this.maxForce * 2.5).multiplyScalar(2.5));
            }
        }

        if (params.features.food) {
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
        }

        // Boundary Logic: Only if not wrapping
        if (!params.features.wrapSpace) {
            const m = params.bounds * 0.95;
            const bS = _v4.set(0, 0, 0);
            if (this.position.x < -m) bS.x = 1; else if (this.position.x > m) bS.x = -1;
            if (this.position.y < -m) bS.y = 1; else if (this.position.y > m) bS.y = -1;
            if (this.position.z < -m) bS.z = 1; else if (this.position.z > m) bS.z = -1;
            if (bS.lengthSq() > 0) this.acceleration.add(bS.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce * 4));
        }

        return null;
    }

    update(params, dt) {
        if (!this.active) return;
        this.velocity.add(this.acceleration.multiplyScalar(dt * 60));
        this.velocity.clampLength(params.speed.min, params.speed.max);
        this.position.addScaledVector(this.velocity, dt * 60);

        // Position Wrapping
        if (params.features.wrapSpace) {
            const m = params.bounds;
            if (this.position.x < -m) this.position.x = m; else if (this.position.x > m) this.position.x = -m;
            if (this.position.y < -m) this.position.y = m; else if (this.position.y > m) this.position.y = -m;
            if (this.position.z < -m) this.position.z = m; else if (this.position.z > m) this.position.z = -m;
        }

        if (this.trailSystem && this.trailIndex >= 0 && params.features.trails) {
            this.trailSystem.update(this.trailIndex, this.position);
        }
    }

    destroy() {
        if (this.trailSystem && this.trailIndex >= 0) {
            this.trailSystem.release(this.trailIndex);
            this.trailIndex = -1;
        }
    }
}

class Predator {
    constructor(position, params) {
        const geo = new THREE.SphereGeometry(4, 12, 12);
        const mat = new THREE.MeshPhongMaterial({ color: 0xff3333, emissive: 0xff0000, emissiveIntensity: 1.0 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.position = position.clone();
        this.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3.0);
        this.maxSpeed = params.predators.speed;
        this.huntCooldown = 0;
    }
    update(grid, params, dt) {
        const step = dt * 60;
        if (this.huntCooldown > 0) this.huntCooldown -= step;
        let target = null, maxPriorityDistSq = -1, targetDistSq = Infinity;
        const huntRadius = params.predators.huntRadius;
        const huntRadiusSq = huntRadius * huntRadius;

        // Query the same spatial grid the boids use instead of scanning
        // every boid in the flock — keeps hunting cheap as boid counts scale
        // into the thousands instead of costing O(N) per predator per frame.
        const nearby = grid.getNearby(this.position, huntRadius);
        for (let i = 0; i < nearby.length; i++) {
            const b = nearby[i];
            if (!b.active) continue;
            const dSq = this.position.distanceToSquared(b.position);
            if (dSq < huntRadiusSq) {
                // Priority: Large Fish > Bird > Small Fish
                const priority = (b.type === BOID_TYPES.LARGE_FISH ? 3.0 : (b.type === BOID_TYPES.BIRD ? 2.0 : 1.0));
                const score = priority / (Math.sqrt(dSq) + 1);
                if (score > maxPriorityDistSq) { target = b; maxPriorityDistSq = score; targetDistSq = dSq; }
            }
        }
        const acc = _v4.set(0, 0, 0);
        let caught = null;
        if (target && this.huntCooldown <= 0) {
            const targetDistSq = this.position.distanceToSquared(target.position);
            acc.subVectors(target.position, this.position).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, 0.6);
            if (targetDistSq < 49) { this.huntCooldown = 180; caught = target; }
        } else {
            acc.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.2);
        }
        this.velocity.add(acc.multiplyScalar(step)).clampLength(0, this.maxSpeed);
        this.position.addScaledVector(this.velocity, step);

        // Boundary/Wrapping Logic
        if (params.features.wrapSpace) {
            const m = params.bounds * 1.4;
            if (this.position.x < -m) this.position.x = m; else if (this.position.x > m) this.position.x = -m;
            if (this.position.y < -m) this.position.y = m; else if (this.position.y > m) this.position.y = -m;
            if (this.position.z < -m) this.position.z = m; else if (this.position.z > m) this.position.z = -m;
        } else {
            const b = params.bounds * 1.4;
            if (Math.abs(this.position.x) > b) this.position.x *= -0.9;
            if (Math.abs(this.position.y) > b) this.position.y *= -0.9;
            if (Math.abs(this.position.z) > b) this.position.z *= -0.9;
        }

        // Layering for Predators (Stay in water)
        if (params.features.layering) {
            const targetY = -params.bounds * 0.2;
            this.position.y = THREE.MathUtils.lerp(this.position.y, Math.min(this.position.y, targetY + 20), 0.05);
        }

        this.mesh.position.copy(this.position);
        return caught;
    }
}

class Simulation {
    constructor() {
        this.params = {
            count: 250, bounds: 150,
            boidTypes: { smallFishRatio: 0.5, largeFishRatio: 0.3, birdRatio: 0.2 },
            predators: { count: 3, huntRadius: 70, speed: 5.0 },
            food: { count: 15, spawnRate: 0.02 },
            speed: { min: 1.0, max: 5.0 },
            forces: { separation: 2.0, alignment: 1.4, cohesion: 1.1 },
            perception: { separation: 16 },
            lighting: { ambient: 0.6, bloom: 1.8, pointLight: 5.0 },
            performance: { simSpeed: 1.0, fpsLimit: 60 },
            audio: { enabled: false, sensitivity: 1.0 },
            features: { trails: true, food: true, predators: true, followMouse: true, layering: true, wrapSpace: false, lightMode: false }
        };
        this.isMobile = this.detectMobile();
        if (this.isMobile) {
            // Leaner defaults so mid-range phones hold a stable framerate.
            this.params.count = 120;
            this.params.predators.count = 2;
            this.params.food.count = 8;
            this.params.performance.fpsLimit = 30;
            this.params.features.trails = false;
        }

        this.boids = []; this.predators = []; this.foodSources = []; this.obstacles = []; this.instancedMeshes = {};
        this.trailSystems = {};
        this.pointLights = [];
        this.envMeshes = { edges: null, grid: null };
        // Neighbor query radius must cover the largest radius checked against
        // grid-sourced neighbors (species avoidance at 40). Cell size matches
        // it so getNearby only has to scan a 3x3x3 block of cells instead of
        // a much larger one.
        this.neighborRadius = 40;
        this.grid = new SpatialHashGrid(this.neighborRadius); this.clock = new THREE.Clock(); this.isPaused = false; this.followedBoid = null;
        this.lastFrameTime = 0;
        this.mouse3D = new THREE.Vector3(); this.raycaster = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
        this.mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        this.audioContext = null; this.analyser = null; this.dataArray = null; this.audioSource = null;
        // Reused each frame instead of a fresh `{ ...this.params }` spread,
        // to avoid an allocation on every tick of the render loop.
        this.frameParams = Object.assign({}, this.params, { speed: { min: 0, max: 0 } });
        this.fpsEl = null; this.boidCountEl = null;
        this.init();
    }

    detectMobile() {
        const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const narrowScreen = Math.min(window.innerWidth, window.innerHeight) <= 820;
        const uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        return uaMobile || (coarsePointer && narrowScreen);
    }

    // A flat fill reads as a stark, clinical wall of color — especially the
    // pale gray of light mode, which ACESFilmicToneMapping crushes toward a
    // dull mid-gray if set as a plain scene.background color. A big inverted
    // sphere with a per-vertex gradient (and toneMapped:false, so it renders
    // its true colors untouched) gives the scene a real "sky" in both themes.
    createSkyDome(topColor, bottomColor) {
        const radius = 6000;
        const geo = new THREE.SphereGeometry(radius, 24, 16);
        const top = new THREE.Color(topColor), bottom = new THREE.Color(bottomColor);
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
            const t = THREE.MathUtils.clamp(pos.getY(i) / radius * 0.5 + 0.5, 0, 1);
            const c = bottom.clone().lerp(top, t);
            colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = -1000;
        return mesh;
    }

    init() {
        this.scene = new THREE.Scene();
        this.skyDome = this.createSkyDome('#0a0f1c', '#020205');
        this.scene.add(this.skyDome);
        this.scene.fog = new THREE.Fog(0x020205, 200, 1500);
        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.camera.position.set(0, 150, 400);
        this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        document.body.appendChild(this.renderer.domElement);
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        
        // Disable right-click panning so the browser context menu can appear
        this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
        this.renderer.domElement.addEventListener('contextmenu', e => e.stopPropagation(), true);

        // OrbitControls already defaults touches to {ONE: ROTATE, TWO: DOLLY_PAN}; kept explicit for clarity.
        this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

        try {
            this.composer = new THREE.EffectComposer(this.renderer);
            this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
            const bloomScale = this.isMobile ? 0.6 : 1;
            this.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth * bloomScale, window.innerHeight * bloomScale), 1.8, 0.4, 0.85);
            this.composer.addPass(this.bloomPass);
            // Vignette pass removed — darkened edges were hiding the scene.
        } catch (e) { console.error("Composer Error", e); }

        this.setupLighting();
        this.setupEnvironment();
        this.initInstancedMeshes();
        this.initTrailSystems();
        this.createBoids(this.params.count);
        this.createPredators(this.params.predators.count);
        this.createFoodSources(this.params.food.count);
        this.createObstacles(this.isMobile ? 3 : 6);
        this.setupUI();
        this.fpsEl = document.getElementById('fps');
        this.boidCountEl = document.getElementById('boidCount');

        const handleResize = () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);
        // 'resize' can fire before iOS/Android finish rotating the layout; re-check shortly after.
        window.addEventListener('orientationchange', () => setTimeout(handleResize, 300));
        if (window.visualViewport) window.visualViewport.addEventListener('resize', handleResize);

        // setAnimationLoop is the modern replacement for manually recursing
        // requestAnimationFrame — same callback semantics, but it's the API
        // three.js expects (e.g. required for WebXR sessions).
        this.renderer.setAnimationLoop(() => this.animate());
    }

    async initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioSource = this.audioContext.createMediaStreamSource(stream);
            this.audioSource.connect(this.analyser);
            this.params.audio.enabled = true;
        } catch (err) {
            console.error("Mic access failed, using fallback oscillator synth", err);
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            // Fallback for testing: simulate beat
            this.audioSource = this.audioContext.createOscillator();
            this.audioSource.type = "sine";
            this.audioSource.frequency.value = 60; // bass drum freq
            const gain = this.audioContext.createGain();
            this.audioSource.connect(gain);
            gain.connect(this.analyser);
            gain.gain.value = 0;
            this.audioSource.start();
            setInterval(() => {
                gain.gain.setValueAtTime(1.0, this.audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
            }, 500);
            this.params.audio.enabled = true;
        }
    }

    setupLighting() {
        this.scene.add(new THREE.AmbientLight(0xffffff, this.params.lighting.ambient));
        const p1 = new THREE.PointLight(0x00d2ff, this.params.lighting.pointLight, 1000); p1.position.set(200, 200, 200);
        const p2 = new THREE.PointLight(0xff8c00, this.params.lighting.pointLight * 0.7, 1000); p2.position.set(-200, -200, -200);
        this.scene.add(p1, p2);
        this.pointLights.push(p1, p2);
    }

    setupEnvironment() {
        if (this.envMeshes.edges) this.scene.remove(this.envMeshes.edges);
        if (this.envMeshes.grid) this.scene.remove(this.envMeshes.grid);
        if (this.envMeshes.snow) this.scene.remove(this.envMeshes.snow);
        
        const b = this.params.bounds;
        const isLight = this.params.features.lightMode;
        // Dark-mode grid/edges are light lines on a near-black scene; light
        // mode flips to darker slate lines on the pale background instead.
        const edgeColor = isLight ? 0x94a3b8 : 0x334155;
        const gridColorA = isLight ? 0xcbd5e1 : 0x1e293b;
        const gridColorB = isLight ? 0xe2e8f0 : 0x0f172a;
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b * 2, b * 2, b * 2)), new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: isLight ? 0.35 : 0.2 }));
        this.scene.add(edges);
        const grid = new THREE.GridHelper(b * 2, 12, gridColorA, gridColorB);
        grid.position.y = -b; this.scene.add(grid);

        // Marine Snow Particle System
        const snowCount = this.isMobile ? 700 : 2000;
        const snowGeo = new THREE.BufferGeometry();
        const snowPos = new Float32Array(snowCount * 3);
        for(let i=0; i<snowCount * 3; i++) {
            snowPos[i] = (Math.random() - 0.5) * (b * 2.5);
        }
        snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
        // Additive blending washes light-blue specks out to near-invisible
        // against a pale background, so light mode gets a darker slate tone
        // with normal blending instead (mirrors the trail/boid treatment above).
        const snowColor = isLight ? 0x64748b : 0x88ccff;
        const snowMat = new THREE.PointsMaterial({ color: snowColor, size: 0.5, transparent: true, opacity: isLight ? 0.5 : 0.4, blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending });
        const snow = new THREE.Points(snowGeo, snowMat);
        this.scene.add(snow);

        this.envMeshes = { edges, grid, snow };
    }

    initInstancedMeshes() {
        const MAX = 5000;
        const types = [BOID_TYPES.SMALL_FISH, BOID_TYPES.LARGE_FISH, BOID_TYPES.BIRD];
        types.forEach(t => {
            const mat = new THREE.MeshPhongMaterial({ color: t.color, emissive: t.color, emissiveIntensity: t.glow, shininess: 100 });
            const imesh = new THREE.InstancedMesh(t.geometry(), mat, MAX);
            imesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            imesh.count = 0;
            this.scene.add(imesh);
            this.instancedMeshes[t.name] = imesh;
        });
    }

    updateInstancedMeshes() {
        const time = this.clock.elapsedTime;
        const counts = {}; for (let k in this.instancedMeshes) counts[k] = 0;
        for (let i = 0; i < this.boids.length; i++) {
            const b = this.boids[i]; if (!b.active) continue;
            const imesh = this.instancedMeshes[b.type.name];
            const idx = counts[b.type.name];
            _dummy.position.copy(b.position);

            // Motion Style Animation
            let s = 1.0, r = 0;
            if (b.type === BOID_TYPES.BIRD) {
                s = 1.0 + Math.sin(time * 12) * 0.3; // Flapping wing effect (scale X)
            } else if (b.type === BOID_TYPES.LARGE_FISH) {
                r = Math.sin(time * 4) * 0.2; // Slow powerful tail wag
            } else if (b.type === BOID_TYPES.SMALL_FISH) {
                r = Math.sin(time * 15) * 0.15; // High freq small tail wag
            }

            if (b.velocity.lengthSq() > 0.001) { 
                _dummy.lookAt(_v4.copy(b.position).add(b.velocity)); 
                _dummy.rotateX(Math.PI / 2); 
                _dummy.rotateZ(r); // Apply tail wag
                b.quaternion.slerp(_dummy.quaternion, 0.12);
            }
            _dummy.quaternion.copy(b.quaternion);
            _dummy.scale.set(b.type === BOID_TYPES.BIRD ? s : 1, 1, b.type === BOID_TYPES.BIRD ? 1 : 1);
            _dummy.updateMatrix(); imesh.setMatrixAt(idx, _dummy.matrix);
            counts[b.type.name]++;
        }
        for (let k in this.instancedMeshes) { this.instancedMeshes[k].count = counts[k]; this.instancedMeshes[k].instanceMatrix.needsUpdate = true; }
    }

    initTrailSystems() {
        // Capacity per boid type; boids beyond this simply render without a
        // trail rather than growing buffers at runtime.
        const CAPACITY = 1000;
        [BOID_TYPES.SMALL_FISH, BOID_TYPES.LARGE_FISH, BOID_TYPES.BIRD].forEach(t => {
            this.trailSystems[t.name] = new TrailSystem(this.scene, t.color, CAPACITY, 20);
        });
    }

    createBoids(count) {
        const r = [this.params.boidTypes.smallFishRatio, this.params.boidTypes.largeFishRatio];
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            const type = rand < r[0] ? BOID_TYPES.SMALL_FISH : (rand < r[0] + r[1] ? BOID_TYPES.LARGE_FISH : BOID_TYPES.BIRD);
            const trailSystem = this.trailSystems[type.name];
            this.boids.push(new Boid(type, new THREE.Vector3((Math.random() - 0.5) * 280, (Math.random() - 0.5) * 280, (Math.random() - 0.5) * 280), this.params, trailSystem));
        }
    }

    createPredators(count) {
        this.predators.forEach(p => this.scene.remove(p.mesh)); this.predators = [];
        for (let i = 0; i < count; i++) {
            const p = new Predator(new THREE.Vector3((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400), this.params);
            if (this.params.features.lightMode) {
                p.mesh.material.emissive.setHex(0x000000);
                p.mesh.material.color.copy(new THREE.Color(0xff3333).lerp(new THREE.Color(0x000000), 0.3));
            }
            this.scene.add(p.mesh); this.predators.push(p);
        }
    }

    createFoodSources(count) {
        const geo = new THREE.SphereGeometry(1.5, 8, 8);
        const isLight = this.params.features.lightMode;
        const color = isLight ? new THREE.Color(0x32cd32).lerp(new THREE.Color(0x000000), 0.3).getHex() : 0x32cd32;
        const emissive = isLight ? 0x000000 : 0x32cd32;
        const mat = new THREE.MeshPhongMaterial({ color: color, emissive: emissive, emissiveIntensity: 0.8 });
        for (let i = 0; i < count; i++) {
            const m = new THREE.Mesh(geo, mat); m.position.set((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300);
            this.scene.add(m); this.foodSources.push({ mesh: m, position: m.position });
        }
    }

    createObstacles(count) {
        const geo = new THREE.IcosahedronGeometry(12, 1);
        const mat = new THREE.MeshPhongMaterial({ color: 0x1e293b, transparent: true, opacity: 0.4 });
        for (let i = 0; i < count; i++) {
            const m = new THREE.Mesh(geo, mat); m.position.set((Math.random() - 0.5) * 250, (Math.random() - 0.5) * 250, (Math.random() - 0.5) * 250);
            m.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x63b3ed, transparent: true, opacity: 0.15 })));
            this.scene.add(m); this.obstacles.push(m);
        }
    }

    applyTheme() {
        const isLight = this.params.features.lightMode;
        document.body.classList.toggle('light-mode', isLight);
        // Light mode gets a muted warm-gray gradient rather than a bright
        // sky-blue/white one, which still read as a stark, unfriendly wall
        // of white. Dark mode keeps its near-black gradient.
        if (this.skyDome) { this.scene.remove(this.skyDome); this.skyDome.geometry.dispose(); this.skyDome.material.dispose(); }
        this.skyDome = isLight
            ? this.createSkyDome('#c9c3b6', '#e4dfd3')
            : this.createSkyDome('#0a0f1c', '#020205');
        this.scene.add(this.skyDome);
        const bgColor = isLight ? 0xe4dfd3 : 0x020205;
        if (this.scene.fog) this.scene.fog.color.set(bgColor);

        if (this.bloomPass) {
            this.bloomPass.strength = this.params.lighting.bloom * (isLight ? 0.6 : 1);
            this.bloomPass.threshold = isLight ? 1.0 : 0.85;
        }
        
        // Adjust Boid Colors & Emissive for Contrast
        Object.values(BOID_TYPES).forEach(t => {
            if (this.instancedMeshes[t.name]) {
                const mat = this.instancedMeshes[t.name].material;
                if (isLight) {
                    mat.emissive.setHex(0x000000);
                    const c = new THREE.Color(t.color).lerp(new THREE.Color(0x000000), 0.4);
                    mat.color.copy(c);
                } else {
                    mat.emissive.setHex(t.color);
                    mat.color.setHex(t.color);
                }
                mat.needsUpdate = true;
            }
            if (this.trailSystems && this.trailSystems[t.name]) {
                const mat = this.trailSystems[t.name].material;
                if (isLight) {
                    mat.blending = THREE.NormalBlending;
                    const c = new THREE.Color(t.color).lerp(new THREE.Color(0x000000), 0.5);
                    mat.uniforms.color.value.copy(c);
                } else {
                    mat.blending = THREE.AdditiveBlending;
                    mat.uniforms.color.value.setHex(t.color);
                }
                mat.needsUpdate = true;
            }
        });

        // Adjust Predators & Food
        this.predators.forEach(p => {
            if (isLight) {
                p.mesh.material.emissive.setHex(0x000000);
                p.mesh.material.color.copy(new THREE.Color(0xff3333).lerp(new THREE.Color(0x000000), 0.3));
            } else {
                p.mesh.material.emissive.setHex(0xff0000);
                p.mesh.material.color.setHex(0xff3333);
            }
            p.mesh.material.needsUpdate = true;
        });
        
        this.foodSources.forEach(f => {
            if (isLight) {
                f.mesh.material.emissive.setHex(0x000000);
                f.mesh.material.color.copy(new THREE.Color(0x32cd32).lerp(new THREE.Color(0x000000), 0.3));
            } else {
                f.mesh.material.emissive.setHex(0x32cd32);
                f.mesh.material.color.setHex(0x32cd32);
            }
            f.mesh.material.needsUpdate = true;
        });

        this.setupEnvironment();
    }

    applyMobileDefaults() {
        if (!this.isMobile) return;
        const fpsSlider = document.getElementById('fps-limit');
        if (fpsSlider) fpsSlider.value = this.params.performance.fpsLimit;
        const fpsLabel = document.getElementById('fps-limit-value');
        if (fpsLabel) fpsLabel.textContent = this.params.performance.fpsLimit;
        const trailsToggle = document.getElementById('toggle-trails');
        if (trailsToggle) trailsToggle.checked = this.params.features.trails;
    }

    setupUI() {
        const bind = (id, param, obj) => {
            const el = document.getElementById(id); if (!el) return;
            // Sync initial state from DOM
            const initialVal = parseFloat(el.value);
            obj[param] = (id.includes('fish') || id === 'birds') ? initialVal / 100 : initialVal;
            const initVEl = document.getElementById(id + '-value'); if (initVEl) initVEl.textContent = initialVal;

            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                obj[param] = (id.includes('fish') || id === 'birds') ? val / 100 : val;
                const vEl = document.getElementById(id + '-value'); if (vEl) vEl.textContent = val;
                if (id === 'bloom' && this.bloomPass) {
                    const isLight = this.params.features.lightMode;
                    this.bloomPass.strength = val * (isLight ? 0.6 : 1);
                }
                if (id === 'ambient') this.scene.children.filter(c => c.type === 'AmbientLight').forEach(l => l.intensity = val);
                if (id === 'point-light' && this.pointLights.length) {
                    this.pointLights[0].intensity = val;
                    this.pointLights[1].intensity = val * 0.7;
                }
                if (id === 'bounds') {
                    this.params.bounds = val;
                    this.setupEnvironment();
                }
            });
        };
        ['separation', 'alignment', 'cohesion'].forEach(k => bind(k, k, this.params.forces));
        bind('small-fish', 'smallFishRatio', this.params.boidTypes);
        bind('large-fish', 'largeFishRatio', this.params.boidTypes);
        bind('bloom', 'bloom', this.params.lighting);
        bind('ambient', 'ambient', this.params.lighting);
        bind('point-light', 'pointLight', this.params.lighting);
        bind('bounds', 'bounds', this.params);
        bind('sim-speed', 'simSpeed', this.params.performance);
        bind('fps-limit', 'fpsLimit', this.params.performance);
        bind('audio-sensitivity', 'sensitivity', this.params.audio);
        const bindToggle = (id, param) => {
            const el = document.getElementById(id); if (!el) return;
            this.params.features[param] = el.checked;
            if (id === 'toggle-theme' && el.checked) this.applyTheme();
            el.addEventListener('change', (e) => {
                this.params.features[param] = e.target.checked;
                if (id === 'toggle-theme') this.applyTheme();
            });
        };
        bindToggle('toggle-theme', 'lightMode');
        bindToggle('toggle-mouse', 'followMouse');
        bindToggle('toggle-layering', 'layering');
        bindToggle('toggle-wrapping', 'wrapSpace');
        bindToggle('toggle-trails', 'trails');
        bindToggle('toggle-food', 'food');
        bindToggle('toggle-predators', 'predators');

        const enableAudioBtn = document.getElementById('enable-audio');
        if (enableAudioBtn) {
            enableAudioBtn.onclick = (e) => {
                if (!this.audioContext) {
                    this.initAudio();
                    e.target.textContent = "Listening to Audio...";
                    e.target.classList.add('active');
                    e.target.style.background = 'rgba(46, 213, 115, 0.4)';
                    e.target.style.borderColor = '#2ed573';
                }
            };
        }
        document.getElementById('pauseResume').onclick = (e) => { this.isPaused = !this.isPaused; e.target.textContent = this.isPaused ? "Resume" : "Pause"; };
        document.getElementById('reset').onclick = () => location.reload();
        document.getElementById('addBoids').onclick = () => this.createBoids(50);
        document.getElementById('removeBoids').onclick = () => {
            let count = 0;
            for (let i = this.boids.length - 1; i >= 0 && count < 50; i--) { if (this.boids[i].active) { this.boids[i].active = false; this.boids[i].destroy(); count++; } }
        };
        document.getElementById('fps-view').onclick = (e) => {
            if (this.followedBoid) { this.followedBoid = null; e.target.classList.remove('active'); e.target.textContent = "Follow Boid"; this.controls.enabled = true; }
            else {
                const act = this.boids.filter(b => b.active);
                if (act.length) { this.followedBoid = act[Math.floor(Math.random() * act.length)]; e.target.classList.add('active'); e.target.textContent = "Stop Following"; this.controls.enabled = false; }
            }
        };
        window.toggleSection = (h) => { const c = h.nextElementSibling; const a = h.querySelector('.arrow'); c.classList.toggle('collapsed'); h.classList.toggle('collapsed'); a.textContent = c.classList.contains('collapsed') ? 'expand_more' : 'expand_less'; };

        // Mobile drawer toggles: panels slide in on demand instead of always
        // occupying screen space, since two 280px-wide panels don't fit a phone.
        const leftPanel = document.getElementById('left-panel');
        const rightPanel = document.getElementById('right-panel');
        const backdrop = document.getElementById('mobile-backdrop');
        const toggleLeftBtn = document.getElementById('toggle-left-panel');
        const toggleRightBtn = document.getElementById('toggle-right-panel');
        const closeMobilePanels = () => {
            leftPanel.classList.remove('open');
            rightPanel.classList.remove('open');
            backdrop.classList.remove('visible');
            setTimeout(() => { if (!backdrop.classList.contains('visible')) backdrop.style.display = 'none'; }, 300);
        };
        const openMobilePanel = (panel) => {
            leftPanel.classList.remove('open');
            rightPanel.classList.remove('open');
            panel.classList.add('open');
            backdrop.style.display = 'block';
            requestAnimationFrame(() => backdrop.classList.add('visible'));
        };
        if (toggleLeftBtn) toggleLeftBtn.onclick = () => {
            leftPanel.classList.contains('open') ? closeMobilePanels() : openMobilePanel(leftPanel);
        };
        if (toggleRightBtn) toggleRightBtn.onclick = () => {
            rightPanel.classList.contains('open') ? closeMobilePanels() : openMobilePanel(rightPanel);
        };
        if (backdrop) backdrop.onclick = closeMobilePanels;

        // Play shortcut: opens the controls panel and jumps straight to the
        // Flocking Rules section (expanding it if it's collapsed).
        const flockingBtn = document.getElementById('shortcut-flocking');
        const flockingSection = document.getElementById('flocking-rules-section');
        // Matches the CSS drawer breakpoint — only slide the drawer in /
        // dim the backdrop when that layout is actually active, otherwise
        // the desktop view (where panels are always visible) would get an
        // unwanted full-screen backdrop.
        const isMobileLayout = () => window.matchMedia('(max-width: 768px), (pointer: coarse) and (max-width: 1024px)').matches;
        if (flockingBtn && flockingSection) {
            flockingBtn.onclick = () => {
                if (isMobileLayout()) openMobilePanel(leftPanel);
                const header = flockingSection.querySelector('.control-header');
                const content = flockingSection.querySelector('.control-content');
                const arrow = header.querySelector('.arrow');
                header.classList.remove('collapsed');
                content.classList.remove('collapsed');
                if (arrow) arrow.textContent = '▲';
                header.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
        }

        this.applyMobileDefaults();

        // The "Boids Simulation" title fades out once, 5s after load, leaving
        // a clean view of the simulation. Panels are unaffected by this.
        setTimeout(() => {
            const title = document.getElementById('title');
            if (title) title.classList.add('faded');
        }, 5000);

        // Pointer Events unify mouse, touch and pen — this drives both the "Mouse
        // Interaction" boid steering and the click/tap shockwave on mobile.
        window.addEventListener('pointermove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        }, { passive: true });

        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'h') {
                const panels = document.querySelectorAll('.panel-container');
                const title = document.getElementById('title');
                const isHidden = panels[0].style.display === 'none';
                panels.forEach(p => p.style.display = isHidden ? 'flex' : 'none');
                if (title) {
                    title.style.display = isHidden ? 'block' : 'none';
                    if (isHidden) title.classList.remove('faded'); // manual show overrides the 5s auto-fade
                }
            }
        });

        // Interactive Shockwave
        this.renderer.domElement.addEventListener('pointerdown', () => {
            if (!this.mouse3D || this.isPaused) return;
            const shockRadiusSq = 10000;
            const shockForce = 35.0;
            for (let i = 0; i < this.boids.length; i++) {
                const b = this.boids[i];
                if (!b.active) continue;
                const dSq = b.position.distanceToSquared(this.mouse3D);
                if (dSq < shockRadiusSq && dSq > 0) {
                    const away = _v4.subVectors(b.position, this.mouse3D).normalize();
                    const intensity = (1.0 - (dSq / shockRadiusSq)) * shockForce;
                    b.velocity.add(away.multiplyScalar(intensity));
                }
            }
            // Briefly boost bloom for visual feedback
            if (this.bloomPass) {
                const orig = this.bloomPass.strength;
                this.bloomPass.strength = orig * 2.5;
                setTimeout(() => { if (this.bloomPass) this.bloomPass.strength = orig; }, 150);
            }
        });
    }

    animate() {

        const now = performance.now();
        const frameDuration = 1000 / this.params.performance.fpsLimit;
        const delta = now - this.lastFrameTime;

        if (delta < frameDuration) return; // Cap FPS

        this.lastFrameTime = now - (delta % frameDuration);
        const dt = Math.min(this.clock.getDelta(), 0.05) * this.params.performance.simSpeed;

        // Update Mouse 3D Position
        this.raycaster.setFromCamera(this.mouse, this.camera);
        this.raycaster.ray.intersectPlane(this.mousePlane, this.mouse3D);

        let audioReact = 0;
        if (this.params.audio.enabled && this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let avg = 0;
            for (let i = 0; i < this.dataArray.length; i++) avg += this.dataArray[i];
            avg /= this.dataArray.length;
            audioReact = (avg / 255.0) * this.params.audio.sensitivity;
            if (this.bloomPass) {
                const isLight = this.params.features.lightMode;
                const targetBloom = (this.params.lighting.bloom + audioReact * 3.0) * (isLight ? 0.6 : 1);
                this.bloomPass.strength = THREE.MathUtils.lerp(this.bloomPass.strength, targetBloom, 0.1);
            }
        }

        // Reused object: refresh top-level fields from params (shallow, same
        // as the old spread) and overwrite speed in place — no per-frame
        // object allocation in the hot path. The speed sub-object is kept
        // as our own buffer (not this.params.speed) so mutating it here
        // never corrupts the UI-bound base params.
        const speedBuf = this.frameParams.speed;
        Object.assign(this.frameParams, this.params);
        this.frameParams.speed = speedBuf;
        speedBuf.min = (this.params.speed.min + audioReact * 2.0) * this.params.performance.simSpeed;
        speedBuf.max = (this.params.speed.max + audioReact * 6.0) * this.params.performance.simSpeed;
        const currentParams = this.frameParams;

        // Animate Marine Snow
        if (this.envMeshes.snow) {
            this.envMeshes.snow.rotation.y += dt * 0.05;
            this.envMeshes.snow.rotation.x += dt * 0.02;
        }

        for (const k in this.trailSystems) this.trailSystems[k].mesh.visible = currentParams.features.trails;

        if (!this.isPaused) {
            this.grid.clear(); for (let i = 0; i < this.boids.length; i++) if (this.boids[i].active) this.grid.add(this.boids[i]);
            for (let i = 0; i < this.boids.length; i++) {
                const b = this.boids[i]; if (!b.active) continue;
                const res = b.applyRules(this.grid.getNearby(b.position, this.neighborRadius), this.predators, this.foodSources, this.obstacles, currentParams, this.mouse3D);
                if (res && res.consume) { const idx = this.foodSources.indexOf(res.consume); if (idx !== -1) { this.scene.remove(res.consume.mesh); this.foodSources.splice(idx, 1); } }
                b.update(currentParams, dt);
            }
            if (currentParams.features.trails) for (const k in this.trailSystems) this.trailSystems[k].commit();
            this.updateInstancedMeshes();
            this.predators.forEach(p => {
                p.mesh.visible = currentParams.features.predators;
                if (currentParams.features.predators) {
                    const caught = p.update(this.grid, currentParams, dt);
                    if (caught) { caught.active = false; caught.destroy(); }
                }
            });
            this.foodSources.forEach(f => {
                f.mesh.visible = currentParams.features.food;
            });
            if (currentParams.features.food && Math.random() < currentParams.food.spawnRate && this.foodSources.length < 30) this.createFoodSources(1);
        }
        if (this.followedBoid && this.followedBoid.active) {
            const off = _v5.copy(this.followedBoid.velocity).normalize().multiplyScalar(-30).add(_v2.set(0, 12, 0));
            this.camera.position.lerp(_v3.copy(this.followedBoid.position).add(off), 0.1);
            this.camera.lookAt(this.followedBoid.position);
        } else if (this.followedBoid) { this.followedBoid = null; this.controls.enabled = true; document.getElementById('fps-view').classList.remove('active'); document.getElementById('fps-view').textContent = "Follow Boid"; }
        if (this.fpsEl) this.fpsEl.textContent = Math.round(1 / (dt / this.params.performance.simSpeed || 0.01));
        if (this.boidCountEl) {
            let activeCount = 0;
            for (let i = 0; i < this.boids.length; i++) if (this.boids[i].active) activeCount++;
            this.boidCountEl.textContent = activeCount;
        }
        this.controls.update();
        if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => {
    // Delay initialization slightly to ensure all stylesheets are applied and 
    // the initial layout/paint is fully complete, preventing the browser from
    // warning about forced synchronous layout.
    setTimeout(() => {
        window.__sim = new Simulation();
    }, 50);
});
