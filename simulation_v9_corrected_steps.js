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
        console.log('AntForagingSimulation constructor called');
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.isRunning = false;
        this.needsApproval = true; // New: require approval before starting
        console.log('Canvas context created, dimensions:', this.width, 'x', this.height);
        
        // Simulation parameters
        this.antCount = 500;
        this.evaporationRate = 0.01; // Reduced from 0.05
        this.foodCount = 8; // Increased from 2
        
        // Simulation state
        this.ants = [];
        this.foodSources = [];
        this.obstacles = [];
        this.pheromoneField = new PheromoneField(this.width, this.height, 6);
        this.pheromoneField2 = new PheromoneField(this.width, this.height, 6); // Second colony pheromones
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
        
        // Nest placement preset
        this.nestPreset = 'opposite'; // 'opposite', 'side_by_side', 'far_apart', 'random'
        
        // Color customization - load from localStorage or use defaults
        const savedColors = loadDefaultColors();
        this.orangeNestColor = savedColors.orangeNest || '#a67c52';
        this.orangeAntColor = savedColors.orangeAnt || '#a67c52';
        this.greenNestColor = savedColors.greenNest || '#4a664a';
        this.greenAntColor = savedColors.greenAnt || '#4a664a';
        
        // Signal strength colors
        this.orangeMinSignal = savedColors.orangeMin || '#8b6b47';
        this.orangeMaxSignal = savedColors.orangeMax || '#ff8c00';
        this.greenMinSignal = savedColors.greenMin || '#3d553d';
        this.greenMaxSignal = savedColors.greenMax || '#32cd32';
        
        // Helper method to get direct path between two points
        this.getDirectPath = (from, to) => {
            const path = [];
            const distance = from.subtract(to).magnitude();
            const steps = Math.ceil(distance / 50); // Check every 50 pixels
            
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const x = from.x + (to.x - from.x) * t;
                const y = from.y + (to.y - from.y) * t;
                path.push(new Vec(x, y));
            }
            
            return path;
        };
        
        // Helper method to validate food position
        this.isValidFoodPosition = (food) => {
            // Check bounds
            if (food.pos.x < food.radius || food.pos.x > this.width - food.radius ||
                food.pos.y < food.radius || food.pos.y > this.height - food.radius) {
                return false;
            }
            
            // Don't place too close to either nest
            if (food.pos.subtract(new Vec(this.nest.x, this.nest.y)).magnitude() < food.radius + this.nest.radius + 100 ||
                food.pos.subtract(new Vec(this.nest2.x, this.nest2.y)).magnitude() < food.radius + this.nest2.radius + 100) {
                return false;
            }
            
            // Don't place too close to other food
            for (const existingFood of this.foodSources) {
                if (food.pos.subtract(existingFood.pos).magnitude() < food.radius + existingFood.radius + 50) {
                    return false;
                }
            }
            
            return true;
        };
        
        // Helper method to validate obstacle position
        this.isValidObstaclePosition = (obstacle) => {
            // Don't place too close to either nest
            if (obstacle.pos.subtract(new Vec(this.nest.x, this.nest.y)).magnitude() < obstacle.baseRadius + this.nest.radius + 100 ||
                obstacle.pos.subtract(new Vec(this.nest2.x, this.nest2.y)).magnitude() < obstacle.baseRadius + this.nest2.radius + 100) {
                return false;
            }
            
            // Don't place too close to food sources (increased distance)
            for (const food of this.foodSources) {
                if (obstacle.pos.subtract(food.pos).magnitude() < obstacle.baseRadius + food.radius + 80) {
                    return false;
                }
            }
            
            // Don't place too close to existing obstacles
            for (const existingObstacle of this.obstacles) {
                if (obstacle.pos.subtract(existingObstacle.pos).magnitude() < obstacle.baseRadius + existingObstacle.baseRadius + 30) {
                    return false;
                }
            }
            
            return true;
        };
        
        // Helper method to place obstacle between two points
        this.placeObstacleBetweenPoints = (point1, point2) => {
            // Calculate midpoint between the two points
            const midX = (point1.x + point2.x) / 2;
            const midY = (point1.y + point2.y) / 2;
            
            // Add some randomness to the obstacle position (±20px)
            const offsetX = (Math.random() - 0.5) * 40;
            const offsetY = (Math.random() - 0.5) * 40;
            
            const obstacle = new Obstacle(midX + offsetX, midY + offsetY);
            
            // Validate the position
            if (this.isValidObstaclePosition(obstacle)) {
                this.obstacles.push(obstacle);
            }
        };
        
        console.log('About to initialize simulation...');
        this.initialize();
        console.log('Simulation initialized');

        this.start();
    }
    
    initialize() {
        // Initialize pheromone fields for both colonies
        this.pheromoneField = new PheromoneField(this.width, this.height, 6);
        this.pheromoneField2 = new PheromoneField(this.width, this.height, 6);
        
        // Place nests according to preset
        const nestMargin = 100;
        
        switch(this.nestPreset) {
            case 'side_by_side':
                // Both nests side by side near center
                this.nest.x = this.width * 0.35 + Math.random() * (this.width * 0.1);
                this.nest.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
                this.nest2.x = this.width * 0.55 + Math.random() * (this.width * 0.1);
                this.nest2.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
                break;
                
            case 'far_apart':
                // Nests far apart (opposite corners)
                this.nest.x = nestMargin + Math.random() * (this.width * 0.2);
                this.nest.y = nestMargin + Math.random() * (this.height * 0.2);
                this.nest2.x = this.width - nestMargin - Math.random() * (this.width * 0.2);
                this.nest2.y = this.height - nestMargin - Math.random() * (this.height * 0.2);
                break;
                
            case 'random':
                // Random placement
                this.nest.x = nestMargin + Math.random() * (this.width - 2 * nestMargin);
                this.nest.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
                this.nest2.x = nestMargin + Math.random() * (this.width - 2 * nestMargin);
                this.nest2.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
                break;
                
            default: // 'opposite'
                // Nests on opposite sides
                this.nest.x = nestMargin + Math.random() * (this.width * 0.3 - nestMargin);
                this.nest.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
                this.nest2.x = this.width - nestMargin - Math.random() * (this.width * 0.3 - nestMargin);
                this.nest2.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
                break;
        }
        
        // Ensure nests don't overlap with each other
        const nestDistance = Math.sqrt((this.nest.x - this.nest2.x) ** 2 + (this.nest.y - this.nest2.y) ** 2);
        if (nestDistance < this.nest.radius + this.nest2.radius + 50) {
            console.log('Nests too close, adjusting positions...');
            // Move nests further apart
            const angle = Math.atan2(this.nest2.y - this.nest.y, this.nest2.x - this.nest.x);
            const minDistance = this.nest.radius + this.nest2.radius + 100;
            
            this.nest2.x = this.nest.x + Math.cos(angle) * minDistance;
            this.nest2.y = this.nest.y + Math.sin(angle) * minDistance;
            
            // Keep within bounds
            this.nest2.x = Math.max(nestMargin, Math.min(this.width - nestMargin, this.nest2.x));
            this.nest2.y = Math.max(nestMargin, Math.min(this.height - nestMargin, this.nest2.y));
        }
        
        // Place food in the middle area between nests
        const foodSide = 'middle';
        
        console.log(`Nest placed at (${this.nest.x.toFixed(0)}, ${this.nest.y.toFixed(0)}) - Food will be placed on ${foodSide} side`);
        
        // Initialize empty arrays for step-by-step placement
        this.foodSources = [];
        this.obstacles = [];
        
        // Store placement parameters for step-by-step approval
        this.baseDistance = Math.min(this.width, this.height) * 0.4; // 40% of smaller canvas dimension
        this.placementAngles = [];
        
        // Pre-calculate angles for all 4 pairs
        for (let pair = 0; pair < 4; pair++) {
            const angle1 = (pair * Math.PI / 2) + (Math.random() - 0.5) * 0.5; // 90° apart with variation
            const angle2 = angle1 + Math.PI + (Math.random() - 0.5) * 0.5; // Opposite side
            this.placementAngles.push({ angle1, angle2 });
        }
        
        // Calculate nest capacity based on total food available
        let totalFoodAvailable = 0;
        for (const food of this.foodSources) {
            totalFoodAvailable += food.originalAmount;
        }
        this.nest.maxCapacity = totalFoodAvailable;
        this.nest2.maxCapacity = totalFoodAvailable;
        console.log(`Both nests capacity set to ${totalFoodAvailable} (total food available)`);
        
        // Add additional random obstacles to fill the space (if needed)
        const remainingObstacles = 15 - this.obstacles.length;
        for (let i = 0; i < remainingObstacles; i++) {
            let obstacle;
            let attempts = 0;
            do {
                obstacle = new Obstacle(Math.random() * this.width, Math.random() * this.height);
                
                // Place obstacles in the middle area between both nests
                obstacle.pos.x = this.width * 0.3 + Math.random() * (this.width * 0.4);
                obstacle.pos.y = 50 + Math.random() * (this.height - 100);
                
                obstacle.randomize(this.width, this.height);
                attempts++;
                
                if (this.isValidObstaclePosition(obstacle)) break;
            } while (attempts < 100);
            
            if (attempts < 100) {
                this.obstacles.push(obstacle);
            }
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
        console.log(`Created ${this.ants.length} orange ants around nest position (${this.nest.x}, ${this.nest.y})`);
        
        // Create ants for second colony (green)
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
        console.log(`Created ${this.ants2.length} green ants around nest2 position (${this.nest2.x}, ${this.nest2.y})`);
        
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
        
        console.log(`Initialized simulation with ${this.ants.length} orange ants and ${this.ants2.length} green ants`);
        console.log(`Canvas size: ${this.width} x ${this.height}`);
        console.log(`Orange nest position: (${this.nest.x}, ${this.nest.y})`);
        console.log(`Green nest position: (${this.nest2.x}, ${this.nest2.y})`);
        if (this.ants.length > 0) {
            console.log(`First orange ant position: (${this.ants[0].position.x}, ${this.ants[0].position.y})`);
        }
        if (this.ants2.length > 0) {
            console.log(`First green ant position: (${this.ants2[0].position.x}, ${this.ants2[0].position.y})`);
        }
        
        // Set approval state - user must approve before simulation starts
        this.needsApproval = true;
        this.isRunning = false;
        this.approvalStep = 0; // Track current step: 0=nests, 1-4=apple+obstacle pairs, 5=complete
        this.currentPair = 0; // Track current apple+obstacle pair
        console.log('Placement ready for step-by-step approval - waiting for user input');
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
    
    addPheromone(pos, type, strength, successBonus = 1, colony = 1) {
        const field = colony === 1 ? this.pheromoneField : this.pheromoneField2;
        field.deposit(pos, type, strength, successBonus);
    }
    
    getPheromoneLevel(pos, type, colony = 1) {
        const field = colony === 1 ? this.pheromoneField : this.pheromoneField2;
        return field.sample(pos, type);
    }
    
    getPheromoneGradient(pos, type, colony = 1) {
        const field = colony === 1 ? this.pheromoneField : this.pheromoneField2;
        return field.gradient(pos, type);
    }
    
    // New realistic antennae-like pheromone detection
    getAntennaePheromoneDirection(pos, type, antVelocity = null, colony = 1) {
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
            
            const strength = this.getPheromoneLevel(samplePos, type, colony);
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
            console.log(`EMERGENCY: Orange Queen laid ${emergencySpawn} eggs! Population: ${this.ants.length}/${targetPopulation}`);
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
                        console.log(`Orange Queen laid ${antsToSpawn} eggs. Total laid: ${this.queenEggsLaid}. Population: ${this.ants.length}/${targetPopulation}`);
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
            console.log(`EMERGENCY: Green Queen laid ${emergencySpawn} eggs! Population: ${this.ants2.length}/${targetPopulation}`);
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
                    console.log(`Green Queen laid ${antsToSpawn} eggs. Total laid: ${this.queenEggsLaid2}. Population: ${this.ants2.length}/${targetPopulation}`);
                }
            }
        }
    }
    
    evaporatePheromones() {
        this.pheromoneField.evaporate(this.evaporationRate);
        this.pheromoneField2.evaporate(this.evaporationRate);
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
                console.log(`Frame ${this.frameCount}: First orange ant at (${Math.floor(this.ants[0].position.x)}, ${Math.floor(this.ants[0].position.y)})`);
            }
            if (this.ants2.length > 0) {
                console.log(`Frame ${this.frameCount}: First green ant at (${Math.floor(this.ants2[0].position.x)}, ${Math.floor(this.ants2[0].position.y)})`);
            }
        }
    }
    
    draw() {
        // Clear canvas with dark background
        this.ctx.fillStyle = '#202020';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // If approval is needed, show approval screen
        if (this.needsApproval) {
            this.drawApprovalScreen();
            return;
        }
        
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
    
    drawApprovalScreen() {
        // Draw the current placement (without ants)
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
        
        // Draw approval panel (much smaller and positioned in corner)
        const panelWidth = 300;
        const panelHeight = 200;
        const panelX = this.width - panelWidth - 10; // Right side, closer to edge
        const panelY = 10; // Top, closer to edge
        
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        this.ctx.strokeStyle = '#ffa500';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
        
        // Draw title
        this.ctx.fillStyle = '#ffa500';
        this.ctx.font = 'bold 18px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Strategic Placement - Step by Step', this.width / 2, panelY + 30);
        
        // Draw step info
        this.ctx.fillStyle = 'white';
        this.ctx.font = '14px Arial, sans-serif';
        
        if (this.approvalStep === 0) {
            this.ctx.fillText('STEP 0: Two nests placed on opposite sides.', this.width / 2, panelY + 60);
            this.ctx.fillText('Orange (Colony 1) and Green (Colony 2).', this.width / 2, panelY + 80);
            this.ctx.fillText('Click "Next Step" to place first apple + obstacle.', this.width / 2, panelY + 100);
        } else if (this.approvalStep >= 1 && this.approvalStep <= 4) {
            this.ctx.fillText(`STEP ${this.approvalStep}: Apple + Obstacle Pair ${this.approvalStep}/4`, this.width / 2, panelY + 60);
            this.ctx.fillText('1 red apple (Colony 1) + 1 green apple (Colony 2).', this.width / 2, panelY + 80);
            this.ctx.fillText('1 gray obstacle blocking each path. Approve or Reject?', this.width / 2, panelY + 100);
        } else if (this.approvalStep === 5) {
            this.ctx.fillText('Complete! All 4 apple + obstacle pairs placed.', this.width / 2, panelY + 60);
            this.ctx.fillText('8 food sources and 8 obstacles total.', this.width / 2, panelY + 80);
            this.ctx.fillText('Ready to start simulation with ants!', this.width / 2, panelY + 100);
        }
        
        // Draw stats
        this.ctx.fillStyle = '#ffa500';
        this.ctx.font = 'bold 16px Arial, sans-serif';
        this.ctx.fillText(`Food: ${this.foodSources.length} | Obstacles: ${this.obstacles.length}`, this.width / 2, panelY + 130);
        
        // Draw buttons based on step
        const buttonWidth = 100;
        const buttonHeight = 35;
        const buttonY = panelY + panelHeight - 50;
        
        if (this.approvalStep === 0) {
            // Only Next Step button
            const nextX = this.width / 2 - buttonWidth / 2;
            this.ctx.fillStyle = '#2196F3';
            this.ctx.fillRect(nextX, buttonY, buttonWidth, buttonHeight);
            this.ctx.strokeStyle = '#1976D2';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(nextX, buttonY, buttonWidth, buttonHeight);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 14px Arial, sans-serif';
            this.ctx.fillText('NEXT STEP', nextX + buttonWidth / 2, buttonY + 24);
            this.nextButton = { x: nextX, y: buttonY, width: buttonWidth, height: buttonHeight };
            this.approveButton = null;
            this.rejectButton = null;
        } else if (this.approvalStep === 5) {
            // Only Start Simulation button
            const startX = this.width / 2 - buttonWidth / 2;
            this.ctx.fillStyle = '#4CAF50';
            this.ctx.fillRect(startX, buttonY, buttonWidth, buttonHeight);
            this.ctx.strokeStyle = '#45a049';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(startX, buttonY, buttonWidth, buttonHeight);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 12px Arial, sans-serif';
            this.ctx.fillText('START SIMULATION', startX + buttonWidth / 2, buttonY + 24);
            this.startButton = { x: startX, y: buttonY, width: buttonWidth, height: buttonHeight };
            this.approveButton = null;
            this.rejectButton = null;
        } else {
            // Approve and Reject buttons
            const approveX = this.width / 2 - buttonWidth - 20;
            this.ctx.fillStyle = '#4CAF50';
            this.ctx.fillRect(approveX, buttonY, buttonWidth, buttonHeight);
            this.ctx.strokeStyle = '#45a049';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(approveX, buttonY, buttonWidth, buttonHeight);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 14px Arial, sans-serif';
            this.ctx.fillText('APPROVE', approveX + buttonWidth / 2, buttonY + 24);
            
            const rejectX = this.width / 2 + 20;
            this.ctx.fillStyle = '#f44336';
            this.ctx.fillRect(rejectX, buttonY, buttonWidth, buttonHeight);
            this.ctx.strokeStyle = '#da190b';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(rejectX, buttonY, buttonWidth, buttonHeight);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 14px Arial, sans-serif';
            this.ctx.fillText('REJECT', rejectX + buttonWidth / 2, buttonY + 24);
            
            this.approveButton = { x: approveX, y: buttonY, width: buttonWidth, height: buttonHeight };
            this.rejectButton = { x: rejectX, y: buttonY, width: buttonWidth, height: buttonHeight };
            this.nextButton = null;
            this.startButton = null;
        }
        
        // Reset text alignment
        this.ctx.textAlign = 'left';
    }
    
    // Step-by-step placement methods
    placeNextAppleObstaclePair() {
        if (this.currentPair >= 4) return;
        
        const distance = this.baseDistance + (Math.random() - 0.5) * 50; // ±25px variation
        const angles = this.placementAngles[this.currentPair];
        
        // Place food for colony 1 (red apple)
        const food1 = new Food(0, 0);
        food1.pos.x = this.nest.x + Math.cos(angles.angle1) * distance;
        food1.pos.y = this.nest.y + Math.sin(angles.angle1) * distance;
        
        // Place food for colony 2 (green apple)
        const food2 = new Food(0, 0);
        food2.pos.x = this.nest2.x + Math.cos(angles.angle2) * distance;
        food2.pos.y = this.nest2.y + Math.sin(angles.angle2) * distance;
        
        // Validate food positions
        let food1Valid = this.isValidFoodPosition(food1);
        let food2Valid = this.isValidFoodPosition(food2);
        
        if (food1Valid && food2Valid) {
            this.foodSources.push(food1);
            this.foodSources.push(food2);
            
            // Immediately place obstacles for this pair
            this.placeObstacleBetweenPoints(food1.pos, new Vec(this.nest.x, this.nest.y));
            this.placeObstacleBetweenPoints(food2.pos, new Vec(this.nest2.x, this.nest2.y));
        }
    }
    
    nextApprovalStep() {
        if (this.approvalStep === 0) {
            // Step 0: Place first apple + obstacle pair
            this.placeNextAppleObstaclePair();
            this.approvalStep = 1;
        } else if (this.approvalStep >= 1 && this.approvalStep <= 4) {
            // Steps 1-4: Place next apple + obstacle pair
            this.currentPair++;
            if (this.currentPair < 4) {
                this.placeNextAppleObstaclePair();
                this.approvalStep++;
            } else {
                this.approvalStep = 5; // Complete
            }
        }
    }
    

    
    drawPheromones() {
        const cell = this.pheromoneField.cell;
        
        // Draw first colony pheromones (orange)
        for (let x = 0; x < this.pheromoneField.gridW; x++) {
            for (let y = 0; y < this.pheromoneField.gridH; y++) {
                const homeStr = this.pheromoneField.home[x][y];
                const foodStr = this.pheromoneField.food[x][y];
                const success = this.pheromoneField.pathSuccess[x][y];
                
                // Draw home trails (dark grey for exploring ants)
                if (homeStr > 2) {
                    const alpha = Math.min(0.6, homeStr / 100);
                    const intensity = Math.min(255, 68 + success * 2);
                    this.ctx.fillStyle = `rgba(64, 64, 64, ${alpha})`; // Dark grey for exploring trails
                    this.ctx.fillRect(x * cell, y * cell, cell, cell);
                }
                
                // Draw food trails (orange for returning ants) - interpolate between min and max colors
                if (foodStr > 2) {
                    const alpha = Math.min(1.0, (foodStr + success) / 80);
                    const strength = Math.min(1.0, (foodStr + success) / 200);
                    
                    // Apply non-linear mapping for better distribution
                    const mappedStrength = Math.pow(strength, 0.7); // More gradual transition
                    
                    // Interpolate between min and max signal colors
                    const minColor = hexToRgb(this.orangeMinSignal || '#8b6b47');
                    const maxColor = hexToRgb(this.orangeMaxSignal || '#ff8c00');
                    
                    const r = Math.floor(minColor.r + (maxColor.r - minColor.r) * mappedStrength);
                    const g = Math.floor(minColor.g + (maxColor.g - minColor.g) * mappedStrength);
                    const b = Math.floor(minColor.b + (maxColor.b - minColor.b) * mappedStrength);
                    
                    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                    this.ctx.fillRect(x * cell, y * cell, cell, cell);
                }
            }
        }
        
        // Draw second colony pheromones (green)
        for (let x = 0; x < this.pheromoneField2.gridW; x++) {
            for (let y = 0; y < this.pheromoneField2.gridH; y++) {
                const homeStr = this.pheromoneField2.home[x][y];
                const foodStr = this.pheromoneField2.food[x][y];
                const success = this.pheromoneField2.pathSuccess[x][y];
                
                // Draw home trails (dark grey for exploring ants)
                if (homeStr > 2) {
                    const alpha = Math.min(0.6, homeStr / 100);
                    const intensity = Math.min(255, 68 + success * 2);
                    this.ctx.fillStyle = `rgba(64, 64, 64, ${alpha})`; // Dark grey for exploring trails
                    this.ctx.fillRect(x * cell, y * cell, cell, cell);
                }
                
                // Draw food trails (green for returning ants) - interpolate between min and max colors
                if (foodStr > 2) {
                    const alpha = Math.min(1.0, (foodStr + success) / 80);
                    const strength = Math.min(1.0, (foodStr + success) / 200);
                    
                    // Apply non-linear mapping for better distribution
                    const mappedStrength = Math.pow(strength, 0.7); // More gradual transition
                    
                    // Interpolate between min and max signal colors
                    const minColor = hexToRgb(this.greenMinSignal || '#3d553d');
                    const maxColor = hexToRgb(this.greenMaxSignal || '#32cd32');
                    
                    const r = Math.floor(minColor.r + (maxColor.r - minColor.r) * mappedStrength);
                    const g = Math.floor(minColor.g + (maxColor.g - minColor.g) * mappedStrength);
                    const b = Math.floor(minColor.b + (maxColor.b - minColor.b) * mappedStrength);
                    
                    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
        
        // Draw house body (orange colony)
        this.ctx.fillStyle = this.orangeNestColor; // Customizable orange nest color
        this.ctx.fillRect(-30, -20, 60, 40);
        
        // Draw roof
        this.ctx.beginPath();
        this.ctx.moveTo(-35, -20);
        this.ctx.lineTo(0, -45);
        this.ctx.lineTo(35, -20);
        this.ctx.closePath();
        this.ctx.fillStyle = this.orangeNestColor; // Customizable orange nest color
        this.ctx.fill();
        
        // Draw door
        this.ctx.fillStyle = this.orangeNestColor; // Customizable orange nest color
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
        
        // Draw house body (green colony)
        this.ctx.fillStyle = this.greenNestColor; // Customizable green nest color
        this.ctx.fillRect(-30, -20, 60, 40);
        
        // Draw roof
        this.ctx.beginPath();
        this.ctx.moveTo(-35, -20);
        this.ctx.lineTo(0, -45);
        this.ctx.lineTo(35, -20);
        this.ctx.closePath();
        this.ctx.fillStyle = this.greenNestColor; // Customizable green nest color
        this.ctx.fill();
        
        // Draw door
        this.ctx.fillStyle = this.greenNestColor; // Customizable green nest color
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
            
            // Color based on food status and energy level (orange colony)
            let baseColor = ant.hasFood ? this.orangeAntColor : this.orangeNestColor; // Customizable orange ant colors
            
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
            
            // Color based on food status and energy level (green colony)
            let baseColor = ant.hasFood ? this.greenAntColor : this.greenNestColor; // Customizable green ant colors
            
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
        // Draw competition scoreboard at top
        const totalFoodCollected = this.nest.foodStored + this.nest2.foodStored;
        const orangeShare = totalFoodCollected > 0 ? this.nest.foodStored / totalFoodCollected : 0.5;
        const greenShare = totalFoodCollected > 0 ? this.nest2.foodStored / totalFoodCollected : 0.5;
        
        // Scoreboard background
        const scoreboardWidth = 400;
        const scoreboardHeight = 35;
        const scoreboardX = (this.width - scoreboardWidth) / 2;
        const scoreboardY = 20;
        
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(scoreboardX, scoreboardY, scoreboardWidth, scoreboardHeight);
        
        // Orange colony bar
        const orangeWidth = scoreboardWidth * orangeShare;
        this.ctx.fillStyle = this.orangeNestColor;
        this.ctx.fillRect(scoreboardX, scoreboardY, orangeWidth, scoreboardHeight);
        
        // Green colony bar
        const greenWidth = scoreboardWidth * greenShare;
        this.ctx.fillStyle = this.greenNestColor;
        this.ctx.fillRect(scoreboardX + orangeWidth, scoreboardY, greenWidth, scoreboardHeight);
        
        // Scoreboard text - numbers at bottom and ends
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 18px Arial, sans-serif';
        
        // Numbers at left and right ends
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${this.nest.foodStored}`, scoreboardX + 10, scoreboardY + 25);
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`${this.nest2.foodStored}`, scoreboardX + scoreboardWidth - 10, scoreboardY + 25);
        
        // Draw large timer at top right
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 36px Arial, sans-serif';
        this.ctx.textAlign = 'right';
        const elapsedSeconds = Math.floor(performance.now() / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.ctx.fillText(timeString, this.width - 20, 45);
        
        // Draw reset button under timer
        this.ctx.fillStyle = '#ffa500';
        this.ctx.fillRect(this.width - 80, 55, 60, 25);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 12px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('RESET', this.width - 50, 72);
        this.ctx.fillStyle = '#ffa500';
        this.ctx.fillRect(this.width - 80, 55, 60, 25);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 12px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('RESET', this.width - 50, 72);
        
        // Draw stats with more visible colors
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 12px Arial, sans-serif';
        this.ctx.textAlign = 'left';
        // Matrix-style stats display
        this.ctx.font = 'bold 14px Arial, sans-serif';
        
        // Headers
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText('Orange', 120, 25);
        this.ctx.fillText('Green', 200, 25);
        
        // Row labels
        this.ctx.fillText('Colony', 10, 45);
        this.ctx.fillText('Dead', 10, 65);
        this.ctx.fillText('Eggs', 10, 85);
        
        // Orange colony data
        this.ctx.fillStyle = this.orangeNestColor;
        this.ctx.fillText(`${this.ants.length}`, 120, 45);
        this.ctx.fillText(`${this.deadAntCount}`, 120, 65);
        this.ctx.fillText(`${this.queenEggsLaid}`, 120, 85);
        
        // Green colony data
        this.ctx.fillStyle = this.greenNestColor;
        this.ctx.fillText(`${this.ants2.length}`, 200, 45);
        this.ctx.fillText(`${this.deadAntCount2}`, 200, 65);
        this.ctx.fillText(`${this.queenEggsLaid2}`, 200, 85);
        
        // Instructions at bottom left
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 12px Arial, sans-serif';
        this.ctx.fillText('Controls: R=Reset, 1=Opposite, 2=Side by Side, 3=Far Apart, 4=Random', 10, this.height - 20);
        
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
        console.log('Ants array length:', this.ants ? this.ants.length : 'undefined');
        if (this.ants && this.ants.length > 0) {
            console.log(`Initial ant positions:`, this.ants.map(ant => ({x: ant.position.x, y: ant.position.y})));
        }
        
        const animate = () => {
            try {
                this.update();
                this.draw();
                requestAnimationFrame(animate);
            } catch (error) {
                console.error('Animation error:', error);
            }
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
                    console.log(`Orange ant died at age ${(this.age / 1000).toFixed(1)}s. Total orange dead: ${this.simulation.deadAntCount}`);
                } else {
                    this.simulation.deadAntCount2++;
                    console.log(`Green ant died at age ${(this.age / 1000).toFixed(1)}s. Total green dead: ${this.simulation.deadAntCount2}`);
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
            this.simulation.addPheromone(this.position, 'food', 12, successBonus, this.colony);
            
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
                const pheromoneInfo = this.simulation.getAntennaePheromoneDirection(this.position, 'food', this.velocity, this.colony);
                
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
            this.simulation.addPheromone(this.position, 'home', 6, 1 + explorationBonus, this.colony);
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
                    const field = this.colony === 1 ? this.simulation.pheromoneField : this.simulation.pheromoneField2;
                    field.reinforcePath(this.path, 3);
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
                    console.log(`${this.colony === 1 ? 'Orange' : 'Green'} nest is full! Food wasted.`);
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
                    console.log(`${this.colony === 1 ? 'Orange' : 'Green'} nest is now full! All food collected: ${targetNest.foodStored}/${targetNest.maxCapacity}`);
                } else {
                    targetNest.foodStored = newTotal;
                }
                
                // Reinforce successful return path with efficiency-based strength
                if (this.path.length > 3) {
                    const reinforcementStrength = overallEfficiency * 6;
                    const field = this.colony === 1 ? this.simulation.pheromoneField : this.simulation.pheromoneField2;
                    field.reinforcePath(this.path, reinforcementStrength);
                }
                
                // Full energy restoration from successful food delivery
                this.energy = 100; // Complete energy restoration
                
                // Clear state for clean transition to exploring
                this.path = [];
                this.momentum = Vec.random().multiply(0.3);
                this.tripStartTime = performance.now();
                
                // Log successful delivery
                console.log(`${this.colony === 1 ? 'Orange' : 'Green'} ant delivered food! Efficiency: ${overallEfficiency.toFixed(2)}, Food gained: ${foodGained}, Energy restored to 100%`);
            }
        }
    }
    
    // Helper method to get direct path between two points
    getDirectPath(from, to) {
        const path = [];
        const distance = from.subtract(to).magnitude();
        const steps = Math.ceil(distance / 50); // Check every 50 pixels
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from.x + (to.x - from.x) * t;
            const y = from.y + (to.y - from.y) * t;
            path.push(new Vec(x, y));
        }
        
        return path;
    }
    
    // Helper method to place obstacles along a path
    placeObstaclesAlongPath(path, count) {
        for (let i = 0; i < count; i++) {
            // Choose a random point along the path (but not at the endpoints)
            const index = Math.floor(1 + Math.random() * (path.length - 2));
            const pathPoint = path[index];
            
            // Add some randomness to the obstacle position
            const offsetX = (Math.random() - 0.5) * 40;
            const offsetY = (Math.random() - 0.5) * 40;
            
            const obstacle = new Obstacle(pathPoint.x + offsetX, pathPoint.y + offsetY);
            
            // Check if this position is valid
            let valid = true;
            
            // Don't place too close to nests
            if (obstacle.pos.subtract(new Vec(this.nest.x, this.nest.y)).magnitude() < obstacle.baseRadius + 80 ||
                obstacle.pos.subtract(new Vec(this.nest2.x, this.nest2.y)).magnitude() < obstacle.baseRadius + 80) {
                valid = false;
            }
            
            // Don't place too close to existing obstacles
            for (const existingObstacle of this.obstacles) {
                if (obstacle.pos.subtract(existingObstacle.pos).magnitude() < obstacle.baseRadius + existingObstacle.baseRadius + 20) {
                    valid = false;
                    break;
                }
            }
            
            if (valid) {
                this.obstacles.push(obstacle);
            }
        }
    }
}

// Load default colors from localStorage (standalone function)
function loadDefaultColors() {
    try {
        const saved = localStorage.getItem('antSimulationColors');
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        console.log('Could not load saved colors, using defaults');
        return {};
    }
}

// Save current colors as defaults (standalone function)
function saveDefaultColors(simulation) {
    try {
        const colors = {
            orangeNest: simulation.orangeNestColor,
            orangeAnt: simulation.orangeAntColor,
            greenNest: simulation.greenNestColor,
            greenAnt: simulation.greenAntColor,
            orangeMin: simulation.orangeMinSignal,
            orangeMax: simulation.orangeMaxSignal,
            greenMin: simulation.greenMinSignal,
            greenMax: simulation.greenMaxSignal
        };
        localStorage.setItem('antSimulationColors', JSON.stringify(colors));
        console.log('Colors saved as defaults');
    } catch (e) {
        console.log('Could not save colors');
    }
}

// Helper function to convert hex color to RGB (standalone)
function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') {
        return {r: 0, g: 0, b: 0};
    }
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : {r: 0, g: 0, b: 0};
}

// Initialize simulation when page loads
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('simulationCanvas');
    
    // Set canvas to full window size
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        console.log('Canvas resized to:', canvas.width, 'x', canvas.height);
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Create simulation after canvas is properly sized
    console.log('Creating simulation...');
    const simulation = new AntForagingSimulation(canvas);
    console.log('Simulation created successfully');
    
    // Add keyboard controls
    window.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            simulation.initialize();
        }
        if (e.key === 'a' || e.key === 'A') {
            // Add more ants
            simulation.antCount += 10;
        }
        if (e.key === '1') {
            // Switch to opposite sides preset
            simulation.nestPreset = 'opposite';
            simulation.initialize();
        }
        if (e.key === '2') {
            // Switch to side by side preset
            simulation.nestPreset = 'side_by_side';
            simulation.initialize();
        }
        if (e.key === '3') {
            // Switch to far apart preset
            simulation.nestPreset = 'far_apart';
            simulation.initialize();
        }
        if (e.key === '4') {
            // Switch to random preset
            simulation.nestPreset = 'random';
            simulation.initialize();
        }
        simulation.updateAntCount();
    });
    
    // Handle window resize by reinitializing simulation
    window.addEventListener('resize', () => {
        resizeCanvas();
        simulation.width = canvas.width;
        simulation.height = canvas.height;
        simulation.initialize();
    });
    
    // Simple color circle functionality
    function setupColorCircles() {
        const circles = {
            'orangeNest': 'orangeNestColor',
            'orangeMin': 'orangeMinSignal',
            'orangeMax': 'orangeMaxSignal',
            'greenNest': 'greenNestColor',
            'greenMin': 'greenMinSignal',
            'greenMax': 'greenMaxSignal'
        };
        
        // Update circle colors to match simulation
        Object.keys(circles).forEach(circleId => {
            const circle = document.getElementById(circleId);
            const propertyName = circles[circleId];
            circle.style.backgroundColor = simulation[propertyName];
        });
        
        Object.keys(circles).forEach(circleId => {
            const circle = document.getElementById(circleId);
            const propertyName = circles[circleId];
            
            circle.addEventListener('click', () => {
                // Create a hidden color input
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = simulation[propertyName];
                colorInput.style.position = 'absolute';
                colorInput.style.left = '-100px';
                document.body.appendChild(colorInput);
                
                // Trigger color picker
                colorInput.click();
                
                // Handle color change
                colorInput.addEventListener('change', (e) => {
                    const newColor = e.target.value;
                    simulation[propertyName] = newColor;
                    circle.style.backgroundColor = newColor;
                    document.body.removeChild(colorInput);
                });
                
                // Handle if user cancels
                colorInput.addEventListener('cancel', () => {
                    document.body.removeChild(colorInput);
                });
            });
        });
        
        // Set as Default button
        document.getElementById('setDefault').addEventListener('click', () => {
            saveDefaultColors(simulation);
            alert('Colors saved as defaults for future runs!');
        });
    }
    
    // Initialize color circles
    setupColorCircles();
    
    // Auto-hide color panel functionality
    function setupAutoHide() {
        const colorPanel = document.getElementById('colorPanel');
        const hoverZone = document.getElementById('hoverZone');
        let hideTimeout;
        let isColorPickerOpen = false;
        
        // Hide panel after 3 seconds
        function startHideTimer() {
            hideTimeout = setTimeout(() => {
                if (!isColorPickerOpen) {
                    colorPanel.classList.add('hidden');
                }
            }, 3000);
        }
        
        // Show panel and reset timer
        function showPanel() {
            colorPanel.classList.remove('hidden');
            clearTimeout(hideTimeout);
            startHideTimer();
        }
        
        // Mouse enter color panel
        colorPanel.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
        });
        
        // Mouse leave color panel
        colorPanel.addEventListener('mouseleave', () => {
            if (!isColorPickerOpen) {
                startHideTimer();
            }
        });
        
        // Mouse enter hover zone
        hoverZone.addEventListener('mouseenter', () => {
            showPanel();
        });
        
        // Start initial timer
        startHideTimer();
        
        // Track color picker state
        document.addEventListener('click', (e) => {
            if (e.target.type === 'color') {
                isColorPickerOpen = true;
                clearTimeout(hideTimeout);
            }
        });
        
        document.addEventListener('change', (e) => {
            if (e.target.type === 'color') {
                isColorPickerOpen = false;
                startHideTimer();
            }
        });
        
        document.addEventListener('cancel', (e) => {
            if (e.target.type === 'color') {
                isColorPickerOpen = false;
                startHideTimer();
            }
        });
    }
    
    // Initialize auto-hide
    setupAutoHide();
    
    // Add click detection for reset button and approval buttons
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if approval is needed
        if (simulation.needsApproval) {
            // Check if click is on next step button
            if (simulation.nextButton && 
                x >= simulation.nextButton.x && x <= simulation.nextButton.x + simulation.nextButton.width &&
                y >= simulation.nextButton.y && y <= simulation.nextButton.y + simulation.nextButton.height) {
                simulation.nextApprovalStep();
                console.log('Next step clicked - moving to step', simulation.approvalStep);
                return;
            }
            
            // Check if click is on start simulation button
            if (simulation.startButton && 
                x >= simulation.startButton.x && x <= simulation.startButton.x + simulation.startButton.width &&
                y >= simulation.startButton.y && y <= simulation.startButton.y + simulation.startButton.height) {
                simulation.needsApproval = false;
                simulation.isRunning = true;
                console.log('Simulation started');
                return;
            }
            
            // Check if click is on approve button
            if (simulation.approveButton && 
                x >= simulation.approveButton.x && x <= simulation.approveButton.x + simulation.approveButton.width &&
                y >= simulation.approveButton.y && y <= simulation.approveButton.y + simulation.approveButton.height) {
                simulation.nextApprovalStep();
                console.log('Approved current step - moving to step', simulation.approvalStep);
                return;
            }
            
            // Check if click is on reject button
            if (simulation.rejectButton && 
                x >= simulation.rejectButton.x && x <= simulation.rejectButton.x + simulation.rejectButton.width &&
                y >= simulation.rejectButton.y && y <= simulation.rejectButton.y + simulation.rejectButton.height) {
                const feedback = prompt("Please explain what's wrong with the current placement:");
                if (feedback) {
                    console.log('User feedback:', feedback);
                    alert(`Feedback received: "${feedback}"\n\nThis will be used to improve the placement algorithm.`);
                }
                simulation.initialize(); // Regenerate placement
                console.log('Rejected - regenerating placement');
                return;
            }
            

        }
        
        // Check if click is on reset button (under timer)
        if (x >= canvas.width - 80 && x <= canvas.width - 20 && y >= 55 && y <= 80) {
            simulation.initialize();
            console.log('Reset button clicked - simulation restarted');
        }
    });
});

