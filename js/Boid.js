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

    applyRules(boids, predators, foodSources, obstacles, params) {
        this.acceleration.set(0, 0, 0);

        const separation = this.calculateSeparation(boids, params);
        const alignment = this.calculateAlignment(boids);
        const cohesion = this.calculateCohesion(boids);
        const avoidance = this.calculateAvoidance(obstacles, params);
        const fear = this.calculateFear(predators);
        const foodAttraction = this.calculateFoodAttraction(foodSources, params);

        separation.multiplyScalar(params.forces.separation);
        alignment.multiplyScalar(params.forces.alignment);
        cohesion.multiplyScalar(params.forces.cohesion);
        avoidance.multiplyScalar(params.forces.avoidance);
        fear.multiplyScalar(params.forces.fear);
        foodAttraction.multiplyScalar(params.forces.foodAttraction);

        this.acceleration.add(separation);
        this.acceleration.add(alignment);
        this.acceleration.add(cohesion);
        this.acceleration.add(avoidance);
        this.acceleration.add(fear);
        this.acceleration.add(foodAttraction);

        this.handleBoundaries(params);
    }

    calculateSeparation(boids, params) {
        const steer = new THREE.Vector3();
        let count = 0;
        for (let other of boids) {
            const distance = this.position.distanceTo(other.position);
            if (distance > 0 && distance < params.perception.separation) {
                const diff = new THREE.Vector3()
                    .subVectors(this.position, other.position)
                    .normalize()
                    .divideScalar(distance);
                steer.add(diff);
                count++;
            }
        }
        if (count > 0) {
            steer.divideScalar(count);
            if (steer.lengthSq() > 0) {
                steer.normalize().multiplyScalar(this.maxSpeed);
                steer.sub(this.velocity);
                steer.clampLength(0, this.maxForce);
            }
        }
        return steer;
    }

    calculateAlignment(boids) {
        const sum = new THREE.Vector3();
        let count = 0;
        const perceptionRadius = this.type.perceptionRadius.alignment;
        for (let other of boids) {
            const distance = this.position.distanceTo(other.position);
            if (distance > 0 && distance < perceptionRadius) {
                sum.add(other.velocity);
                count++;
            }
        }
        if (count > 0) {
            sum.divideScalar(count);
            sum.normalize().multiplyScalar(this.maxSpeed);
            const steer = new THREE.Vector3().subVectors(sum, this.velocity);
            steer.clampLength(0, this.maxForce);
            return steer;
        }
        return new THREE.Vector3();
    }

    calculateCohesion(boids) {
        const sum = new THREE.Vector3();
        let count = 0;
        const perceptionRadius = this.type.perceptionRadius.cohesion;
        for (let other of boids) {
            const distance = this.position.distanceTo(other.position);
            if (distance > 0 && distance < perceptionRadius) {
                sum.add(other.position);
                count++;
            }
        }
        if (count > 0) {
            sum.divideScalar(count);
            const desired = new THREE.Vector3().subVectors(sum, this.position);
            if (desired.lengthSq() > 0) {
                desired.normalize().multiplyScalar(this.maxSpeed);
                const steer = new THREE.Vector3().subVectors(desired, this.velocity);
                steer.clampLength(0, this.maxForce);
                return steer;
            }
        }
        return new THREE.Vector3();
    }

    calculateAvoidance(obstacles, params) {
        const steer = new THREE.Vector3();
        const perceptionRadius = params.perception.avoidance;
        for (let obstacle of obstacles) {
            const distance = this.position.distanceTo(obstacle.position);
            const obstacleSize = 5;
            if (distance < perceptionRadius + obstacleSize) {
                const repulsion = new THREE.Vector3()
                    .subVectors(this.position, obstacle.position)
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
                const diff = new THREE.Vector3().subVectors(this.position, predator.position);
                diff.normalize();
                diff.divideScalar(distance * distance);
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
        const steer = new THREE.Vector3(0, 0, 0);
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
            const desired = new THREE.Vector3().subVectors(closestFood.position, this.position);
            desired.normalize();
            desired.multiplyScalar(this.maxSpeed);
            steer.subVectors(desired, this.velocity);
            steer.clampLength(0, this.maxForce);
            
            if (closestDistance < 2) {
                return { steer, consume: closestFood };
            }
        }
        return steer;
    }

    handleBoundaries(params) {
        const margin = params.bounds * 0.9;
        const steer = new THREE.Vector3();
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

    update(params) {
        this.velocity.add(this.acceleration);
        this.velocity.clampLength(params.speed.min, params.speed.max);
        this.position.add(this.velocity);
        this.mesh.position.copy(this.position);
        if (this.velocity.lengthSq() > 0.001) {
            this.mesh.lookAt(this.position.clone().add(this.velocity));
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

    update(boids, params) {
        if (this.huntCooldown > 0) this.huntCooldown--;
        let closestBoid = null;
        let closestDistance = Infinity;
        for (let boid of boids) {
            const distance = this.position.distanceTo(boid.position);
            if (distance < params.predators.huntRadius && distance < closestDistance) {
                closestBoid = boid;
                closestDistance = distance;
            }
        }
        if (closestBoid && this.huntCooldown === 0) {
            const desired = new THREE.Vector3().subVectors(closestBoid.position, this.position);
            desired.normalize().multiplyScalar(this.maxSpeed);
            const steer = new THREE.Vector3().subVectors(desired, this.velocity);
            steer.clampLength(0, this.maxForce);
            this.acceleration.add(steer);
            if (closestDistance < 3) {
                this.huntCooldown = 120;
                return closestBoid;
            }
        } else {
            const wander = new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
            this.acceleration.add(wander);
        }
        this.velocity.add(this.acceleration);
        this.velocity.clampLength(0, this.maxSpeed);
        this.position.add(this.velocity);
        this.acceleration.multiplyScalar(0);
        const bounds = params.bounds * 2;
        if (this.position.x > bounds) this.position.x = -bounds;
        if (this.position.x < -bounds) this.position.x = bounds;
        if (this.position.y > bounds) this.position.y = -bounds;
        if (this.position.y < -bounds) this.position.y = bounds;
        if (this.position.z > bounds) this.position.z = -bounds;
        if (this.position.z < -bounds) this.position.z = bounds;
        this.mesh.position.copy(this.position);
        this.mesh.lookAt(this.position.clone().add(this.velocity));
        return null;
    }
}
