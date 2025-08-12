// Vector math utility class
class Vec {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    
    clone() {
        return new Vec(this.x, this.y);
    }
    
    add(v) {
        return new Vec(this.x + v.x, this.y + v.y);
    }
    
    subtract(v) {
        return new Vec(this.x - v.x, this.y - v.y);
    }
    
    multiply(s) {
        return new Vec(this.x * s, this.y * s);
    }
    
    divide(s) {
        return new Vec(this.x / s, this.y / s);
    }
    
    magnitude() {
        return Math.hypot(this.x, this.y);
    }
    
    normalize() {
        const m = this.magnitude();
        return m > 0 ? this.divide(m) : new Vec(0, 0);
    }
    
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }
    
    angle() {
        return Math.atan2(this.y, this.x);
    }
    
    static random() {
        const a = Math.random() * Math.PI * 2;
        return new Vec(Math.cos(a), Math.sin(a));
    }
}

// Blob generator for creating irregular obstacle shapes
function makeBlob(cx, cy, r, irregularity = 0.1, points = 20) {
    const pts = [];
    points = Math.max(3, points);
    for (let i = 0; i < points; i++) {
        const theta = (i / points) * Math.PI * 2;
        const variance = 1 + (Math.random() * 2 - 1) * irregularity;
        const radius = r * variance;
        pts.push(new Vec(cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius));
    }
    return pts;
}

// Find nearest point on a line segment
function closestOnSeg(a, b, p) {
    const ab = b.subtract(a);
    const t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y);
    const tt = Math.max(0, Math.min(1, t));
    return new Vec(a.x + ab.x * tt, a.y + ab.y * tt);
}

// Enhanced pheromone field with separate home/food trails
class PheromoneField {
    constructor(w, h, cell) {
        this.cell = cell;
        this.gridW = Math.max(1, Math.ceil(w / cell));
        this.gridH = Math.max(1, Math.ceil(h / cell));
        this.home = Array(this.gridW).fill().map(() => Array(this.gridH).fill(0));
        this.food = Array(this.gridW).fill().map(() => Array(this.gridH).fill(0));
        this.pathSuccess = Array(this.gridW).fill().map(() => Array(this.gridH).fill(0));
    }
    
    _clamp(i, max) {
        return Math.min(Math.max(i, 0), max - 1);
    }
    
    index(pos) {
        let gx = Math.floor(pos.x / this.cell);
        let gy = Math.floor(pos.y / this.cell);
        gx = this._clamp(gx, this.gridW);
        gy = this._clamp(gy, this.gridH);
        return { gx, gy };
    }
    
    deposit(pos, type, amt, successBonus = 1) {
        const { gx, gy } = this.index(pos);
        if (type === 'home') {
            this.home[gx][gy] = Math.min(this.home[gx][gy] + amt * successBonus, 1000);
        } else {
            this.food[gx][gy] = Math.min(this.food[gx][gy] + amt * successBonus, 1000);
        }
        this.pathSuccess[gx][gy] += successBonus * 0.1;
        
        // Spread pheromone to neighboring cells for smoother trails
        const spreadRadius = 1;
        for (let dx = -spreadRadius; dx <= spreadRadius; dx++) {
            for (let dy = -spreadRadius; dy <= spreadRadius; dy++) {
                const nx = gx + dx;
                const ny = gy + dy;
                if (nx >= 0 && nx < this.gridW && ny >= 0 && ny < this.gridH) {
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance > 0 && distance <= spreadRadius) {
                        const spreadAmount = amt * successBonus * (1 - distance / spreadRadius) * 0.3;
                        if (type === 'home') {
                            this.home[nx][ny] = Math.min(this.home[nx][ny] + spreadAmount, 1000);
                        } else {
                            this.food[nx][ny] = Math.min(this.food[nx][ny] + spreadAmount, 1000);
                        }
                    }
                }
            }
        }
    }
    
    sample(pos, type) {
        const { gx, gy } = this.index(pos);
        return type === 'home' ? this.home[gx][gy] : this.food[gx][gy];
    }
    
    gradient(pos, type) {
        const delta = this.cell * 0.8;
        
        // 8-directional sampling for more accurate gradients
        const right = this.sample(new Vec(pos.x + delta, pos.y), type);
        const left = this.sample(new Vec(pos.x - delta, pos.y), type);
        const down = this.sample(new Vec(pos.x, pos.y + delta), type);
        const up = this.sample(new Vec(pos.x, pos.y - delta), type);
        const upRight = this.sample(new Vec(pos.x + delta * 0.7, pos.y - delta * 0.7), type);
        const upLeft = this.sample(new Vec(pos.x - delta * 0.7, pos.y - delta * 0.7), type);
        const downRight = this.sample(new Vec(pos.x + delta * 0.7, pos.y + delta * 0.7), type);
        const downLeft = this.sample(new Vec(pos.x - delta * 0.7, pos.y + delta * 0.7), type);
        
        // Calculate gradient using all 8 directions
        const dx = (right - left) * 0.5 + (upRight - upLeft + downRight - downLeft) * 0.25;
        const dy = (down - up) * 0.5 + (downRight - upRight + downLeft - upLeft) * 0.25;
        
        const grad = new Vec(dx, dy);
        return grad.magnitude() > 0.1 ? grad.normalize() : new Vec(0, 0);
    }
    
    evaporate(rate) {
        for (let x = 0; x < this.gridW; x++) {
            for (let y = 0; y < this.gridH; y++) {
                this.home[x][y] *= (1 - rate);
                this.food[x][y] *= (1 - rate);
                this.pathSuccess[x][y] *= (1 - rate * 0.3);
                
                if (this.home[x][y] < 0.01) this.home[x][y] = 0;
                if (this.food[x][y] < 0.01) this.food[x][y] = 0;
                if (this.pathSuccess[x][y] < 0.01) this.pathSuccess[x][y] = 0;
            }
        }
    }
    
    reinforcePath(pathPoints, strength) {
        if (!pathPoints || pathPoints.length === 0) return;
        
        for (const pos of pathPoints) {
            if (!pos) continue;
            const { gx, gy } = this.index(pos);
            if (gx >= 0 && gx < this.gridW && gy >= 0 && gy < this.gridH) {
                this.pathSuccess[gx][gy] = Math.min(this.pathSuccess[gx][gy] + strength, 100);
            }
        }
    }
}

class AntForagingSimulation {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        
        // Simulation parameters
        this.antCount = 500;
        this.evaporationRate = 0.01; // Reduced from 0.05
        this.foodCount = 8; // Increased from 2
        
        // Simulation state
        this.ants = [];
        this.foodSources = [];
        this.obstacles = [];
        this.pheromoneField = new PheromoneField(this.width, this.height, 6);
        // Nest properties - will be randomized in initialize()
        this.nest = { 
            x: this.width / 2, 
            y: this.height / 2, 
            radius: 40, 
            foodStored: 0,
            maxCapacity: 0, // Will be calculated based on total food available
            efficiency: 1.0,
            isFull: false
        };
        
        this.nest2 = { 
            x: this.width / 2, 
            y: this.height / 2, 
            radius: 40, 
            foodStored: 0,
            maxCapacity: 0, // Will be calculated based on total food available
            efficiency: 1.0,
            isFull: false
        };
        this.frameCount = 0;
        this.lastSpawnTime = 0;
        this.nextSpawnInterval = 60 + Math.floor(Math.random() * 120); // 1-3 seconds (much faster)
        this.deadAntCount = 0; // Track total dead ants
        this.queenEggsLaid = 0; // Track total eggs laid by queen
        
