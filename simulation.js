// Object pool for Vec objects to reduce memory allocations
const vecPool = [];
function getVec(x, y) {
    if (vecPool.length > 0) {
        const vec = vecPool.pop();
        vec.x = x;
        vec.y = y;
        return vec;
    }
    return new Vec(x, y);
}

function returnVec(vec) {
    vecPool.push(vec);
}

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
    
    magnitudeSquared() {
        return this.x * this.x + this.y * this.y;
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
        
        // Enable high-quality rendering
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.isRunning = false;
        this.isPaused = false; // New: pause state for simulation
        this.needsApproval = true; // New: require approval before starting
        console.log('Canvas context created, dimensions:', this.width, 'x', this.height);
        
        // Simulation parameters
        this.antCount = 1000; // Increased for performance testing
        this.evaporationRate = 0.01; // Reduced from 0.05
        this.foodCount = 8; // Increased from 2
        
        // Performance optimization parameters
        this.maxAnts = 2000; // Maximum ants for performance
        this.performanceMode = false; // Enable performance optimizations
        this.skipFrames = 0; // Skip frames for performance
        this.lastFrameTime = 0;
        this.fps = 0;
        this.fpsHistory = [];
        this.fpsUpdateInterval = 30; // Update FPS every 30 frames
        
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
        

        this.frameCount = 0;
        this.lastSpawnTime = 0;
        this.nextSpawnInterval = 60 + Math.floor(Math.random() * 120); // 1-3 seconds (much faster)
        this.deadAntCount = 0; // Track total dead ants
        this.queenEggsLaid = 0; // Track total eggs laid by queen
        this.startTime = performance.now(); // For timer
        

        

        
        // Color customization - load from localStorage or use defaults
        const savedColors = loadDefaultColors();
        this.nestColor = savedColors.nestColor || '#0c7e28';  // Nest: R12, G126, B40
        this.antColor = savedColors.antColor || '#bd0f0f';    // Ant: R189, G15, B15
        
        // Trail colors
        this.returningTrailColor = savedColors.returningTrailColor || '#923a3a';  // Returning: R146, G58, B58
        this.scoutingTrailColor = savedColors.scoutingTrailColor || '#394431';   // Scouting: R57, G68, B49
        
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
            
            // Don't place too close to nest
            if (food.pos.subtract(new Vec(this.nest.x, this.nest.y)).magnitude() < food.radius + this.nest.radius + 100) {
                return false;
            }
            
            // Don't place too close to other food
            for (const existingFood of this.foodSources) {
                if (food.pos.subtract(existingFood.pos).magnitude() < food.radius + existingFood.radius + 50) {
                    return false;
                }
            }
            
            // Don't place too close to obstacles
            for (const obstacle of this.obstacles) {
                if (food.pos.subtract(obstacle.pos).magnitude() < food.radius + obstacle.baseRadius + 50) {
                    return false;
                }
            }
            
            return true;
        };
        
        // Helper method to validate obstacle position
        this.isValidObstaclePosition = (obstacle) => {
            // Don't place too close to nest
            if (obstacle.pos.subtract(new Vec(this.nest.x, this.nest.y)).magnitude() < obstacle.baseRadius + this.nest.radius + 100) {
                return false;
            }
            
            // Don't place too close to food sources
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
        

        
        console.log('About to initialize simulation...');
        this.initialize();
        console.log('Simulation initialized');

        this.start();
    }
    
    initialize() {
        // Initialize pheromone field
        this.pheromoneField = new PheromoneField(this.width, this.height, 6);
        
        // Place single nest randomly on left or right side
        const nestMargin = 100;
        const isLeftSide = Math.random() < 0.5; // 50% chance for left or right
        
        if (isLeftSide) {
            // Nest on left side
            this.nest.x = nestMargin + Math.random() * (this.width * 0.3); // Left 30% of screen
            this.nest.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
        } else {
            // Nest on right side
            this.nest.x = this.width - nestMargin - Math.random() * (this.width * 0.3); // Right 30% of screen
            this.nest.y = nestMargin + Math.random() * (this.height - 2 * nestMargin);
        }
        
        console.log(`Single nest placed at (${this.nest.x.toFixed(0)}, ${this.nest.y.toFixed(0)})`);
        
        // Initialize empty arrays for step-by-step placement
        this.foodSources = [];
        this.obstacles = [];
        

        
        // Automatically place all food sources on the opposite side of the nest
        const isNestOnLeft = this.nest.x < this.width / 2;
        
        for (let i = 0; i < 4; i++) {
            let food;
            let attempts = 0;
            
            do {
                food = new Food(0, 0);
                
                if (isNestOnLeft) {
                    // Nest is on left, place food on right side
                    food.pos.x = this.width * 0.7 + Math.random() * (this.width * 0.25); // Right 25% of screen
                    food.pos.y = 50 + Math.random() * (this.height - 100);
                } else {
                    // Nest is on right, place food on left side
                    food.pos.x = 50 + Math.random() * (this.width * 0.25); // Left 25% of screen
                    food.pos.y = 50 + Math.random() * (this.height - 100);
                }
                
                attempts++;
            } while (!this.isValidFoodPosition(food) && attempts < 100);
            
            if (attempts < 100) {
                this.foodSources.push(food);
            }
        }
        
        // Place obstacles based on user input or default
        const obstacleCount = parseInt(localStorage.getItem('obstacleCount')) || 35;
        for (let i = 0; i < obstacleCount; i++) {
            let obstacle;
            let attempts = 0;
            
            do {
                obstacle = new Obstacle(0, 0);
                
                // Place obstacles randomly across the screen
                obstacle.pos.x = 50 + Math.random() * (this.width - 100);
                obstacle.pos.y = 50 + Math.random() * (this.height - 100);
                
                obstacle.randomize(this.width, this.height);
                attempts++;
                
                if (this.isValidObstaclePosition(obstacle)) break;
            } while (attempts < 100);
            
            if (attempts < 100) {
                this.obstacles.push(obstacle);
            }
        }
        
        // Calculate nest capacity based on total food available
        let totalFoodAvailable = 0;
        for (const food of this.foodSources) {
            totalFoodAvailable += food.originalAmount;
        }
        this.nest.maxCapacity = totalFoodAvailable;
        console.log(`Nest capacity set to ${totalFoodAvailable} (total food available)`);
        console.log(`Placed ${this.foodSources.length} food sources and ${this.obstacles.length} obstacles`);
        
        // Create ants for single colony
        this.ants = [];
        for (let i = 0; i < this.antCount; i++) {
            // Create ants in a wider area around the nest
            const angle = (i / this.antCount) * Math.PI * 2 + Math.random() * 0.5;
            const distance = 15 + Math.random() * 10;
            const x = this.nest.x + Math.cos(angle) * distance;
            const y = this.nest.y + Math.sin(angle) * distance;
            
            const ant = new Ant(x, y, this);
            this.ants.push(ant);
        }
        console.log(`Created ${this.ants.length} ants around nest position (${this.nest.x}, ${this.nest.y})`);
        
        // Give ants varied initial directions
        for (let i = 0; i < this.ants.length; i++) {
            const ant = this.ants[i];
            // Point ants in different directions based on their position
            const angleToNest = ant.position.subtract(new Vec(this.nest.x, this.nest.y)).angle();
            ant.velocity = new Vec(Math.cos(angleToNest + (Math.random() - 0.5) * Math.PI), 
                                 Math.sin(angleToNest + (Math.random() - 0.5) * Math.PI)).multiply(2);
        }
        
        console.log(`Initialized simulation with ${this.ants.length} ants`);
        console.log(`Canvas size: ${this.width} x ${this.height}`);
        console.log(`Nest position: (${this.nest.x}, ${this.nest.y})`);
        if (this.ants.length > 0) {
            console.log(`First ant position: (${this.ants[0].position.x}, ${this.ants[0].position.y})`);
        }
        
        // Start simulation immediately
        this.needsApproval = false;
        this.isRunning = true;
        console.log('Simulation started automatically');
    }
    
    // Soft reset - preserves nest, obstacles, and food positions but resets simulation state
    softReset() {
        console.log('Performing soft reset - preserving environment layout...');
        
        // Reset pheromone field
        this.pheromoneField = new PheromoneField(this.width, this.height, 6);
        
        // Reset nest state (keep position)
        this.nest.foodStored = 0;
        this.nest.isFull = false;
        
        // Reset food sources (keep positions, restore amounts)
        for (const food of this.foodSources) {
            food.amount = food.originalAmount;
        }
        
        // Reset simulation state
        this.frameCount = 0;
        this.lastSpawnTime = 0;
        this.startTime = performance.now();
        
        // Create new ants around the existing nest
        this.ants = [];
        for (let i = 0; i < this.antCount; i++) {
            // Create ants in a wider area around the nest
            const angle = (i / this.antCount) * Math.PI * 2 + Math.random() * 0.5;
            const distance = 15 + Math.random() * 10;
            const x = this.nest.x + Math.cos(angle) * distance;
            const y = this.nest.y + Math.sin(angle) * distance;
            
            const ant = new Ant(x, y, this);
            this.ants.push(ant);
        }
        
        console.log(`Soft reset complete - ${this.ants.length} new ants created around existing nest`);
    }
    
    // Save scenery - exports nest, obstacles, and food positions to a file
    saveScenery() {
        const sceneryData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            canvas: {
                width: this.width,
                height: this.height
            },
            nest: {
                x: this.nest.x,
                y: this.nest.y,
                radius: this.nest.radius
            },
            obstacles: this.obstacles.map(obstacle => ({
                x: obstacle.pos.x,
                y: obstacle.pos.y,
                baseRadius: obstacle.baseRadius
            })),
            foodSources: this.foodSources.map(food => ({
                x: food.pos.x,
                y: food.pos.y,
                radius: food.radius,
                originalAmount: food.originalAmount
            }))
        };
        
        // Create and download the file
        const dataStr = JSON.stringify(sceneryData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        // Prompt for filename
        const filename = prompt('Enter filename for scenery (without extension):', 'my_scenery');
        if (!filename) return; // User cancelled
        
        const fullFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
        
        // Create download link
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(dataBlob);
        downloadLink.download = fullFilename;
        downloadLink.style.display = 'none';
        
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        console.log(`Scenery saved as: ${fullFilename}`);
        alert(`Scenery saved successfully as: ${fullFilename}`);
    }
    
    // Load scenery - imports nest, obstacles, and food positions from a file
    loadScenery() {
        // Create file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const sceneryData = JSON.parse(e.target.result);
                    
                    // Validate the data structure
                    if (!sceneryData.nest || !sceneryData.obstacles || !sceneryData.foodSources) {
                        throw new Error('Invalid scenery file format');
                    }
                    
                    // Load nest position
                    this.nest.x = sceneryData.nest.x;
                    this.nest.y = sceneryData.nest.y;
                    this.nest.radius = sceneryData.nest.radius || 40;
                    
                    // Load obstacles
                    this.obstacles = [];
                    for (const obstacleData of sceneryData.obstacles) {
                        const obstacle = new Obstacle(obstacleData.x, obstacleData.y);
                        obstacle.baseRadius = obstacleData.baseRadius;
                        obstacle.blob = makeBlob(obstacle.pos.x, obstacle.pos.y, obstacle.baseRadius, 0.2, 18);
                        this.obstacles.push(obstacle);
                    }
                    
                    // Load food sources
                    this.foodSources = [];
                    for (const foodData of sceneryData.foodSources) {
                        const food = new Food(foodData.x, foodData.y);
                        food.radius = foodData.radius;
                        food.originalAmount = foodData.originalAmount;
                        food.amount = food.originalAmount;
                        this.foodSources.push(food);
                    }
                    
                    // Recalculate nest capacity
                    let totalFoodAvailable = 0;
                    for (const food of this.foodSources) {
                        totalFoodAvailable += food.originalAmount;
                    }
                    this.nest.maxCapacity = totalFoodAvailable;
                    
                    // Reset simulation state
                    this.softReset();
                    
                    console.log(`Scenery loaded from: ${file.name}`);
                    alert(`Scenery loaded successfully from: ${file.name}\nObstacles: ${this.obstacles.length}\nFood sources: ${this.foodSources.length}`);
                    
                } catch (error) {
                    console.error('Error loading scenery:', error);
                    alert('Error loading scenery file. Please check the file format.');
                }
            };
            
            reader.readAsText(file);
        });
        
        // Trigger file selection
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
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
    

    
    evaporatePheromones() {
        this.pheromoneField.evaporate(this.evaporationRate);
    }
    
    update() {
        // Calculate FPS
        const currentTime = performance.now();
        if (this.lastFrameTime > 0) {
            const frameTime = currentTime - this.lastFrameTime;
            this.fps = 1000 / frameTime;
            this.fpsHistory.push(this.fps);
            if (this.fpsHistory.length > 60) {
                this.fpsHistory.shift();
            }
        }
        this.lastFrameTime = currentTime;
        
        this.frameCount++;
        
        // Skip simulation updates if paused
        if (this.isPaused) {
            return;
        }
        
        // Performance optimization: Skip frames if FPS is low
        if (this.performanceMode && this.fps < 30) {
            this.skipFrames++;
            if (this.skipFrames < 2) return; // Skip every other frame
            this.skipFrames = 0;
        }
        
        // Update all ants (immortal ants) with performance optimization
        const antCount = this.ants.length;
        const updateBatch = Math.max(1, Math.floor(antCount / 10)); // Update in batches
        
        for (let i = 0; i < antCount; i += updateBatch) {
            const endIndex = Math.min(i + updateBatch, antCount);
            for (let j = i; j < endIndex; j++) {
                this.ants[j].update();
            }
        }
        
        // Spawn new ants to maintain population
        this.spawnNewAnts();
        
        // Evaporate pheromones
        this.evaporatePheromones();
        
        // Debug: Log ant movement every 60 frames (1 second at 60fps)
        if (this.frameCount % 60 === 0 && this.ants.length > 0) {
            console.log(`Frame ${this.frameCount}: First ant at (${Math.floor(this.ants[0].position.x)}, ${Math.floor(this.ants[0].position.y)})`);
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
        
        // Draw nest
        this.drawNest();
        
        // Draw ants
        this.drawAnts();
        
        // Draw debug info
        this.drawDebugInfo();
        
        // Draw pause indicator
        if (this.isPaused) {
            this.drawPauseIndicator();
        }
    }
    


    

    

    
    drawPheromones() {
        const cell = this.pheromoneField.cell;
        
        // Enable anti-aliasing for smoother rendering
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Create a temporary canvas for smooth rendering
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.width;
        tempCanvas.height = this.height;
        
        // Enable anti-aliasing on temp canvas
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        
        // Draw pheromones for single colony with improved visual quality
        // Performance optimization: Skip every other cell in performance mode
        const stepSize = this.performanceMode && this.fps < 30 ? 2 : 1;
        for (let x = 0; x < this.pheromoneField.gridW; x += stepSize) {
            for (let y = 0; y < this.pheromoneField.gridH; y += stepSize) {
                const homeStr = this.pheromoneField.home[x][y];
                const foodStr = this.pheromoneField.food[x][y];
                const success = this.pheromoneField.pathSuccess[x][y];
                
                // Only process cells that have actual pheromone values (performance optimization)
                if (homeStr > 2 || foodStr > 2) {
                    // Draw home trails (scouting trails for exploring ants) with smoothing
                    if (homeStr > 2) {
                        const alpha = Math.min(0.6, homeStr / 100);
                        const scoutingColor = hexToRgb(this.scoutingTrailColor || '#404040');
                        
                        // Apply Gaussian smoothing for home trails
                        const smoothedAlpha = this.applyGaussianSmoothing(x, y, 'home', alpha);
                        
                        tempCtx.fillStyle = `rgba(${scoutingColor.r}, ${scoutingColor.g}, ${scoutingColor.b}, ${smoothedAlpha})`;
                        tempCtx.fillRect(x * cell, y * cell, cell, cell);
                    }
                    
                    // Draw food trails (returning ants with single color) with enhanced visual effects
                    if (foodStr > 2) {
                        const alpha = Math.min(1.0, (foodStr + success) / 80);
                        const strength = Math.min(1.0, (foodStr + success) / 200);
                        
                        // Apply non-linear mapping for better distribution
                        const mappedStrength = Math.pow(strength, 0.7); // More gradual transition
                        
                        const returningColor = hexToRgb(this.returningTrailColor);
                        const finalAlpha = alpha * mappedStrength;
                        
                        // Apply Gaussian smoothing for food trails
                        const smoothedAlpha = this.applyGaussianSmoothing(x, y, 'food', finalAlpha);
                        
                        // Add subtle glow effect for stronger trails
                        const glowIntensity = Math.min(0.3, smoothedAlpha * 0.5);
                        if (glowIntensity > 0.05) {
                            tempCtx.shadowColor = `rgba(${returningColor.r}, ${returningColor.g}, ${returningColor.b}, ${glowIntensity})`;
                            tempCtx.shadowBlur = 2;
                        }
                        
                        tempCtx.fillStyle = `rgba(${returningColor.r}, ${returningColor.g}, ${returningColor.b}, ${smoothedAlpha})`;
                        tempCtx.fillRect(x * cell, y * cell, cell, cell);
                        
                        // Reset shadow
                        tempCtx.shadowBlur = 0;
                    }
                }
            }
        }
        
        // Apply additional blur filter to the entire pheromone layer
        this.ctx.filter = 'blur(1.5px)'; // Increased blur for smoother trails
        this.ctx.drawImage(tempCanvas, 0, 0);
        this.ctx.filter = 'none';
    }
    
    // Apply strong Gaussian blur to eliminate pixelation
    applyGaussianSmoothing(x, y, type, baseAlpha) {
        // Larger 5x5 Gaussian kernel for stronger blur
        const kernel = [
            [0.003765, 0.015019, 0.023792, 0.015019, 0.003765],
            [0.015019, 0.059912, 0.094907, 0.059912, 0.015019],
            [0.023792, 0.094907, 0.150342, 0.094907, 0.023792],
            [0.015019, 0.059912, 0.094907, 0.059912, 0.015019],
            [0.003765, 0.015019, 0.023792, 0.015019, 0.003765]
        ];
        
        let smoothedAlpha = 0;
        let totalWeight = 0;
        
        // Apply 5x5 blur
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < this.pheromoneField.gridW && 
                    ny >= 0 && ny < this.pheromoneField.gridH) {
                    
                    let neighborAlpha = 0;
                    if (type === 'home') {
                        const neighborStr = this.pheromoneField.home[nx][ny];
                        if (neighborStr > 2) {
                            neighborAlpha = Math.min(0.6, neighborStr / 100);
                        }
                    } else if (type === 'food') {
                        const neighborStr = this.pheromoneField.food[nx][ny];
                        const neighborSuccess = this.pheromoneField.pathSuccess[nx][ny];
                        if (neighborStr > 2) {
                            neighborAlpha = Math.min(1.0, (neighborStr + neighborSuccess) / 80);
                        }
                    }
                    
                    const weight = kernel[dx + 2][dy + 2];
                    smoothedAlpha += neighborAlpha * weight;
                    totalWeight += weight;
                }
            }
        }
        
        // Strong blur with minimal original preservation for maximum smoothness
        const finalAlpha = (smoothedAlpha / totalWeight) * 0.9 + baseAlpha * 0.1;
        return Math.max(0, Math.min(1, finalAlpha));
    }
    
    drawFoodSources() {
        for (let food of this.foodSources) {
            food.draw(this.ctx);
        }
    }
    
    drawNest() {
        this.ctx.save();
        this.ctx.translate(this.nest.x, this.nest.y);
        
        // Draw house body
        this.ctx.fillStyle = this.nestColor; // Customizable nest color
        this.ctx.fillRect(-30, -20, 60, 40);
        
        // Draw roof
        this.ctx.beginPath();
        this.ctx.moveTo(-35, -20);
        this.ctx.lineTo(0, -45);
        this.ctx.lineTo(35, -20);
        this.ctx.closePath();
        this.ctx.fillStyle = this.nestColor; // Customizable nest color
        this.ctx.fill();
        
        // Draw door
        this.ctx.fillStyle = this.nestColor; // Customizable nest color
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
    

    
    drawAnts() {
        console.log(`Drawing ${this.ants.length} ants`);
        for (let ant of this.ants) {
            this.ctx.save();
            this.ctx.translate(ant.position.x, ant.position.y);
            
            const dir = ant.velocity.magnitude() > 0 ? ant.velocity.normalize() : new Vec(1, 0);
            const angle = Math.atan2(dir.y, dir.x);
            this.ctx.rotate(angle);
            
            // Fixed size for immortal ants
            const size = 5;
            
            this.ctx.beginPath();
            this.ctx.moveTo(size, 0);
            this.ctx.lineTo(-size * 0.6, size * 0.6);
            this.ctx.lineTo(-size * 0.6, -size * 0.6);
            this.ctx.closePath();
            
            // Color based on food status - returning ants use antColor, exploring ants use nestColor
            let baseColor = ant.hasFood ? this.antColor : this.nestColor;
            
            // Color based on food status only
            this.ctx.fillStyle = baseColor;
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
        
        // Draw reset button under timer
        this.ctx.fillStyle = '#ffa500';
        this.ctx.fillRect(this.width - 80, 55, 60, 25);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 12px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('RESET', this.width - 50, 72);
        
        // Draw save scenery button
        this.ctx.fillStyle = '#ffa500';
        this.ctx.fillRect(this.width - 80, 85, 60, 25);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 12px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SAVE', this.width - 50, 102);
        
        // Draw load scenery button
        this.ctx.fillStyle = '#ffa500';
        this.ctx.fillRect(this.width - 80, 115, 60, 25);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 12px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('LOAD', this.width - 50, 132);
        
        // Draw stats
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial, sans-serif';
        this.ctx.textAlign = 'left';
        
        // Stats display
        this.ctx.fillText(`Colony: ${this.ants.length}`, 10, 25);
        this.ctx.fillText(`Food: ${this.nest.foodStored}/${this.nest.maxCapacity}`, 10, 45);
        
        // FPS counter
        const avgFps = this.fpsHistory.length > 0 ? 
            this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length : 0;
        this.ctx.fillStyle = this.fps > 50 ? '#00ff00' : this.fps > 30 ? '#ffff00' : '#ff0000';
        this.ctx.fillText(`FPS: ${this.fps.toFixed(1)} (${avgFps.toFixed(1)})`, 10, 65);
        
        // Performance mode indicator
        if (this.performanceMode) {
            this.ctx.fillStyle = '#00ffff';
            this.ctx.fillText('PERF MODE', 10, 85);
        }
        
        // Instructions at bottom left
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 12px Arial, sans-serif';
        this.ctx.fillText('Controls: R=Reset, P=Pause, A=Add Ants, O=Performance Mode', 10, this.height - 20);
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
        
        // Statistics (for internal use only)
        if (this.ants.length > 0) {
            // Ants are immortal - no age or energy tracking
        }
        

    }
    
    drawPauseIndicator() {
        // Draw semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw pause text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('PAUSED', this.width / 2, this.height / 2 - 50);
        
        // Draw instruction text
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press P to resume', this.width / 2, this.height / 2 + 10);
        this.ctx.font = '18px Arial';
        this.ctx.fillText('You can still drag apples and obstacles', this.width / 2, this.height / 2 + 40);
    }
    
    start() {
        console.log('Starting ant foraging simulation...');
        console.log('Ants array length:', this.ants ? this.ants.length : 'undefined');
        if (this.ants && this.ants.length > 0) {
            console.log(`Initial ant positions:`, this.ants.map(ant => ({x: ant.position.x, y: ant.position.y})));
        }
        
        // Performance monitoring
        let frameCount = 0;
        let lastFPS = 0;
        let lastTime = performance.now();
        
        const animate = (currentTime) => {
            try {
                // Frame rate limiting - target 60 FPS
                const targetFPS = 60;
                const frameInterval = 1000 / targetFPS;
                
                if (currentTime - lastTime >= frameInterval) {
                    this.update();
                    this.draw();
                    lastTime = currentTime;
                    
                    // Performance monitoring
                    frameCount++;
                    if (currentTime - lastTime >= 1000) {
                        lastFPS = frameCount;
                        frameCount = 0;
                        console.log(`Performance: ${lastFPS} FPS`);
                    }
                }
                
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
        this.isBeingDragged = false;
    }
    
    randomize(w, h) {
        this.pos = new Vec(Math.random() * (w * 0.7) + w * 0.15, Math.random() * (h * 0.7) + h * 0.15);
        this.baseRadius = 30 + Math.random() * 30;
        this.blob = makeBlob(this.pos.x, this.pos.y, this.baseRadius, 0.2, 18);
    }
    
    draw(ctx) {
        ctx.save();
        
        // Different appearance when being dragged
        if (this.isBeingDragged) {
            ctx.fillStyle = 'rgba(100, 100, 100, 0.95)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
        } else {
        ctx.fillStyle = 'rgba(50, 50, 50, 0.95)';
        }
        
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
            
            // Draw border when being dragged
            if (this.isBeingDragged) {
                ctx.stroke();
            }
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
        
        // Ant properties (immortal ants)
        this.birthTime = performance.now();
        

    }
    
    update() {
        // Immortal ants - no aging or energy mechanics
        this.maxSpeed = 3.0; // Constant speed
        
        let direction = new Vec(0, 0);
        
        if (this.hasFood) {
            // Returning to nest
            let targetNest = this.simulation.nest;
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
                
                            // Food found (no energy mechanics)
                
                // Set gentle momentum toward nest for natural return
                const nestDir = new Vec(this.simulation.nest.x, this.simulation.nest.y).subtract(this.position).normalize();
                this.momentum = nestDir.multiply(0.3);
                
                // Reinforce the path that led to food
                if (this.path.length > 3) {
                    const field = this.simulation.pheromoneField;
                    field.reinforcePath(this.path, 3);
                }
                
                // Clear path for return journey
                this.path = [];
                
                console.log(`Food found!`);
            }
        } else {
            // Enhanced food delivery at nest
            let targetNest = this.simulation.nest;
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
                    console.log(`Nest is full! Food wasted.`);
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
                    console.log(`Nest is now full! All food collected: ${targetNest.foodStored}/${targetNest.maxCapacity}`);
                } else {
                    targetNest.foodStored = newTotal;
                }
                
                // Reinforce successful return path with efficiency-based strength
                if (this.path.length > 3) {
                    const reinforcementStrength = overallEfficiency * 6;
                    const field = this.simulation.pheromoneField;
                    field.reinforcePath(this.path, reinforcementStrength);
                }
                
                            // Food delivered successfully (no energy mechanics)
                
                // Clear state for clean transition to exploring
                this.path = [];
                this.momentum = Vec.random().multiply(0.3);
                this.tripStartTime = performance.now();
                
                // Log successful delivery
                console.log(`Ant delivered food! Efficiency: ${overallEfficiency.toFixed(2)}, Food gained: ${foodGained}`);
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
            
            // Don't place too close to nest
            if (obstacle.pos.subtract(new Vec(this.nest.x, this.nest.y)).magnitude() < obstacle.baseRadius + 80) {
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

// Load obstacle count (standalone function)
function loadObstacleCount() {
    try {
        const saved = localStorage.getItem('obstacleCount');
        return saved ? parseInt(saved) : 35;
    } catch (e) {
        console.log('Could not load obstacle count');
        return 35;
    }
}

// Save current colors as defaults (standalone function)
function saveDefaultColors(simulation) {
    try {
        const colors = {
            nestColor: simulation.nestColor,
            antColor: simulation.antColor,
            returningTrailColor: simulation.returningTrailColor,
            scoutingTrailColor: simulation.scoutingTrailColor
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
            simulation.softReset();
        }
        if (e.key === 'a' || e.key === 'A') {
            // Add more ants
            simulation.antCount = Math.min(simulation.antCount + 100, simulation.maxAnts);
            console.log(`Ant count increased to: ${simulation.antCount}`);
        }
        if (e.key === 'p' || e.key === 'P') {
            // Toggle pause state
            simulation.isPaused = !simulation.isPaused;
            console.log('Simulation paused:', simulation.isPaused);
        }
        if (e.key === 'o' || e.key === 'O') {
            // Toggle performance mode
            simulation.performanceMode = !simulation.performanceMode;
            console.log('Performance mode:', simulation.performanceMode);
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
            'nestColor': 'nestColor',
            'antColor': 'antColor',
            'returningTrailColor': 'returningTrailColor',
            'scoutingTrailColor': 'scoutingTrailColor'
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
                
                // Handle live color updates
                colorInput.addEventListener('input', (e) => {
                    const newColor = e.target.value;
                    simulation[propertyName] = newColor;
                    circle.style.backgroundColor = newColor;
                });
                
                // Handle color change (final selection)
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
    
    // Setup obstacle count functionality
    function setupObstacleCount() {
        const obstacleInput = document.getElementById('obstacleCount');
        const applyButton = document.getElementById('applyObstacles');
        
        // Load saved obstacle count
        const savedCount = loadObstacleCount();
        obstacleInput.value = savedCount;
        
        // Apply button functionality
        applyButton.addEventListener('click', () => {
            const newCount = parseInt(obstacleInput.value);
            if (newCount >= 1 && newCount <= 100) {
                localStorage.setItem('obstacleCount', newCount.toString());
                alert(`Obstacle count set to ${newCount}. Please refresh the page to apply changes.`);
            } else {
                alert('Please enter a number between 1 and 100.');
            }
        });
        
        // Enter key functionality
        obstacleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                applyButton.click();
            }
        });
    }
    
    // Initialize obstacle count
    setupObstacleCount();
    
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
                }
            });
            
            document.addEventListener('change', (e) => {
                if (e.target.type === 'color') {
                    isColorPickerOpen = false;
                }
            });
        }
        
        // Draggable apples and obstacles functionality
        function setupDraggableObjects() {
            let isDragging = false;
            let draggedFood = null;
            let draggedObstacle = null;
            let dragOffset = { x: 0, y: 0 };
            
            canvas.addEventListener('mousedown', (e) => {
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const mousePos = new Vec(mouseX, mouseY);
                
                // Check if clicking on a food source
                for (let food of simulation.foodSources) {
                    const distance = Math.sqrt(
                        Math.pow(mouseX - food.pos.x, 2) + 
                        Math.pow(mouseY - food.pos.y, 2)
                    );
                    
                    if (distance <= food.radius) {
                        isDragging = true;
                        draggedFood = food;
                        dragOffset.x = mouseX - food.pos.x;
                        dragOffset.y = mouseY - food.pos.y;
                        canvas.style.cursor = 'grabbing';
                        break;
                    }
                }
                
                // Check if clicking on an obstacle
                if (!isDragging) {
                    for (const obstacle of simulation.obstacles) {
                        const distance = mousePos.subtract(obstacle.pos).magnitude();
                        if (distance <= obstacle.baseRadius) {
                            isDragging = true;
                            draggedObstacle = obstacle;
                            draggedObstacle.isBeingDragged = true;
                            dragOffset.x = mouseX - obstacle.pos.x;
                            dragOffset.y = mouseY - obstacle.pos.y;
                            canvas.style.cursor = 'grabbing';
                            e.preventDefault();
                            break;
                        }
                    }
                }
            });
            
            canvas.addEventListener('mousemove', (e) => {
                    const rect = canvas.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                const mousePos = new Vec(mouseX, mouseY);
                    
                if (isDragging && draggedFood) {
                    // Update food position
                    draggedFood.pos.x = mouseX - dragOffset.x;
                    draggedFood.pos.y = mouseY - dragOffset.y;
                    
                    // Keep food within canvas bounds
                    draggedFood.pos.x = Math.max(draggedFood.radius, Math.min(canvas.width - draggedFood.radius, draggedFood.pos.x));
                    draggedFood.pos.y = Math.max(draggedFood.radius, Math.min(canvas.height - draggedFood.radius, draggedFood.pos.y));
                } else if (isDragging && draggedObstacle) {
                    // Update obstacle position
                    draggedObstacle.pos = mousePos.subtract(new Vec(dragOffset.x, dragOffset.y));
                    
                    // Regenerate blob at new position
                    draggedObstacle.blob = makeBlob(draggedObstacle.pos.x, draggedObstacle.pos.y, 
                                                  draggedObstacle.baseRadius, 0.2, 18);
                    
                    e.preventDefault();
                } else {
                    // Check if hovering over draggable objects for cursor feedback
                    let hoveringOverDraggable = false;
                    
                    // Check food sources
                    for (let food of simulation.foodSources) {
                        const distance = Math.sqrt(
                            Math.pow(mouseX - food.pos.x, 2) + 
                            Math.pow(mouseY - food.pos.y, 2)
                        );
                        if (distance <= food.radius) {
                            hoveringOverDraggable = true;
                            break;
                        }
                    }
                    
                    // Check obstacles
                    if (!hoveringOverDraggable) {
                        for (const obstacle of simulation.obstacles) {
                            const distance = mousePos.subtract(obstacle.pos).magnitude();
                            if (distance <= obstacle.baseRadius) {
                                hoveringOverDraggable = true;
                                break;
                            }
                        }
                    }
                    
                    // Update cursor
                    if (hoveringOverDraggable) {
                        canvas.style.cursor = 'grab';
                    } else {
                        canvas.style.cursor = 'default';
                    }
                }
            });
            
            canvas.addEventListener('mouseup', (e) => {
                if (isDragging) {
                    if (draggedObstacle) {
                        draggedObstacle.isBeingDragged = false;
                        draggedObstacle = null;
                    }
                    isDragging = false;
                    draggedFood = null;
                    canvas.style.cursor = 'default';
                    e.preventDefault();
                }
            });
            
            canvas.addEventListener('mouseleave', (e) => {
                if (isDragging) {
                    if (draggedObstacle) {
                        draggedObstacle.isBeingDragged = false;
                        draggedObstacle = null;
                    }
                    isDragging = false;
                    draggedFood = null;
                    canvas.style.cursor = 'default';
                }
            });
        }
        
        // Initialize auto-hide
        setupAutoHide();
        
        // Initialize draggable objects
        setupDraggableObjects();
        
        // Add click detection for reset button
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check if click is on reset button (under timer)
            if (x >= canvas.width - 80 && x <= canvas.width - 20 && y >= 55 && y <= 80) {
                simulation.softReset();
                console.log('Reset button clicked - simulation restarted with preserved layout');
            }
            
            // Check if click is on save scenery button
            if (x >= canvas.width - 80 && x <= canvas.width - 20 && y >= 85 && y <= 110) {
                simulation.saveScenery();
            }
            
            // Check if click is on load scenery button
            if (x >= canvas.width - 80 && x <= canvas.width - 20 && y >= 115 && y <= 140) {
                simulation.loadScenery();
            }
        });
    });

