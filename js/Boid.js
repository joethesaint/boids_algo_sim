// Scratch vectors for performance (reuse to avoid GC)
const _vec1 = new THREE.Vector3();
const _vec2 = new THREE.Vector3();
const _vec3 = new THREE.Vector3();
const _vec4 = new THREE.Vector3();
const _vec5 = new THREE.Vector3();
const _vec6 = new THREE.Vector3();

export const BOID_TYPES = {
    SMALL_FISH: {
        name: 'Small Fish',
        geometry: () => new THREE.ConeGeometry(0.8, 2.5, 6),
        color: 0x00aaff,
        maxSpeed: 4.0,
        maxForce: 0.3,
        perceptionRadius: { separation: 8, alignment: 15, cohesion: 15 },
        fearRadius: 25,
        size: 'small'
    },
    LARGE_FISH: {
        name: 'Large Fish',
        geometry: () => new THREE.ConeGeometry(1.8, 5, 8),
        color: 0xff6600,
        maxSpeed: 2.5,
        maxForce: 0.2,
        perceptionRadius: { separation: 12, alignment: 25, cohesion: 25 },
        fearRadius: 30,
        size: 'large'
    },
    BIRD: {
        name: 'Bird',
        geometry: () => new THREE.ConeGeometry(1.2, 3.5, 6),
        color: 0x00ff00,
        maxSpeed: 5.0,
        maxForce: 0.4,
        perceptionRadius: { separation: 10, alignment: 20, cohesion: 20 },
        fearRadius: 35,
        size: 'medium'
    }
};

