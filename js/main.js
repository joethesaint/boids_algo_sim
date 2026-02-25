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

// --- Optimized Trail with Ring Buffer ---
class Trail {
    constructor(scene, color, length = 20) {
        this.scene = scene;
        this.maxLength = length;
        this.points = new Array(length).fill(null).map(() => new THREE.Vector3());
        this.head = 0; // Ring buffer pointer
        this.visible = true;

        const geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.maxLength * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

        const alphas = new Float32Array(this.maxLength);
        for (let i = 0; i < this.maxLength; i++) alphas[i] = 1.0 - (i / this.maxLength);
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

        this.line = new THREE.Line(geometry, this.material);
        this.line.frustumCulled = false;
        this.scene.add(this.line);
    }

    update(position) {
        if (!this.visible) { this.line.visible = false; return; }
        this.line.visible = true;

        // Advance ring buffer
        this.points[this.head].copy(position);
        this.head = (this.head + 1) % this.maxLength;

        const posAttr = this.line.geometry.attributes.position;
        for (let i = 0; i < this.maxLength; i++) {
            // Read back from head to show oldest to newest
            const idx = (this.head - 1 - i + this.maxLength) % this.maxLength;
            const p = this.points[idx];
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
    constructor(type, position, params, scene) {
        initScratch();
        this.type = type;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(params.speed.min);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.quaternion = new THREE.Quaternion();
        this.maxSpeed = type.maxSpeed;
        this.maxForce = type.maxForce;
        this.active = true;
        this.trail = scene ? new Trail(scene, type.color, 20) : null;
    }

    applyRules(neighbors, predators, foodSources, obstacles, params, mouse3D) {
        if (!this.active) return null;
        this.acceleration.set(0, 0, 0);
        const sep = _v1.set(0, 0, 0), ali = _v2.set(0, 0, 0), coh = _v3.set(0, 0, 0);
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

        // Mouse Influence
        if (mouse3D && params.features.followMouse) {
            const dSq = this.position.distanceToSquared(mouse3D);
            if (dSq < 20000) {
                const steer = _v4.subVectors(this.position, mouse3D).normalize().multiplyScalar(this.maxSpeed * 2.5);
                this.acceleration.add(steer.sub(this.velocity).clampLength(0, this.maxForce * 3).multiplyScalar(-1.5));
            }
        }

        // Species Interaction: Small fish avoid large fish
        if (this.type === BOID_TYPES.SMALL_FISH) {
            for (let i = 0; i < neighbors.length; i++) {
                if (neighbors[i].type === BOID_TYPES.LARGE_FISH) {
                    const dSq = this.position.distanceToSquared(neighbors[i].position);
                    if (dSq < 1600) {
                        const flee = _v4.subVectors(this.position, neighbors[i].position).normalize().multiplyScalar(this.maxSpeed * 1.5);
                        this.acceleration.add(flee.sub(this.velocity).clampLength(0, this.maxForce * 2).multiplyScalar(1.2));
                    }
                }
            }
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

        if (this.trail) {
            this.trail.visible = params.features.trails;
            this.trail.update(this.position);
        }
    }

    destroy() { if (this.trail) this.trail.destroy(); }
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
    update(boids, params, dt) {
        const step = dt * 60;
        if (this.huntCooldown > 0) this.huntCooldown -= step;
        let target = null, maxPriorityDistSq = -1;
        const huntRadiusSq = params.predators.huntRadius * params.predators.huntRadius;

        for (let i = 0; i < boids.length; i++) {
            const b = boids[i];
            if (!b.active) continue;
            const dSq = this.position.distanceToSquared(b.position);
            if (dSq < huntRadiusSq) {
                // Priority: Large Fish > Bird > Small Fish
                const priority = (b.type === BOID_TYPES.LARGE_FISH ? 3.0 : (b.type === BOID_TYPES.BIRD ? 2.0 : 1.0));
                const score = priority / (Math.sqrt(dSq) + 1);
                if (score > maxPriorityDistSq) { target = b; maxPriorityDistSq = score; }
            }
        }
        const acc = _v4.set(0, 0, 0);
        let caught = null;
        if (target && this.huntCooldown <= 0) {
            acc.subVectors(target.position, this.position).normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, 0.6);
            if (minDistSq < 49) { this.huntCooldown = 180; caught = target; }
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
            lighting: { ambient: 0.6, bloom: 1.8, pointLight: 5.0, vignette: 1.0 },
            performance: { simSpeed: 1.0, fpsLimit: 60 },
            audio: { enabled: false, sensitivity: 1.0 },
            features: { trails: true, food: true, predators: true, followMouse: true, layering: true, wrapSpace: false }
        };
        this.boids = []; this.predators = []; this.foodSources = []; this.obstacles = []; this.instancedMeshes = {};
        this.pointLights = [];
        this.envMeshes = { edges: null, grid: null };
        this.grid = new SpatialHashGrid(30); this.clock = new THREE.Clock(); this.isPaused = false; this.followedBoid = null;
        this.lastFrameTime = 0;
        this.mouse3D = new THREE.Vector3(); this.raycaster = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
        this.audioContext = null; this.analyser = null; this.dataArray = null; this.audioSource = null;
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x020205);
        this.scene.fog = new THREE.Fog(0x020205, 200, 1500);
        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.camera.position.set(0, 150, 400);
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

            // Cinematic Vignette Pass
            this.vignettePass = new THREE.ShaderPass({
                uniforms: { tDiffuse: { value: null }, offset: { value: 1.0 }, darkness: { value: this.params.lighting.vignette } },
                vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                fragmentShader: `uniform sampler2D tDiffuse; uniform float offset; uniform float darkness; varying vec2 vUv; void main() { vec4 texel = texture2D(tDiffuse, vUv); vec2 uv = (vUv - 0.5) * 2.0; float vig = smoothstep(offset, offset - darkness, length(uv)); gl_FragColor = vec4(texel.rgb * vig, texel.a); }`
            });
            this.composer.addPass(this.vignettePass);
        } catch (e) { console.error("Composer Error", e); }

        this.setupLighting();
        this.setupEnvironment();
        this.initInstancedMeshes();
        this.createBoids(this.params.count);
        this.createPredators(this.params.predators.count);
        this.createFoodSources(this.params.food.count);
        this.createObstacles(6);
        this.setupUI();
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
        });
        this.animate();
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
        
        const b = this.params.bounds;
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b * 2, b * 2, b * 2)), new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.2 }));
        this.scene.add(edges);
        const grid = new THREE.GridHelper(b * 2, 12, 0x1e293b, 0x0f172a);
        grid.position.y = -b; this.scene.add(grid);
        this.envMeshes = { edges, grid };
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

    createBoids(count) {
        const r = [this.params.boidTypes.smallFishRatio, this.params.boidTypes.largeFishRatio];
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            const type = rand < r[0] ? BOID_TYPES.SMALL_FISH : (rand < r[0] + r[1] ? BOID_TYPES.LARGE_FISH : BOID_TYPES.BIRD);
            this.boids.push(new Boid(type, new THREE.Vector3((Math.random() - 0.5) * 280, (Math.random() - 0.5) * 280, (Math.random() - 0.5) * 280), this.params, this.scene));
        }
    }

    createPredators(count) {
        this.predators.forEach(p => this.scene.remove(p.mesh)); this.predators = [];
        for (let i = 0; i < count; i++) {
            const p = new Predator(new THREE.Vector3((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400), this.params);
            this.scene.add(p.mesh); this.predators.push(p);
        }
    }

    createFoodSources(count) {
        const geo = new THREE.SphereGeometry(1.5, 8, 8);
        const mat = new THREE.MeshPhongMaterial({ color: 0x32cd32, emissive: 0x32cd32, emissiveIntensity: 0.8 });
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

    setupUI() {
        const bind = (id, param, obj) => {
            const el = document.getElementById(id); if (!el) return;
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                obj[param] = (id.includes('fish') || id === 'birds') ? val / 100 : val;
                const vEl = document.getElementById(id + '-value'); if (vEl) vEl.textContent = val;
                if (id === 'bloom' && this.bloomPass) this.bloomPass.strength = val;
                if (id === 'ambient') this.scene.children.filter(c => c.type === 'AmbientLight').forEach(l => l.intensity = val);
                if (id === 'point-light' && this.pointLights.length) {
                    this.pointLights[0].intensity = val;
                    this.pointLights[1].intensity = val * 0.7;
                }
                if (id === 'vignette' && this.vignettePass) {
                    this.vignettePass.uniforms.darkness.value = val;
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
        bind('vignette', 'vignette', this.params.lighting);
        bind('bounds', 'bounds', this.params);
        bind('sim-speed', 'simSpeed', this.params.performance);
        bind('fps-limit', 'fpsLimit', this.params.performance);
        bind('audio-sensitivity', 'sensitivity', this.params.audio);
        const bindToggle = (id, param) => {
            const el = document.getElementById(id); if (!el) return;
            el.addEventListener('change', (e) => { this.params.features[param] = e.target.checked; });
        };
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
        window.toggleSection = (h) => { const c = h.nextElementSibling; const a = h.querySelector('.arrow'); c.classList.toggle('collapsed'); a.textContent = c.classList.contains('collapsed') ? '▼' : '▲'; };

        window.addEventListener('mousemove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'h') {
                const panels = document.querySelectorAll('.panel-container');
                const title = document.getElementById('title');
                const isHidden = panels[0].style.display === 'none';
                panels.forEach(p => p.style.display = isHidden ? 'flex' : 'none');
                if (title) title.style.display = isHidden ? 'block' : 'none';
            }
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const now = performance.now();
        const frameDuration = 1000 / this.params.performance.fpsLimit;
        const delta = now - this.lastFrameTime;

        if (delta < frameDuration) return; // Cap FPS

        this.lastFrameTime = now - (delta % frameDuration);
        const dt = Math.min(this.clock.getDelta(), 0.05) * this.params.performance.simSpeed;

        // Update Mouse 3D Position
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        this.raycaster.ray.intersectPlane(plane, this.mouse3D);

        let audioReact = 0;
        if (this.params.audio.enabled && this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) sum += this.dataArray[i];
            const avg = sum / this.dataArray.length;
            audioReact = (avg / 255.0) * this.params.audio.sensitivity;
            if (this.bloomPass) {
                this.bloomPass.strength = THREE.MathUtils.lerp(this.bloomPass.strength, this.params.lighting.bloom + audioReact * 3.0, 0.1);
            }
        }

        const currentParams = {
            ...this.params,
            speed: {
                min: (this.params.speed.min + audioReact * 2.0) * this.params.performance.simSpeed,
                max: (this.params.speed.max + audioReact * 6.0) * this.params.performance.simSpeed
            }
        };

        if (!this.isPaused) {
            this.grid.clear(); for (let i = 0; i < this.boids.length; i++) if (this.boids[i].active) this.grid.add(this.boids[i]);
            for (let i = 0; i < this.boids.length; i++) {
                const b = this.boids[i]; if (!b.active) continue;
                const res = b.applyRules(this.grid.getNearby(b.position, 45), this.predators, this.foodSources, this.obstacles, currentParams, this.mouse3D);
                if (res && res.consume) { const idx = this.foodSources.indexOf(res.consume); if (idx !== -1) { this.scene.remove(res.consume.mesh); this.foodSources.splice(idx, 1); } }
                b.update(currentParams, dt);
            }
            this.updateInstancedMeshes();
            this.predators.forEach(p => {
                p.mesh.visible = currentParams.features.predators;
                if (currentParams.features.predators) {
                    const caught = p.update(this.boids, currentParams, dt);
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
        document.getElementById('fps').textContent = Math.round(1 / (dt / this.params.performance.simSpeed || 0.01));
        document.getElementById('boidCount').textContent = this.boids.filter(b => b.active).length;
        this.controls.update();
        if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => new Simulation());