        // Colony tracking
        this.ants2 = []; // Second colony ants
        this.deadAntCount2 = 0; // Second colony dead ants
        this.queenEggsLaid2 = 0; // Second colony eggs laid
        
        this.initialize();

        this.start();
    }
    
    initialize() {
        // Initialize pheromone field
        this.pheromoneField = new PheromoneField(this.width, this.height, 6);
        
        // Place nests on opposite sides
        const nestMargin = 100;
        this.nest.x = nestMargin + Math.random() * (this.width * 0.3 - nestMargin);
        this.nest.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
        
        this.nest2.x = this.width - nestMargin - Math.random() * (this.width * 0.3 - nestMargin);
        this.nest2.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
        
        // Place food in the middle area between nests
        const foodSide = 'middle';
        
        console.log(`Nest placed at (${this.nest.x.toFixed(0)}, ${this.nest.y.toFixed(0)}) - Food will be placed on ${foodSide} side`);
        
        // Create food sources on the opposite side of the nest
        this.foodSources = [];
        for (let i = 0; i < this.foodCount; i++) {
            let food;
            let attempts = 0;
            do {
                food = new Food(Math.random() * this.width, Math.random() * this.height);
                
                // Place food in the middle area between both nests
                food.pos.x = this.width * 0.3 + Math.random() * (this.width * 0.4);
                food.pos.y = 50 + Math.random() * (this.height - 100);
                
                attempts++;
                
                let ok = true;
                // Don't place food too close to either nest
                if (food.pos.subtract(new Vec(this.nest.x, this.nest.y)).magnitude() < food.radius + 80 ||
                    food.pos.subtract(new Vec(this.nest2.x, this.nest2.y)).magnitude() < food.radius + 80) {
                    ok = false;
                }
                // Don't place food too close to other food
                for (const existingFood of this.foodSources) {
                    if (food.pos.subtract(existingFood.pos).magnitude() < food.radius + existingFood.radius + 15) {
                        ok = false;
                        break;
                    }
                }
                if (ok) break;
            } while (attempts < 100);
            this.foodSources.push(food);
        }
        
        // Calculate nest capacity based on total food available
        let totalFoodAvailable = 0;
        for (const food of this.foodSources) {
            totalFoodAvailable += food.originalAmount;
        }
        this.nest.maxCapacity = totalFoodAvailable;
        this.nest2.maxCapacity = totalFoodAvailable;
        console.log(`Both nests capacity set to ${totalFoodAvailable} (total food available)`);
        
        // Create obstacles between nest and food sources
        this.obstacles = [];
        const obstacleCount = 15;
        for (let i = 0; i < obstacleCount; i++) {
            let obstacle;
            let attempts = 0;
            do {
                obstacle = new Obstacle(Math.random() * this.width, Math.random() * this.height);
                
                // Place obstacles in the middle area between both nests
                obstacle.pos.x = this.width * 0.3 + Math.random() * (this.width * 0.4);
                obstacle.pos.y = 50 + Math.random() * (this.height - 100);
                
                obstacle.randomize(this.width, this.height);
                attempts++;
                
                let ok = true;
                // Don't place obstacles too close to either nest
                if (obstacle.pos.subtract(new Vec(this.nest.x, this.nest.y)).magnitude() < obstacle.baseRadius + 80 ||
                    obstacle.pos.subtract(new Vec(this.nest2.x, this.nest2.y)).magnitude() < obstacle.baseRadius + 80) {
                    ok = false;
                }
                // Don't place obstacles too close to food sources
                for (const food of this.foodSources) {
                    if (obstacle.pos.subtract(food.pos).magnitude() < obstacle.baseRadius + food.radius + 20) {
                        ok = false;
                        break;
                    }
                }
                // Don't place obstacles too close to each other
                for (const existingObstacle of this.obstacles) {
                    if (obstacle.pos.subtract(existingObstacle.pos).magnitude() < obstacle.baseRadius + existingObstacle.baseRadius + 20) {
                        ok = false;
                        break;
                    }
                }
                if (ok) break;
            } while (attempts < 100);
            this.obstacles.push(obstacle);
        }
        
        // Create ants for first colony (red)
        this.ants = [];
        for (let i = 0; i < this.antCount; i++) {
            // Create ants in a wider area around the nest
            const angle = (i / this.antCount) * Math.PI * 2 + Math.random() * 0.5;
            const distance = 15 + Math.random() * 10;
            const x = this.nest.x + Math.cos(angle) * distance;
            const y = this.nest.y + Math.sin(angle) * distance;
            
            const ant = new Ant(x, y, this);
            ant.colony = 1; // Mark as first colony
            this.ants.push(ant);
        }
        console.log(`Created ${this.ants.length} red ants around nest position (${this.nest.x}, ${this.nest.y})`);
        
        // Create ants for second colony (blue)
        this.ants2 = [];
        for (let i = 0; i < this.antCount; i++) {
            // Create ants in a wider area around the second nest
            const angle = (i / this.antCount) * Math.PI * 2 + Math.random() * 0.5;
            const distance = 15 + Math.random() * 10;
            const x = this.nest2.x + Math.cos(angle) * distance;
            const y = this.nest2.y + Math.sin(angle) * distance;
            
            const ant = new Ant(x, y, this);
            ant.colony = 2; // Mark as second colony
            this.ants2.push(ant);
        }
        console.log(`Created ${this.ants2.length} blue ants around nest2 position (${this.nest2.x}, ${this.nest2.y})`);
        
        // Give ants varied initial directions for both colonies
        for (let i = 0; i < this.ants.length; i++) {
            const ant = this.ants[i];
            // Point ants in different directions based on their position
            const angleToNest = ant.position.subtract(new Vec(this.nest.x, this.nest.y)).angle();
            ant.velocity = new Vec(Math.cos(angleToNest + (Math.random() - 0.5) * Math.PI), 
                                 Math.sin(angleToNest + (Math.random() - 0.5) * Math.PI)).multiply(2);
        }
        
        for (let i = 0; i < this.ants2.length; i++) {
            const ant = this.ants2[i];
            // Point ants in different directions based on their position
            const angleToNest = ant.position.subtract(new Vec(this.nest2.x, this.nest2.y)).angle();
            ant.velocity = new Vec(Math.cos(angleToNest + (Math.random() - 0.5) * Math.PI), 
                                 Math.sin(angleToNest + (Math.random() - 0.5) * Math.PI)).multiply(2);
        }
        
        console.log(`Initialized simulation with ${this.ants.length} red ants and ${this.ants2.length} blue ants`);
        console.log(`Canvas size: ${this.width} x ${this.height}`);
        console.log(`Red nest position: (${this.nest.x}, ${this.nest.y})`);
        console.log(`Blue nest position: (${this.nest2.x}, ${this.nest2.y})`);
        if (this.ants.length > 0) {
            console.log(`First red ant position: (${this.ants[0].position.x}, ${this.ants[0].position.y})`);
        }
        if (this.ants2.length > 0) {
            console.log(`First blue ant position: (${this.ants2[0].position.x}, ${this.ants2[0].position.y})`);
        }
    }
    

    

    
    updateAntCount() {
        const currentCount = this.ants.length;
        if (this.antCount > currentCount) {
            // Add more ants with proper initialization
            for (let i = currentCount; i < this.antCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 15 + Math.random() * 10;
                const x = this.nest.x + Math.cos(angle) * distance;
                const y = this.nest.y + Math.sin(angle) * distance;
                
                const newAnt = new Ant(x, y, this);
                newAnt.velocity = Vec.random().multiply(2);
                this.ants.push(newAnt);
            }
        } else if (this.antCount < currentCount) {
            // Remove ants
            this.ants = this.ants.slice(0, this.antCount);
        }
    }
    
    addPheromone(pos, type, strength, successBonus = 1) {
        this.pheromoneField.deposit(pos, type, strength, successBonus);
    }
    
    getPheromoneLevel(pos, type) {
        return this.pheromoneField.sample(pos, type);
    }
    
    getPheromoneGradient(pos, type) {
        return this.pheromoneField.gradient(pos, type);
    }
    
    // New realistic antennae-like pheromone detection
    getAntennaePheromoneDirection(pos, type, antVelocity = null) {
        const detectionRange = 80; // Like real ant antennae
        const noiseLevel = 0.3; // Add realistic noise to sensing
        
        // Sample pheromone levels in a forward-facing cone
        const samples = [];
        const currentAngle = antVelocity ? antVelocity.angle() : 0;
        
        // Sample in a 120-degree cone in front of the ant
        for (let angle = -Math.PI/3; angle <= Math.PI/3; angle += Math.PI/12) {
            const sampleAngle = currentAngle + angle;
            const samplePos = new Vec(
                pos.x + Math.cos(sampleAngle) * detectionRange,
                pos.y + Math.sin(sampleAngle) * detectionRange
            );
            
            // Add noise to the sample position
            const noiseX = (Math.random() - 0.5) * noiseLevel * detectionRange;
            const noiseY = (Math.random() - 0.5) * noiseLevel * detectionRange;
            samplePos.x += noiseX;
            samplePos.y += noiseY;
            
            const strength = this.getPheromoneLevel(samplePos, type);
            const distance = pos.subtract(samplePos).magnitude();
            
            // Apply distance falloff (like real antennae)
            const falloff = Math.max(0, 1 - distance / detectionRange);
            const adjustedStrength = strength * falloff;
            
            samples.push({
                pos: samplePos,
                strength: adjustedStrength,
                angle: sampleAngle
            });
        }
        
        // Find the strongest pheromone direction
        let strongestSample = samples[0];
        for (const sample of samples) {
            if (sample.strength > strongestSample.strength) {
                strongestSample = sample;
            }
        }
        
        // If no significant pheromone detected, return null
        if (strongestSample.strength < 0.5) {
            return null;
        }
        
        // Return direction toward strongest pheromone with some noise
        const direction = strongestSample.pos.subtract(pos).normalize();
        const noiseAngle = (Math.random() - 0.5) * noiseLevel;
        const noisyDirection = new Vec(
            Math.cos(direction.angle() + noiseAngle),
            Math.sin(direction.angle() + noiseAngle)
        );
        
        return {
            direction: noisyDirection,
            strength: strongestSample.strength
        };
    }
    
    spawnNewAnts() {
        // Spawn new ants to maintain population with proper timing
        const targetPopulation = this.antCount;
        const currentPopulation = this.ants.length;
        
        // Emergency spawning if population is critically low
        if (currentPopulation < targetPopulation * 0.3) { // Less than 30% of target
            const emergencySpawn = Math.min(10 + Math.floor(Math.random() * 10), targetPopulation - currentPopulation);
            for (let i = 0; i < emergencySpawn; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 10 + Math.random() * 15;
                const x = this.nest.x + Math.cos(angle) * distance;
                const y = this.nest.y + Math.sin(angle) * distance;
                
                const newAnt = new Ant(x, y, this);
                newAnt.velocity = Vec.random().multiply(2);
                this.ants.push(newAnt);
            }
            this.queenEggsLaid += emergencySpawn;
            console.log(`EMERGENCY: Queen laid ${emergencySpawn} eggs! Population: ${this.ants.length}/${targetPopulation}`);
            this.lastSpawnTime = this.frameCount;
            this.nextSpawnInterval = 30 + Math.floor(Math.random() * 60); // 0.5-1.5 seconds for emergency
            return;
        }
        
        if (currentPopulation < targetPopulation) {
            // Check if it's time to spawn
            if (this.frameCount - this.lastSpawnTime >= this.nextSpawnInterval) {
                // Spawn 3-8 ants at a time (much more productive)
                const antsToSpawn = Math.min(3 + Math.floor(Math.random() * 6), targetPopulation - currentPopulation);
                
                for (let i = 0; i < antsToSpawn; i++) {
                    // Spawn ants near the nest
                    const angle = Math.random() * Math.PI * 2;
                    const distance = 10 + Math.random() * 15;
                    const x = this.nest.x + Math.cos(angle) * distance;
                    const y = this.nest.y + Math.sin(angle) * distance;
                    
                    const newAnt = new Ant(x, y, this);
                    newAnt.velocity = Vec.random().multiply(2);
                    this.ants.push(newAnt);
                }
                
                                    if (antsToSpawn > 0) {
                        this.queenEggsLaid += antsToSpawn; // Track eggs laid
                        console.log(`Queen laid ${antsToSpawn} eggs. Total laid: ${this.queenEggsLaid}. Population: ${this.ants.length}/${targetPopulation}`);
                    }
                
                // Update spawn timing
                this.lastSpawnTime = this.frameCount;
                this.nextSpawnInterval = 60 + Math.floor(Math.random() * 120); // 1-3 seconds (much faster)
            }
        }
    }
    
    spawnNewAnts2() {
        // Spawn new ants for second colony to maintain population with proper timing
        const targetPopulation = this.antCount;
        const currentPopulation = this.ants2.length;
        
        // Emergency spawning if population is critically low
        if (currentPopulation < targetPopulation * 0.3) { // Less than 30% of target
            const emergencySpawn = Math.min(10 + Math.floor(Math.random() * 10), targetPopulation - currentPopulation);
            for (let i = 0; i < emergencySpawn; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 10 + Math.random() * 15;
                const x = this.nest2.x + Math.cos(angle) * distance;
                const y = this.nest2.y + Math.sin(angle) * distance;
                
                const newAnt = new Ant(x, y, this);
                newAnt.colony = 2; // Mark as second colony
                newAnt.velocity = Vec.random().multiply(2);
                this.ants2.push(newAnt);
            }
            this.queenEggsLaid2 += emergencySpawn;
            console.log(`EMERGENCY: Blue Queen laid ${emergencySpawn} eggs! Population: ${this.ants2.length}/${targetPopulation}`);
            return;
        }
        
        if (currentPopulation < targetPopulation) {
            // Check if it's time to spawn (use same timing as first colony for simplicity)
            if (this.frameCount - this.lastSpawnTime >= this.nextSpawnInterval) {
                // Spawn 3-8 ants at a time (much more productive)
                const antsToSpawn = Math.min(3 + Math.floor(Math.random() * 6), targetPopulation - currentPopulation);
                
                for (let i = 0; i < antsToSpawn; i++) {
                    // Spawn ants near the second nest
                    const angle = Math.random() * Math.PI * 2;
                    const distance = 10 + Math.random() * 15;
                    const x = this.nest2.x + Math.cos(angle) * distance;
                    const y = this.nest2.y + Math.sin(angle) * distance;
                    
                    const newAnt = new Ant(x, y, this);
                    newAnt.colony = 2; // Mark as second colony
                    newAnt.velocity = Vec.random().multiply(2);
                    this.ants2.push(newAnt);
                }
                
                if (antsToSpawn > 0) {
                    this.queenEggsLaid2 += antsToSpawn; // Track eggs laid
                    console.log(`Blue Queen laid ${antsToSpawn} eggs. Total laid: ${this.queenEggsLaid2}. Population: ${this.ants2.length}/${targetPopulation}`);
                }
            }
        }
    }
    
    evaporatePheromones() {
        this.pheromoneField.evaporate(this.evaporationRate);
    }
    
    update() {
        this.frameCount++;
        
        // Update all ants from both colonies and remove dead ones
        this.ants = this.ants.filter(ant => {
            ant.update();
            return ant.isAlive; // Keep only alive ants
        });
        
        this.ants2 = this.ants2.filter(ant => {
            ant.update();
            return ant.isAlive; // Keep only alive ants
        });
        
        // Spawn new ants to maintain population for both colonies
        this.spawnNewAnts();
        this.spawnNewAnts2();
        
        // Evaporate pheromones
        this.evaporatePheromones();
        
        // Debug: Log ant movement every 60 frames (1 second at 60fps)
        if (this.frameCount % 60 === 0 && (this.ants.length > 0 || this.ants2.length > 0)) {
            if (this.ants.length > 0) {
                console.log(`Frame ${this.frameCount}: First red ant at (${Math.floor(this.ants[0].position.x)}, ${Math.floor(this.ants[0].position.y)})`);
            }
            if (this.ants2.length > 0) {
                console.log(`Frame ${this.frameCount}: First blue ant at (${Math.floor(this.ants2[0].position.x)}, ${Math.floor(this.ants2[0].position.y)})`);
            }
        }
    }
    
    draw() {
        // Clear canvas with dark background
        this.ctx.fillStyle = '#202020';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw pheromone trails
        this.drawPheromones();
        
        // Draw obstacles
        for (const obstacle of this.obstacles) {
            obstacle.draw(this.ctx);
        }
        
        // Draw food sources
        this.drawFoodSources();
        
        // Draw nests
        this.drawNest();
        this.drawNest2();
        
        // Draw ants from both colonies
        this.drawAnts();
        this.drawAnts2();
        
        // Draw debug info
        this.drawDebugInfo();
    }
    
    drawPheromones() {
        const cell = this.pheromoneField.cell;
        
        for (let x = 0; x < this.pheromoneField.gridW; x++) {
            for (let y = 0; y < this.pheromoneField.gridH; y++) {
                const homeStr = this.pheromoneField.home[x][y];
                const foodStr = this.pheromoneField.food[x][y];
                const success = this.pheromoneField.pathSuccess[x][y];
                
                // Draw home trails (green)
                if (homeStr > 2) {
                    const alpha = Math.min(0.6, homeStr / 100);
                    const intensity = Math.min(255, 60 + success * 2);
                    this.ctx.fillStyle = `rgba(68, ${intensity}, 75, ${alpha})`;
                    this.ctx.fillRect(x * cell, y * cell, cell, cell);
                }
                
                // Draw food trails (red) - stronger on successful paths
                if (foodStr > 2) {
                    const alpha = Math.min(0.7, (foodStr + success) / 120);
                    const intensity = Math.min(255, 100 + success * 3);
                    this.ctx.fillStyle = `rgba(${intensity}, 58, 58, ${alpha})`;
                    this.ctx.fillRect(x * cell, y * cell, cell, cell);
                }
            }
        }
    }
    
    drawFoodSources() {
        for (let food of this.foodSources) {
            food.draw(this.ctx);
        }
    }
    
    drawNest() {
        this.ctx.save();
        this.ctx.translate(this.nest.x, this.nest.y);
        
        // Draw house body (red colony)
        this.ctx.fillStyle = '#8b0000'; // Dark red
        this.ctx.fillRect(-30, -20, 60, 40);
        
        // Draw roof
        this.ctx.beginPath();
        this.ctx.moveTo(-35, -20);
        this.ctx.lineTo(0, -45);
        this.ctx.lineTo(35, -20);
        this.ctx.closePath();
        this.ctx.fillStyle = '#660000'; // Darker red
        this.ctx.fill();
        
        // Draw door
        this.ctx.fillStyle = '#4a0000'; // Very dark red
        this.ctx.fillRect(-10, 0, 20, 20);
        
        // Draw food counter with capacity indicator
        const foodPercentage = Math.min(1, this.nest.foodStored / this.nest.maxCapacity);
        const percentageText = this.nest.maxCapacity > 0 ? `${Math.round(foodPercentage * 100)}%` : '0%';
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '700 16px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(percentageText, 0, 10);
        
        // Draw capacity bar
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(-25, 15, 50, 4);
        
        // Fill bar - red when full
        if (this.nest.isFull) {
            this.ctx.fillStyle = '#ff4444';
        } else {
            this.ctx.fillStyle = foodPercentage > 0.8 ? '#ff6b6b' : foodPercentage > 0.5 ? '#ffd93d' : '#6bcf7f';
        }
        this.ctx.fillRect(-25, 15, 50 * foodPercentage, 4);
        
        // Show "FULL" text when nest is full
        if (this.nest.isFull) {
            this.ctx.fillStyle = '#ff4444';
            this.ctx.font = 'bold 10px system-ui';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('FULL', 0, 25);
            this.ctx.textAlign = 'left';
        }
        
        this.ctx.restore();
    }
    
    drawNest2() {
        this.ctx.save();
        this.ctx.translate(this.nest2.x, this.nest2.y);
        
        // Draw house body (blue colony)
        this.ctx.fillStyle = '#00008b'; // Dark blue
        this.ctx.fillRect(-30, -20, 60, 40);
        
        // Draw roof
        this.ctx.beginPath();
        this.ctx.moveTo(-35, -20);
        this.ctx.lineTo(0, -45);
        this.ctx.lineTo(35, -20);
        this.ctx.closePath();
        this.ctx.fillStyle = '#000066'; // Darker blue
        this.ctx.fill();
        
        // Draw door
        this.ctx.fillStyle = '#00004a'; // Very dark blue
        this.ctx.fillRect(-10, 0, 20, 20);
        
        // Draw food counter with capacity indicator
        const foodPercentage = Math.min(1, this.nest2.foodStored / this.nest2.maxCapacity);
        const percentageText = this.nest2.maxCapacity > 0 ? `${Math.round(foodPercentage * 100)}%` : '0%';
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '700 16px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(percentageText, 0, 10);
        
        // Draw capacity bar
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(-25, 15, 50, 4);
        
        // Fill bar - red when full
        if (this.nest2.isFull) {
            this.ctx.fillStyle = '#ff4444';
        } else {
            this.ctx.fillStyle = foodPercentage > 0.8 ? '#ff6b6b' : foodPercentage > 0.5 ? '#ffd93d' : '#6bcf7f';
        }
        this.ctx.fillRect(-25, 15, 50 * foodPercentage, 4);
        
        // Show "FULL" text when nest is full
        if (this.nest2.isFull) {
            this.ctx.fillStyle = '#ff4444';
            this.ctx.font = 'bold 10px system-ui';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('FULL', 0, 25);
            this.ctx.textAlign = 'left';
        }
        
        this.ctx.restore();
    }
    
    drawAnts() {
        console.log(`Drawing ${this.ants.length} ants`);
        for (let ant of this.ants) {
            this.ctx.save();
            this.ctx.translate(ant.position.x, ant.position.y);
            
            const dir = ant.velocity.magnitude() > 0 ? ant.velocity.normalize() : new Vec(1, 0);
            const angle = Math.atan2(dir.y, dir.x);
            this.ctx.rotate(angle);
            
            // Size varies with age - older ants are slightly larger
            const ageFactor = Math.min(1.5, 1 + (ant.age / ant.lifespan) * 0.5);
            const size = 5 * ageFactor;
            
            this.ctx.beginPath();
            this.ctx.moveTo(size, 0);
            this.ctx.lineTo(-size * 0.6, size * 0.6);
            this.ctx.lineTo(-size * 0.6, -size * 0.6);
            this.ctx.closePath();
            
            // Color based on food status and energy level (red colony)
            let baseColor = ant.hasFood ? '#d66555' : '#ff6b6b'; // Red colors for first colony
            
            // Darken color progressively as energy decreases
            const energyPercent = ant.energy / 100;
            const darkenFactor = Math.max(0.2, energyPercent); // Minimum 20% brightness
            
            // Apply darkening effect
            const r = parseInt(baseColor.slice(1, 3), 16);
            const g = parseInt(baseColor.slice(3, 5), 16);
            const b = parseInt(baseColor.slice(5, 7), 16);
            
            const darkenedR = Math.floor(r * darkenFactor);
            const darkenedG = Math.floor(g * darkenFactor);
            const darkenedB = Math.floor(b * darkenFactor);
            
            const darkenedColor = `rgb(${darkenedR}, ${darkenedG}, ${darkenedB})`;
            
            this.ctx.fillStyle = darkenedColor;
            this.ctx.fill();
            this.ctx.strokeStyle = '#222';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            
            // Draw grave effect if ant is dead
            if (ant.graveEffect) {
                this.ctx.save();
                this.ctx.globalAlpha = ant.graveEffect.alpha;
                
                // Draw graveyard icon (tombstone)
                const graveSize = 15;
                
                // Draw tombstone base
                this.ctx.fillStyle = '#696969'; // Dark gray
                this.ctx.beginPath();
                this.ctx.rect(-graveSize/2, -graveSize/2, graveSize, graveSize);
                this.ctx.fill();
                
                // Draw tombstone top (rounded)
                this.ctx.beginPath();
                this.ctx.arc(0, -graveSize/2, graveSize/2, 0, Math.PI, true);
                this.ctx.fill();
                
                // Draw cross on tombstone
                this.ctx.strokeStyle = '#ffffff'; // White cross
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(0, -4);
                this.ctx.lineTo(0, 4);
                this.ctx.moveTo(-3, 0);
                this.ctx.lineTo(3, 0);
                this.ctx.stroke();
                
                // Add border
                this.ctx.strokeStyle = '#444444';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(-graveSize/2, -graveSize/2, graveSize, graveSize);
                
                this.ctx.restore();
            }
            
            this.ctx.restore();
        }
    }
    
    drawAnts2() {
        console.log(`Drawing ${this.ants2.length} blue ants`);
        for (let ant of this.ants2) {
            this.ctx.save();
            this.ctx.translate(ant.position.x, ant.position.y);
            
            const dir = ant.velocity.magnitude() > 0 ? ant.velocity.normalize() : new Vec(1, 0);
            const angle = Math.atan2(dir.y, dir.x);
            this.ctx.rotate(angle);
            
            // Size varies with age - older ants are slightly larger
            const ageFactor = Math.min(1.5, 1 + (ant.age / ant.lifespan) * 0.5);
            const size = 5 * ageFactor;
            
            this.ctx.beginPath();
            this.ctx.moveTo(size, 0);
            this.ctx.lineTo(-size * 0.6, size * 0.6);
            this.ctx.lineTo(-size * 0.6, -size * 0.6);
            this.ctx.closePath();
            
            // Color based on food status and energy level (blue colony)
            let baseColor = ant.hasFood ? '#4a90e2' : '#6b9eff'; // Blue colors for second colony
            
            // Darken color progressively as energy decreases
            const energyPercent = ant.energy / 100;
            const darkenFactor = Math.max(0.2, energyPercent); // Minimum 20% brightness
            
            // Apply darkening effect
            const r = parseInt(baseColor.slice(1, 3), 16);
            const g = parseInt(baseColor.slice(3, 5), 16);
            const b = parseInt(baseColor.slice(5, 7), 16);
            
            const darkenedR = Math.floor(r * darkenFactor);
            const darkenedG = Math.floor(g * darkenFactor);
            const darkenedB = Math.floor(b * darkenFactor);
            
            const darkenedColor = `rgb(${darkenedR}, ${darkenedG}, ${darkenedB})`;
            
            this.ctx.fillStyle = darkenedColor;
            this.ctx.fill();
            this.ctx.strokeStyle = '#222';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            
            // Draw grave effect if ant is dead
            if (ant.graveEffect) {
                this.ctx.save();
                this.ctx.globalAlpha = ant.graveEffect.alpha;
                
                // Draw graveyard icon (tombstone)
                const graveSize = 15;
                
                // Draw tombstone base
                this.ctx.fillStyle = '#696969'; // Dark gray
                this.ctx.beginPath();
                this.ctx.rect(-graveSize/2, -graveSize/2, graveSize, graveSize);
                this.ctx.fill();
                
                // Draw tombstone top (rounded)
                this.ctx.beginPath();
                this.ctx.arc(0, -graveSize/2, graveSize/2, 0, Math.PI, true);
                this.ctx.fill();
                
                // Draw cross on tombstone
                this.ctx.strokeStyle = '#ffffff'; // White cross
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(0, -4);
                this.ctx.lineTo(0, 4);
                this.ctx.moveTo(-3, 0);
                this.ctx.lineTo(3, 0);
                this.ctx.stroke();
                
                // Add border
                this.ctx.strokeStyle = '#444444';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(-graveSize/2, -graveSize/2, graveSize, graveSize);
                
                this.ctx.restore();
            }
            
            this.ctx.restore();
        }
    }
    
    drawDebugInfo() {
        // Draw large timer at top right
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 36px Arial, sans-serif';
        this.ctx.textAlign = 'right';
        const elapsedSeconds = Math.floor(performance.now() / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.ctx.fillText(timeString, this.width - 20, 45);
        
        // Draw stats with more visible colors
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 12px Arial, sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Red Colony: ${this.ants.length}/${this.antCount}`, 10, 25);
        this.ctx.fillText(`Red Dead: ${this.deadAntCount}`, 10, 45);
        this.ctx.fillText(`Red Eggs: ${this.queenEggsLaid}`, 10, 65);
        this.ctx.fillText(`Blue Colony: ${this.ants2.length}/${this.antCount}`, 10, 85);
        this.ctx.fillText(`Blue Dead: ${this.deadAntCount2}`, 10, 105);
        this.ctx.fillText(`Blue Eggs: ${this.queenEggsLaid2}`, 10, 125);
        
        let totalFood = 0;
        for (let food of this.foodSources) {
            totalFood += food.amount;
        }
        this.ctx.fillText(`Total Food: ${Math.floor(totalFood)}`, 10, 145);
        this.ctx.fillText(`Red Nest: ${this.nest.foodStored}/${this.nest.maxCapacity} (${Math.round((this.nest.foodStored / this.nest.maxCapacity) * 100)}%)`, 10, 165);
        this.ctx.fillText(`Blue Nest: ${this.nest2.foodStored}/${this.nest2.maxCapacity} (${Math.round((this.nest2.foodStored / this.nest2.maxCapacity) * 100)}%)`, 10, 185);
        
        // Show ant positions for debugging - HIDDEN
        // if (this.ants.length > 0) {
        //     this.ctx.fillStyle = '#ffd700'; // Gold color for debug info
        //     this.ctx.font = 'bold 12px Arial, sans-serif';
        //     this.ctx.fillText(`First ant at: (${Math.floor(this.ants[0].position.x)}, ${Math.floor(this.ants[0].position.y)})`, 10, 125);
        //     this.ctx.fillText(`First ant velocity: ${this.ants[0].velocity.magnitude().toFixed(1)}`, 10, 145);
        //     this.ctx.fillText(`First ant has food: ${this.ants[0].hasFood}`, 10, 165);
        // }
        
        // Count ants near nest and in clusters (for internal use only)
        let antsNearNest = 0;
        let antsInClusters = 0;
        for (let ant of this.ants) {
            const distance = ant.position.subtract(new Vec(this.nest.x, this.nest.y)).magnitude();
            if (distance < 30) antsNearNest++;
            
            // Check for clustering (ants close to each other)
            let nearbyAnts = 0;
            for (let otherAnt of this.ants) {
                if (ant !== otherAnt) {
                    const antDistance = ant.position.subtract(otherAnt.position).magnitude();
                    if (antDistance < 20) nearbyAnts++;
                }
            }
            if (nearbyAnts > 3) antsInClusters++;
        }
        
        // Lifecycle statistics (for internal use only)
        if (this.ants.length > 0) {
            const avgAge = this.ants.reduce((sum, ant) => sum + ant.age, 0) / this.ants.length;
            const avgEnergy = this.ants.reduce((sum, ant) => sum + ant.energy, 0) / this.ants.length;
            // Removed display of avg age and energy
        }
        

    }
    
    start() {
        console.log('Starting ant foraging simulation...');
        console.log(`Initial ant positions:`, this.ants.map(ant => ({x: ant.x, y: ant.y, angle: ant.angle})));
        
        const animate = () => {
            this.update();
            this.draw();
            requestAnimationFrame(animate);
        };
        animate();
    }
}

// Obstacle class with blob-based collision detection
class Obstacle {
    constructor(x, y) {
        this.pos = new Vec(x, y);
        this.baseRadius = 30 + Math.random() * 30;
        this.blob = makeBlob(x, y, this.baseRadius, 0.2, 18);
    }
    
    randomize(w, h) {
        this.pos = new Vec(Math.random() * (w * 0.7) + w * 0.15, Math.random() * (h * 0.7) + h * 0.15);
        this.baseRadius = 30 + Math.random() * 30;
        this.blob = makeBlob(this.pos.x, this.pos.y, this.baseRadius, 0.2, 18);
    }
    
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = 'rgba(50, 50, 50, 0.95)';
        ctx.beginPath();
        const pts = this.blob;
        if (pts.length) {
            const mid = (a, b) => new Vec((a.x + b.x) / 2, (a.y + b.y) / 2);
            let prev = pts[pts.length - 1];
            let cur = pts[0];
            ctx.moveTo((prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
            for (let i = 0; i < pts.length; i++) {
                const next = pts[(i + 1) % pts.length];
                const c = pts[i];
                const m = mid(c, next);
                ctx.quadraticCurveTo(c.x, c.y, m.x, m.y);
            }
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
    
    repulse(pos) {
        if (!this.blob || this.blob.length === 0) {
            return { vec: new Vec(0, 0), dist: Infinity };
        }
        
        let minDist = Infinity;
        let closest = null;
        
        // Check distance to each edge of the blob
        for (let i = 0; i < this.blob.length; i++) {
            const a = this.blob[i];
            const b = this.blob[(i + 1) % this.blob.length];
            const cp = closestOnSeg(a, b, pos);
            const d = pos.subtract(cp).magnitude();
            if (d < minDist) {
                minDist = d;
                closest = cp;
            }
        }
        
        if (!closest) return { vec: new Vec(0, 0), dist: Infinity };
        
        const away = pos.subtract(closest);
        const mag = away.magnitude();
        
        if (mag < 0.1) {
            // If too close, pick a random direction away from center
            const centerAway = pos.subtract(this.pos);
            if (centerAway.magnitude() > 0.1) {
                return { vec: centerAway.normalize(), dist: 0 };
            } else {
                return { vec: Vec.random(), dist: 0 };
            }
        }
        
        return { vec: away.normalize(), dist: minDist };
    }
}

// Enhanced Food class with better visual representation
class Food {
    constructor(x, y) {
        this.pos = new Vec(x, y);
        this.amount = 500;
        this.radius = 20 + Math.random() * 10;
        this.originalAmount = this.amount;
    }
    
    randomize(w, h, avoid) {
        this.pos = new Vec(Math.random() * (w * 0.7) + w * 0.15, Math.random() * (h * 0.7) + h * 0.15);
        if (avoid && this.pos.subtract(avoid.pos).magnitude() < 120) {
            this.pos = new Vec(Math.random() * (w * 0.7) + w * 0.15, Math.random() * (h * 0.7) + h * 0.15);
        }
        this.amount = 500;
        this.radius = 20 + Math.random() * 10;
        this.originalAmount = this.amount;
    }
    
    containsAndTake(pos) {
        if (this.amount <= 0) return false;
        const d = pos.subtract(this.pos).magnitude();
        if (d < this.radius) {
            this.amount = Math.max(0, this.amount - 1);
            return true;
        }
        return false;
    }
    
    isDepleted() {
        return this.amount <= 0;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        
        const fraction = Math.max(0, Math.min(1, this.amount / this.originalAmount));
        
        // Draw food background (depleted area)
        ctx.fillStyle = 'rgba(160, 57, 57, 0.3)';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw food amount (filled area)
        if (fraction > 0) {
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + Math.PI * 2 * fraction;
            ctx.fillStyle = '#a03939';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, this.radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fill();
        }
        
        // Draw stem
        ctx.save();
        ctx.fillStyle = '#5a3d1b';
        ctx.fillRect(-2, -this.radius - 7, 4, 7);
        
        // Draw leaf
        ctx.fillStyle = '#4f7d4f';
        ctx.beginPath();
        ctx.ellipse(-this.radius * 0.25 - 1, -this.radius - 9, this.radius * 0.3, this.radius * 0.12, Math.PI / 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Draw amount text
        ctx.fillStyle = '#fff';
        ctx.font = '700 16px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.amount.toString(), 0, 0);
        
        ctx.restore();
    }
}

class Ant {
    constructor(x, y, simulation) {
        this.position = new Vec(x, y);
        this.velocity = Vec.random().multiply(2);
        this.simulation = simulation;
        this.hasFood = false;
        this.path = [];
        this.tripStartTime = performance.now();
        this.momentum = new Vec(0, 0);
        this.lastFoodTime = 0;
        this.targetFood = null;
        this.maxSpeed = 3.0;
        this.maxTurnRate = 0.3; // Radians per frame
        
        // Lifecycle properties
        this.birthTime = performance.now();
        this.age = 0; // Age in milliseconds
        this.lifespan = 300000 + (Math.random() - 0.5) * 120000; // 5 minutes ± 1 minute randomly
        this.isAlive = true;
        this.energy = 100; // Energy level (0-100)
        this.energyDecayRate = 0.02; // Much slower energy decay - changes visible after 4 minutes
        
        // Death properties
        this.deathTime = null;
        this.graveEffect = null;
        
        // Colony tracking
        this.colony = 1; // Default to first colony
    }
    
    update() {
        // Lifecycle update - check if ant is still alive
        this.age = performance.now() - this.birthTime;
        this.energy -= this.energyDecayRate;
        
        // Die from old age or exhaustion
        if (this.age > this.lifespan || this.energy <= 0) {
            if (this.isAlive) {
                this.isAlive = false;
                this.deathTime = performance.now();
                this.graveEffect = {
                    startTime: performance.now(),
                    duration: 10000, // 10 seconds
                    alpha: 1.0
                };
                // Increment dead ant counter for the appropriate colony
                if (this.colony === 1) {
                    this.simulation.deadAntCount++;
                    console.log(`Red ant died at age ${(this.age / 1000).toFixed(1)}s. Total red dead: ${this.simulation.deadAntCount}`);
                } else {
                    this.simulation.deadAntCount2++;
                    console.log(`Blue ant died at age ${(this.age / 1000).toFixed(1)}s. Total blue dead: ${this.simulation.deadAntCount2}`);
                }
            }
            return; // Stop updating dead ants
        }
        
        // Update grave effect
        if (this.graveEffect) {
            const elapsed = performance.now() - this.graveEffect.startTime;
            const progress = elapsed / this.graveEffect.duration;
            
            if (progress >= 1) {
                this.graveEffect = null; // Remove effect when done
            } else {
                this.graveEffect.alpha = 1.0 - progress;
            }
        }
        
        // Slow down when energy is low
        const energyFactor = Math.max(0.3, this.energy / 100);
        this.maxSpeed = 3.0 * energyFactor;
        
        let direction = new Vec(0, 0);
        
        if (this.hasFood) {
            // Returning to appropriate nest based on colony
            let targetNest = this.colony === 1 ? this.simulation.nest : this.simulation.nest2;
            const directToNest = new Vec(targetNest.x, targetNest.y).subtract(this.position).normalize();
            const homeGrad = this.simulation.getPheromoneGradient(this.position, 'home');
            const homeStrength = this.simulation.getPheromoneLevel(this.position, 'home');
            
            // Calculate distance to nest
            const nestDistance = this.position.subtract(new Vec(targetNest.x, targetNest.y)).magnitude();
            
            if (nestDistance < 100) {
                // Close to nest - more direct approach but still with some randomness
                const directBias = Math.min(0.8, (100 - nestDistance) / 100);
                direction = directToNest.multiply(directBias).add(Vec.random().multiply(1 - directBias));
                    } else {
                // Far from nest - use realistic home trail detection
                const homePheromoneInfo = this.simulation.getAntennaePheromoneDirection(this.position, 'home', this.velocity);
                
                if (homePheromoneInfo && homePheromoneInfo.strength > 0.5) {
                    // Follow home trail with strength-based attraction
                    const attractionStrength = Math.min(2, homePheromoneInfo.strength);
                    direction = homePheromoneInfo.direction.multiply(attractionStrength);
                    
                    // Blend with direct path to nest
                    direction = direction.add(directToNest.multiply(0.5));
                } else {
                    // No home trail - go directly toward nest with some randomness
                    direction = directToNest.multiply(0.7).add(Vec.random().multiply(0.3));
                }
            }
            
            // Clear momentum when returning to reduce circling
            this.momentum = this.momentum.multiply(0.3);
            
            // Deposit food trail with enhanced success tracking
            const tripDuration = performance.now() - this.tripStartTime;
            const efficiency = Math.max(1, 3 - tripDuration / 10000); // Faster trips get higher bonus
            const successBonus = efficiency * (1 + this.path.length * 0.01); // Longer paths get slightly more bonus
            this.simulation.addPheromone(this.position, 'food', 12, successBonus);
            
        } else {
            // Exploring - simplified realistic pheromone following
            let nearestFood = null;
            let nearestDist = Infinity;
            
            // Check for visible food first
            for (const f of this.simulation.foodSources) {
                if (!f.isDepleted()) {
                    const dist = this.position.subtract(f.pos).magnitude();
                    if (dist < nearestDist && dist < 200) { // Visual range
                        nearestDist = dist;
                        nearestFood = f;
                    }
                }
            }
            
            if (nearestFood) {
                // More natural approach to visible food
                const directToFood = nearestFood.pos.subtract(this.position).normalize();
                
                // Blend direct path with some randomness for more natural movement
                const directBias = Math.min(0.8, (200 - nearestDist) / 200); // Closer = more direct
                direction = directToFood.multiply(directBias).add(Vec.random().multiply(1 - directBias));
                
                // Add some urgency when very close, but not straight-line rushing
                if (nearestDist < 30) {
                    direction = direction.multiply(1.2);
                }
            } else {
                // Use realistic antennae-like pheromone detection
                const pheromoneInfo = this.simulation.getAntennaePheromoneDirection(this.position, 'food', this.velocity);
                
                if (pheromoneInfo && pheromoneInfo.strength > 0.5) {
                    // Follow pheromone trail with strength-based attraction
                    const attractionStrength = Math.min(3, pheromoneInfo.strength);
                    direction = pheromoneInfo.direction.multiply(attractionStrength);
                    
                    // Add some exploration randomness
                    direction = direction.add(Vec.random().multiply(0.3));
                } else {
                    // No pheromones detected - explore randomly
                    direction = Vec.random().multiply(1.0).add(this.momentum.multiply(0.4));
                }
            }
            
            // Deposit home trail with exploration bonus
            const explorationBonus = Math.min(2, this.path.length * 0.02); // Longer exploration gets bonus
            this.simulation.addPheromone(this.position, 'home', 6, 1 + explorationBonus);
        }
        
        // Obstacle avoidance - reduced radius for more realistic collision
        for (const obstacle of this.simulation.obstacles) {
            const rep = obstacle.repulse(this.position);
            if (rep.dist < 15) { // Reduced from 40 to 15 for closer approach
                const avoidForce = Math.max(1, 4 / (rep.dist + 0.1)); // Reduced force
                direction = direction.add(rep.vec.multiply(avoidForce));
            }
        }
        
        // Normalize direction
        if (direction.magnitude() > 0) {
            direction = direction.normalize();
        } else {
            direction = Vec.random();
        }
        
        // Apply momentum more selectively
        const momentumStrength = this.hasFood ? 0.2 : 0.5;
        this.momentum = this.momentum.multiply(0.7).add(direction.multiply(0.3));
        direction = direction.multiply(1 - momentumStrength).add(this.momentum.multiply(momentumStrength));
        direction = direction.normalize();
        
        // Smoother turning
        if (this.velocity.magnitude() > 0) {
            const currentDir = this.velocity.normalize();
            const maxTurn = this.hasFood ? 0.6 : 0.4;
            const dot = Math.max(-1, Math.min(1, currentDir.dot(direction)));
            const angle = Math.acos(dot);
            
            if (angle > maxTurn) {
                const t = maxTurn / angle;
                direction = currentDir.multiply(1-t).add(direction.multiply(t)).normalize();
            }
        }

        // Apply smooth velocity changes with momentum
        const targetSpeed = this.hasFood ? 2.5 : 3.0;
        const acceleration = 0.1;
        
        // Gradually adjust velocity toward target direction and speed
        const currentSpeed = this.velocity.magnitude();
        const speedDiff = targetSpeed - currentSpeed;
        const speedChange = Math.sign(speedDiff) * Math.min(Math.abs(speedDiff), acceleration);
        
        // Smoothly rotate toward target direction
        if (this.velocity.magnitude() > 0.1) {
            const currentAngle = this.velocity.angle();
            const targetAngle = direction.angle();
            let angleDiff = targetAngle - currentAngle;
            
            // Handle angle wrapping
            if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            // Limit turn rate
            const maxTurn = this.maxTurnRate;
            if (Math.abs(angleDiff) > maxTurn) {
                angleDiff = Math.sign(angleDiff) * maxTurn;
            }
            
            const newAngle = currentAngle + angleDiff;
            this.velocity = new Vec(Math.cos(newAngle), Math.sin(newAngle)).multiply(currentSpeed + speedChange);
        } else {
            // If velocity is too small, set it directly
            this.velocity = direction.multiply(targetSpeed);
        }
        
        // Limit maximum speed
        if (this.velocity.magnitude() > this.maxSpeed) {
            this.velocity = this.velocity.normalize().multiply(this.maxSpeed);
        }

        // Calculate new position
        let newPos = this.position.add(this.velocity);
        
        // Obstacle collision detection - allow closer approach before bouncing
        for (const obstacle of this.simulation.obstacles) {
            const rep = obstacle.repulse(newPos);
            if (rep.dist < 5) { // Reduced from 8 to 5 for closer collision
                // Bounce off obstacle with more realistic physics
                this.velocity = rep.vec.multiply(1.5); // Reduced bounce force
                newPos = this.position.add(this.velocity);
                break;
            }
        }
        
        // Improved boundary bouncing with energy loss
        const bounceDamping = 0.8;
        const margin = 10;
        
        if (newPos.x < margin) {
            newPos.x = margin;
            this.velocity.x = Math.abs(this.velocity.x) * bounceDamping;
            // Add slight randomness to prevent getting stuck
            this.velocity.y += (Math.random() - 0.5) * 0.5;
        }
        if (newPos.x > this.simulation.width - margin) {
            newPos.x = this.simulation.width - margin;
            this.velocity.x = -Math.abs(this.velocity.x) * bounceDamping;
            this.velocity.y += (Math.random() - 0.5) * 0.5;
        }
        if (newPos.y < margin) {
            newPos.y = margin;
            this.velocity.y = Math.abs(this.velocity.y) * bounceDamping;
            this.velocity.x += (Math.random() - 0.5) * 0.5;
        }
        if (newPos.y > this.simulation.height - margin) {
            newPos.y = this.simulation.height - margin;
            this.velocity.y = -Math.abs(this.velocity.y) * bounceDamping;
            this.velocity.x += (Math.random() - 0.5) * 0.5;
        }
        
        this.position = newPos;
        
        // Track path for reinforcement
        if (this.path.length === 0 || this.position.subtract(this.path[this.path.length-1]).magnitude() > 15) {
            this.path.push(this.position.clone());
            if (this.path.length > 100) this.path.shift();
        }

        // Enhanced food pickup with visual detection
        if (!this.hasFood) {
            let nearestFood = null;
            let nearestDist = Infinity;
            
            // Find nearest food within detection range
            for (const f of this.simulation.foodSources) {
                if (!f.isDepleted()) {
                    const dist = this.position.subtract(f.pos).magnitude();
                    if (dist < nearestDist && dist < 200) { // Increased detection range
                        nearestDist = dist;
                        nearestFood = f;
                    }
                }
            }
            
            // Try to collect food if close enough
            if (nearestFood && nearestFood.containsAndTake(this.position)) {
                this.hasFood = true;
                this.lastFoodTime = performance.now();
                this.targetFood = nearestFood;
                
                // Full energy restoration from finding food
                this.energy = 100; // Complete energy restoration
                
                // Set gentle momentum toward nest for natural return
                const nestDir = new Vec(this.simulation.nest.x, this.simulation.nest.y).subtract(this.position).normalize();
                this.momentum = nestDir.multiply(0.3);
                
                // Reinforce the path that led to food
                if (this.path.length > 3) {
                    this.simulation.pheromoneField.reinforcePath(this.path, 3);
                }
                
                // Clear path for return journey
                this.path = [];
                
                console.log(`Food found! Energy restored to 100%`);
            }
        } else {
            // Enhanced food delivery at appropriate nest based on colony
            let targetNest = this.colony === 1 ? this.simulation.nest : this.simulation.nest2;
            const nestDist = this.position.subtract(new Vec(targetNest.x, targetNest.y)).magnitude();
            if (nestDist < targetNest.radius + 5) {
                // Check if nest is full
                if (targetNest.foodStored >= targetNest.maxCapacity) {
                    targetNest.isFull = true;
                    // Ant drops food outside nest when full - waste food
                    this.hasFood = false;
                    this.path = [];
                    this.momentum = Vec.random().multiply(0.3);
                    this.tripStartTime = performance.now();
                    console.log(`${this.colony === 1 ? 'Red' : 'Blue'} nest is full! Food wasted.`);
                    return;
                }
                
                this.hasFood = false;
                
                // Calculate delivery efficiency
                const tripDuration = performance.now() - this.lastFoodTime;
                const pathLength = this.path.length;
                const distanceEfficiency = Math.max(0.5, 1 - (pathLength * 2) / 1000); // Shorter paths are better
                const timeEfficiency = Math.max(0.5, 1 - tripDuration / 30000); // Faster trips are better
                const overallEfficiency = (distanceEfficiency + timeEfficiency) / 2;
                
                // Update nest efficiency based on successful deliveries
                targetNest.efficiency = Math.min(2.0, 
                    targetNest.efficiency * 0.95 + overallEfficiency * 0.05);
                
                // Store food with efficiency bonus (but ensure we don't exceed capacity)
                const foodGained = Math.floor(1 + overallEfficiency);
                const newTotal = targetNest.foodStored + foodGained;
                
                if (newTotal >= targetNest.maxCapacity) {
                    // Nest would be full or exceeded - set to exact capacity and mark as full
                    targetNest.foodStored = targetNest.maxCapacity;
                    targetNest.isFull = true;
                    console.log(`${this.colony === 1 ? 'Red' : 'Blue'} nest is now full! All food collected: ${targetNest.foodStored}/${targetNest.maxCapacity}`);
                } else {
                    targetNest.foodStored = newTotal;
                }
                
                // Reinforce successful return path with efficiency-based strength
                if (this.path.length > 3) {
                    const reinforcementStrength = overallEfficiency * 6;
                    this.simulation.pheromoneField.reinforcePath(this.path, reinforcementStrength);
                }
                
                // Full energy restoration from successful food delivery
                this.energy = 100; // Complete energy restoration
                
                // Clear state for clean transition to exploring
                this.path = [];
                this.momentum = Vec.random().multiply(0.3);
                this.tripStartTime = performance.now();
                
                // Log successful delivery
                console.log(`${this.colony === 1 ? 'Red' : 'Blue'} ant delivered food! Efficiency: ${overallEfficiency.toFixed(2)}, Food gained: ${foodGained}, Energy restored to 100%`);
            }
        }
    }
    

}

// Initialize simulation when page loads
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('simulationCanvas');
    
    // Set canvas to full window size
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Create simulation after canvas is properly sized
    const simulation = new AntForagingSimulation(canvas);
    
    // Add keyboard controls
    window.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            simulation.initialize();
        }
        if (e.key === 'a' || e.key === 'A') {
            // Add more ants
            simulation.antCount += 10;
            simulation.updateAntCount();
        }
    });
    
    // Handle window resize by reinitializing simulation
    window.addEventListener('resize', () => {
        resizeCanvas();
        simulation.width = canvas.width;
        simulation.height = canvas.height;
        simulation.initialize();
    });
});