export class Boid {
    constructor(type, position, params) {
        this.type = type;
        const geometry = type.geometry();
        geometry.rotateX(Math.PI / 2);
        const material = new THREE.MeshPhongMaterial({ 
            color: type.color,
            shininess: 100,
            specular: 0xffffff
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.position = position.clone();
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ).normalize().multiplyScalar(params.speed.min);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.maxSpeed = type.maxSpeed;
        this.maxForce = type.maxForce;
        this.fearLevel = 0;
        this.mesh.position.copy(this.position);
    }

    applyRules(neighbors, predators, foodSources, obstacles, params) {
        this.acceleration.set(0, 0, 0);

        // Combined Flocking Rules
        const sepSteer = _vec1.set(0, 0, 0);
        const aliSum = _vec2.set(0, 0, 0);
        const cohSum = _vec3.set(0, 0, 0);
        
        let sepCount = 0;
        let aliCount = 0;
        let cohCount = 0;

        const sepDist = params.perception.separation;
        const aliDist = this.type.perceptionRadius.alignment;
        const cohDist = this.type.perceptionRadius.cohesion;

        for (let i = 0; i < neighbors.length; i++) {
            const other = neighbors[i];
            if (other === this) continue;

            const distSq = this.position.distanceToSquared(other.position);
            
            if (distSq < sepDist * sepDist) {
                const dist = Math.sqrt(distSq);
                if (dist > 0) {
                    const diff = _vec4.subVectors(this.position, other.position)
                        .normalize()
                        .divideScalar(dist);
                    sepSteer.add(diff);
                    sepCount++;
                }
            }
            if (distSq < aliDist * aliDist) {
                aliSum.add(other.velocity);
                aliCount++;
            }
            if (distSq < cohDist * cohDist) {
                cohSum.add(other.position);
                cohCount++;
            }
        }

        if (sepCount > 0) {
            sepSteer.divideScalar(sepCount);
            if (sepSteer.lengthSq() > 0) {
                sepSteer.normalize().multiplyScalar(this.maxSpeed).sub(this.velocity).clampLength(0, this.maxForce);
                sepSteer.multiplyScalar(params.forces.separation);
                this.acceleration.add(sepSteer);
            }
        }

        if (aliCount > 0) {
            aliSum.divideScalar(aliCount).normalize().multiplyScalar(this.maxSpeed);
            const aliSteer = _vec4.subVectors(aliSum, this.velocity).clampLength(0, this.maxForce);
            aliSteer.multiplyScalar(params.forces.alignment);
            this.acceleration.add(aliSteer);
        }

        if (cohCount > 0) {
            cohSum.divideScalar(cohCount);
            const cohDesired = _vec4.subVectors(cohSum, this.position);
            if (cohDesired.lengthSq() > 0) {
                cohDesired.normalize().multiplyScalar(this.maxSpeed);
                const cohSteer = _vec5.subVectors(cohDesired, this.velocity).clampLength(0, this.maxForce);
                cohSteer.multiplyScalar(params.forces.cohesion);
                this.acceleration.add(cohSteer);
            }
        }

        // Avoidance, Fear, and Food (separate for now as they are usually fewer items)
        const avoidance = this.calculateAvoidance(obstacles, params);
        const fear = this.calculateFear(predators);
        const foodRes = this.calculateFoodAttraction(foodSources, params);

        avoidance.multiplyScalar(params.forces.avoidance);
        fear.multiplyScalar(params.forces.fear);
        
        let foodSteer = _vec6.set(0,0,0);
        let consume = null;
        if (foodRes.steer) {
            foodSteer = foodRes.steer.multiplyScalar(params.forces.foodAttraction);
            consume = foodRes.consume;
        } else {
            foodSteer = foodRes.multiplyScalar(params.forces.foodAttraction);
        }

        this.acceleration.add(avoidance);
        this.acceleration.add(fear);
        this.acceleration.add(foodSteer);

        this.handleBoundaries(params);

        return consume ? { consume } : null;
    }

    calculateAvoidance(obstacles, params) {
        const steer = new THREE.Vector3();
        const perceptionRadius = params.perception.avoidance;
        for (let obstacle of obstacles) {
            const distance = this.position.distanceTo(obstacle.position);
            const obstacleSize = 5;
            if (distance < perceptionRadius + obstacleSize) {
                const repulsion = _vec4.subVectors(this.position, obstacle.position)
                    .normalize()
                    .multiplyScalar((perceptionRadius + obstacleSize - distance) * 0.1);
                steer.add(repulsion);
            }
        }
        if (steer.lengthSq() > 0) steer.clampLength(0, this.maxForce);
        return steer;
    }

    calculateFear(predators) {
        const steer = new THREE.Vector3(0, 0, 0);
        let count = 0;
        for (let predator of predators) {
            const distance = this.position.distanceTo(predator.position);
            const fearRadius = this.type.fearRadius;
            if (distance < fearRadius) {
                const diff = _vec4.subVectors(this.position, predator.position);
                diff.normalize();
                diff.divideScalar(Math.max(0.1, distance * distance));
                steer.add(diff);
                count++;
            }
        }
        if (count > 0) {
            steer.divideScalar(count);
            steer.normalize();
            steer.multiplyScalar(this.maxSpeed * (1 + this.fearLevel));
            steer.sub(this.velocity);
            steer.clampLength(0, this.maxForce * 2);
        }
        return steer;
    }

    calculateFoodAttraction(foodSources, params) {
        let closestFood = null;
        let closestDistance = Infinity;
        for (let food of foodSources) {
            const distance = this.position.distanceTo(food.position);
            const attractionRadius = params.food.attractionRadius;
            if (distance < attractionRadius && distance < closestDistance) {
                closestFood = food;
                closestDistance = distance;
            }
        }
        if (closestFood) {
            const desired = _vec4.subVectors(closestFood.position, this.position);
            desired.normalize();
            desired.multiplyScalar(this.maxSpeed);
            const steer = _vec5.subVectors(desired, this.velocity);
            steer.clampLength(0, this.maxForce);
            
            if (closestDistance < 2) {
                return { steer, consume: closestFood };
            }
            return steer;
        }
        return _vec4.set(0,0,0);
    }

    handleBoundaries(params) {
        const margin = params.bounds * 0.9;
        const steer = _vec4.set(0, 0, 0);
        let count = 0;
        if (this.position.x < -margin) { steer.x += 1; count++; }
        else if (this.position.x > margin) { steer.x -= 1; count++; }
        if (this.position.y < -margin) { steer.y += 1; count++; }
        else if (this.position.y > margin) { steer.y -= 1; count++; }
        if (this.position.z < -margin) { steer.z += 1; count++; }
        else if (this.position.z > margin) { steer.z -= 1; count++; }
        if (count > 0) {
            steer.normalize().multiplyScalar(this.maxSpeed);
            steer.sub(this.velocity);
            steer.clampLength(0, this.maxForce * 2);
            this.acceleration.add(steer);
        }
    }

    update(params, deltaTime = 1) {
        // Normalize physics to roughly 60fps equivalent if deltaTime is used
        const dt = deltaTime * 60; 
        
        const scaledAcc = _vec4.copy(this.acceleration).multiplyScalar(dt);
        this.velocity.add(scaledAcc);
        this.velocity.clampLength(params.speed.min, params.speed.max);
        
        const scaledVel = _vec4.copy(this.velocity).multiplyScalar(dt);
        this.position.add(scaledVel);
        
        this.mesh.position.copy(this.position);
        if (this.velocity.lengthSq() > 0.001) {
            const lookTarget = _vec4.copy(this.position).add(this.velocity);
            this.mesh.lookAt(lookTarget);
        }
    }
}

export class Predator {
    constructor(position, params) {
        const geometry = new THREE.SphereGeometry(2.5, 12, 12);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0xff3333,
            shininess: 100,
            specular: 0xffffff
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.position = position.clone();
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ).normalize().multiplyScalar(1.5);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.maxSpeed = params.predators.speed;
        this.maxForce = 0.3;
        this.huntCooldown = 0;
        this.mesh.position.copy(this.position);
    }

