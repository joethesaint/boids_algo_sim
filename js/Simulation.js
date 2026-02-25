import { Boid, Predator, BOID_TYPES } from './Boid.js';
import { setupUI, updateStats } from './UI.js';

export class Simulation {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.boids = [];
        this.predators = [];
        this.foodSources = [];
        this.obstacles = [];
        this.lights = {};
        this.isPaused = false;
        this.isFollowingBoid = false;
        this.followedBoid = null;
        this.lastTime = 0;
        
        this.stats = { smallFish: 0, largeFish: 0, birds: 0 };
        
        this.params = {
            count: 150,
            bounds: 100,
            boidTypes: { smallFishRatio: 0.5, largeFishRatio: 0.3, birdRatio: 0.2 },
            predators: { count: 3, huntRadius: 40, speed: 3.5 },
            food: { count: 15, spawnRate: 0.02, attractionRadius: 30 },
            speed: { min: 0.5, max: 3.0 },
            forces: { separation: 1.5, alignment: 1.0, cohesion: 1.0, avoidance: 1.5, fear: 2.0, foodAttraction: 1.2 },
            perception: { separation: 10, alignment: 20, cohesion: 20, avoidance: 15 },
            lighting: { ambient: 0.4, directional: 0.8, edge: 0.6 }
        };

        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x05050a);
        this.scene.fog = new THREE.Fog(0x05050a, 80, 300);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, this.params.bounds / 2, this.params.bounds * 1.5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        this.setupLighting();
        this.setupEnvironment();
        this.createBoids(this.params.count);
        this.createPredators(this.params.predators.count);
        this.createFoodSources(this.params.food.count);
        this.createObstacles(5);

        setupUI(this.params, {
            onPredatorCountChange: (count) => this.updatePredatorCount(count),
            onFoodCountChange: (count) => this.updateFoodCount(count),
            onLightingChange: () => this.updateLighting(),
            onTogglePause: () => {
                this.isPaused = !this.isPaused;
                this.controls.enabled = this.isPaused;
                return this.isPaused;
            },
            onReset: () => this.reset(),
            onToggleFollow: () => {
                this.isFollowingBoid = !this.isFollowingBoid;
                if (this.isFollowingBoid && this.boids.length > 0) {
                    this.followedBoid = this.boids[Math.floor(Math.random() * this.boids.length)];
                    this.controls.enabled = false;
                } else {
                    this.followedBoid = null;
                    this.controls.enabled = true;
                }
                return this.isFollowingBoid;
            },
            onAddBoids: (count) => this.createBoids(count),
            onRemoveBoids: (count) => this.removeBoids(count)
        });

        window.addEventListener('resize', () => this.onWindowResize());
        this.animate();
    }

    setupLighting() {
        this.lights.ambient = new THREE.AmbientLight(0x404040, this.params.lighting.ambient);
        this.scene.add(this.lights.ambient);
        
        this.lights.directional = new THREE.DirectionalLight(0xffffff, this.params.lighting.directional);
        this.lights.directional.position.set(1, 1, 1);
        this.lights.directional.castShadow = true;
        this.scene.add(this.lights.directional);
        
        const sides = [
            { name: 'right', pos: [this.params.bounds * 1.5, 0, 0], color: 0x4466aa },
            { name: 'left', pos: [-this.params.bounds * 1.5, 0, 0], color: 0xaa6644 },
            { name: 'top', pos: [0, this.params.bounds * 1.5, 0], color: 0x888888 },
            { name: 'bottom', pos: [0, -this.params.bounds * 1.5, 0], color: 0x556677 },
            { name: 'front', pos: [0, 0, this.params.bounds * 1.5], color: 0x88aacc },
            { name: 'back', pos: [0, 0, -this.params.bounds * 1.5], color: 0xccaa88 }
        ];

        sides.forEach(s => {
            this.lights[s.name] = new THREE.DirectionalLight(s.color, this.params.lighting.edge);
            this.lights[s.name].position.set(...s.pos);
            this.scene.add(this.lights[s.name]);
        });

        const corners = [
            [1, 1, 1, 0xff8844], [-1, 1, 1, 0x44ff88], [1, -1, 1, 0x8844ff], [1, 1, -1, 0xffff44]
        ];
        corners.forEach((c, i) => {
            const dist = this.params.bounds * 1.8;
            this.lights[`corner${i+1}`] = new THREE.PointLight(c[3], this.params.lighting.edge * 0.7, dist);
            this.lights[`corner${i+1}`].position.set(c[0]*dist, c[1]*dist, c[2]*dist);
            this.scene.add(this.lights[`corner${i+1}`]);
        });
    }

    updateLighting() {
        this.lights.ambient.intensity = this.params.lighting.ambient;
        this.lights.directional.intensity = this.params.lighting.directional;
        const edge = this.params.lighting.edge;
        ['right', 'left', 'top', 'bottom', 'front', 'back'].forEach(name => {
            this.lights[name].intensity = name === 'top' ? edge * 0.8 : name === 'bottom' ? edge * 0.6 : edge;
        });
        for (let i = 1; i <= 4; i++) this.lights[`corner${i}`].intensity = edge * 0.7;
    }

    setupEnvironment() {
        const boundsLine = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(this.params.bounds * 2, this.params.bounds * 2, this.params.bounds * 2)), 
            new THREE.LineBasicMaterial({ color: 0x4299e1, transparent: true, opacity: 0.4 })
        );
        this.scene.add(boundsLine);

        const grid1 = new THREE.GridHelper(this.params.bounds * 2, 20, 0x334155, 0x1e293b);
        grid1.position.y = -this.params.bounds;
        this.scene.add(grid1);

        const markerGeo = new THREE.SphereGeometry(1.5, 16, 16);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xe53e3e });
        for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) {
            const m = new THREE.Mesh(markerGeo, markerMat);
            m.position.set(x * this.params.bounds, y * this.params.bounds, z * this.params.bounds);
            this.scene.add(m);
        }
    }

    createBoids(count) {
        const ratios = [this.params.boidTypes.smallFishRatio, this.params.boidTypes.largeFishRatio, this.params.boidTypes.birdRatio];
        for (let i = 0; i < count; i++) {
            const rand = Math.random();
            let type = rand < ratios[0] ? BOID_TYPES.SMALL_FISH : rand < ratios[0] + ratios[1] ? BOID_TYPES.LARGE_FISH : BOID_TYPES.BIRD;
            if (type === BOID_TYPES.SMALL_FISH) this.stats.smallFish++;
            else if (type === BOID_TYPES.LARGE_FISH) this.stats.largeFish++;
            else this.stats.birds++;
            
            const boid = new Boid(type, new THREE.Vector3((Math.random()-0.5)*this.params.bounds*1.5, (Math.random()-0.5)*this.params.bounds*1.5, (Math.random()-0.5)*this.params.bounds*1.5), this.params);
            this.scene.add(boid.mesh);
            this.boids.push(boid);
        }
    }

    removeBoids(count) {
        for (let i = 0; i < Math.min(count, this.boids.length); i++) {
            const boid = this.boids.pop();
            this.scene.remove(boid.mesh);
            if (boid.type === BOID_TYPES.SMALL_FISH) this.stats.smallFish--;
            else if (boid.type === BOID_TYPES.LARGE_FISH) this.stats.largeFish--;
            else this.stats.birds--;
        }
    }

    createPredators(count) {
        for (let i = 0; i < count; i++) {
            const p = new Predator(new THREE.Vector3((Math.random()-0.5)*this.params.bounds*1.8, (Math.random()-0.5)*this.params.bounds*1.8, (Math.random()-0.5)*this.params.bounds*1.8), this.params);
            this.scene.add(p.mesh);
            this.predators.push(p);
        }
    }

    updatePredatorCount(count) {
        this.predators.forEach(p => this.scene.remove(p.mesh));
        this.predators = [];
        this.params.predators.count = count;
        this.createPredators(count);
    }

    createFoodSources(count) {
        const geo = new THREE.SphereGeometry(1, 8, 8);
        const mat = new THREE.MeshPhongMaterial({ color: 0x32cd32, transparent: true, opacity: 0.8 });
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set((Math.random()-0.5)*this.params.bounds*1.6, (Math.random()-0.5)*this.params.bounds*1.6, (Math.random()-0.5)*this.params.bounds*1.6);
            this.scene.add(mesh);
            this.foodSources.push({ mesh, position: mesh.position });
        }
    }

    updateFoodCount(count) {
        this.foodSources.forEach(f => this.scene.remove(f.mesh));
        this.foodSources = [];
        this.params.food.count = count;
        this.createFoodSources(count);
    }

    createObstacles(count) {
        const geo = new THREE.SphereGeometry(5, 16, 16);
        const mat = new THREE.MeshPhongMaterial({ color: 0x334155, transparent: true, opacity: 0.8 });
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set((Math.random()-0.5)*this.params.bounds*1.2, (Math.random()-0.5)*this.params.bounds*1.2, (Math.random()-0.5)*this.params.bounds*1.2);
            mesh.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x63b3ed, transparent: true, opacity: 0.5 })));
            this.scene.add(mesh);
            this.obstacles.push(mesh);
        }
    }

    reset() {
        this.boids.forEach(b => this.scene.remove(b.mesh));
        this.boids = [];
        this.stats = { smallFish: 0, largeFish: 0, birds: 0 };
        this.createBoids(this.params.count);
        this.isPaused = false;
        this.isFollowingBoid = false;
        this.followedBoid = null;
        this.camera.position.set(0, this.params.bounds / 2, this.params.bounds * 1.5);
        this.controls.reset();
        this.controls.enabled = true;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const now = performance.now();
        const fps = 1000 / (now - this.lastTime);
        this.lastTime = now;
        updateStats(this.boids.length, this.stats, fps);

        if (!this.isPaused) {
            this.boids.forEach(b => {
                const res = b.applyRules(this.boids, this.predators, this.foodSources, this.obstacles, this.params);
                if (res && res.consume) {
                    const idx = this.foodSources.indexOf(res.consume);
                    if (idx !== -1) {
                        this.scene.remove(res.consume.mesh);
                        this.foodSources.splice(idx, 1);
                    }
                }
                b.update(this.params);
            });
            this.predators.forEach(p => {
                const caught = p.update(this.boids, this.params);
                if (caught) {
                    const idx = this.boids.indexOf(caught);
                    if (idx !== -1) {
                        this.scene.remove(caught.mesh);
                        this.boids.splice(idx, 1);
                        if (caught.type === BOID_TYPES.SMALL_FISH) this.stats.smallFish--;
                        else if (caught.type === BOID_TYPES.LARGE_FISH) this.stats.largeFish--;
                        else this.stats.birds--;
                    }
                }
            });
            if (Math.random() < this.params.food.spawnRate && this.foodSources.length < this.params.food.count * 2) {
                this.createFoodSources(1);
            }
        }

        if (this.isFollowingBoid && this.followedBoid) {
            const offset = this.followedBoid.velocity.clone().normalize().multiplyScalar(-10).add(new THREE.Vector3(0, 3, 0));
            this.camera.position.copy(this.followedBoid.position).add(offset);
            this.camera.lookAt(this.followedBoid.position);
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