    update(boids, params, deltaTime = 1) {
        const dt = deltaTime * 60;
        if (this.huntCooldown > 0) this.huntCooldown -= dt;
        
        let closestBoid = null;
        let closestDistance = Infinity;
        for (let boid of boids) {
            const distance = this.position.distanceTo(boid.position);
            if (distance < params.predators.huntRadius && distance < closestDistance) {
                closestBoid = boid;
                closestDistance = distance;
            }
        }

        this.acceleration.set(0, 0, 0);
        let caughtBoid = null;

        if (closestBoid && this.huntCooldown <= 0) {
            const desired = _vec4.subVectors(closestBoid.position, this.position);
            desired.normalize().multiplyScalar(this.maxSpeed);
            const steer = _vec5.subVectors(desired, this.velocity);
            steer.clampLength(0, this.maxForce);
            this.acceleration.add(steer);
            if (closestDistance < 3) {
                this.huntCooldown = 120;
                caughtBoid = closestBoid;
            }
        } else {
            const wander = _vec4.set((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
            this.acceleration.add(wander);
        }

        const scaledAcc = _vec4.copy(this.acceleration).multiplyScalar(dt);
        this.velocity.add(scaledAcc);
        this.velocity.clampLength(0, this.maxSpeed);
        
        const scaledVel = _vec4.copy(this.velocity).multiplyScalar(dt);
        this.position.add(scaledVel);
        
        // Wrap boundaries
        const bounds = params.bounds * 1.5;
        if (this.position.x > bounds) this.position.x = -bounds;
        if (this.position.x < -bounds) this.position.x = bounds;
        if (this.position.y > bounds) this.position.y = -bounds;
        if (this.position.y < -bounds) this.position.y = bounds;
        if (this.position.z > bounds) this.position.z = -bounds;
        if (this.position.z < -bounds) this.position.z = bounds;

        this.mesh.position.copy(this.position);
        if (this.velocity.lengthSq() > 0.001) {
            const lookTarget = _vec4.copy(this.position).add(this.velocity);
            this.mesh.lookAt(lookTarget);
        }
        
        return caughtBoid;
    }
}

