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
    
    clear() {
        for (let x = 0; x < this.gridW; x++) {
            for (let y = 0; y < this.gridH; y++) {
                this.home[x][y] = 0;
                this.food[x][y] = 0;
                this.pathSuccess[x][y] = 0;
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
        
        // Custom preset system
        this.currentPreset = null;
        this.presets = {};
        
        // Load saved presets from localStorage
        this.loadSavedPresets();
        
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

        this.startTime = performance.now(); // For timer
        this.isPaused = false; // Pause state for simulation
        
        // Button press animation states
        this.buttonPressStates = {
            reset: false,
            pause: false,
            restart: false
        };
        this.buttonPressTimers = {
            reset: 0,
            pause: 0,
            restart: 0
        };
        
        // Track a highlighted green ant for observation
        this.highlightedGreenAnt = null;
        this.sampleAntToggle = false; // Default OFF - no highlighting
        
        // Preset editor system
        this.presetEditor = {
            isActive: false,
            currentPreset: null,
            isEditing: false
        };
        
        // Load saved presets from localStorage
        this.loadSavedPresets();
        

        

        
        // Color customization - load from localStorage or use defaults
        const savedColors = loadDefaultColors();
        this.nestColor = savedColors.nestColor || '#3a6d36'; // RGB(58, 109, 54) - Nest and exploring ant
        this.antColor = savedColors.antColor || '#b03030'; // RGB(176, 48, 48) - Returning Ants
        
        // Trail colors
        this.returningTrailColor = savedColors.returningTrailColor || '#732626'; // RGB(115, 38, 38) - Returning trail
        this.scoutingTrailColor = savedColors.scoutingTrailColor || '#292e28'; // RGB(41, 46, 40) - Exploring trail
        
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
        
        // Helper method to draw rounded rectangles
        this.roundRect = (x, y, width, height, radius) => {
            this.ctx.beginPath();
            this.ctx.moveTo(x + radius, y);
            this.ctx.lineTo(x + width - radius, y);
            this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            this.ctx.lineTo(x + width, y + height - radius);
            this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            this.ctx.lineTo(x + radius, y + height);
            this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            this.ctx.lineTo(x, y + radius);
            this.ctx.quadraticCurveTo(x, y, x + radius, y);
            this.ctx.closePath();
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
        
        // Helper method to sweep ants away from moving obstacles
        this.sweepAntsFromObstaclePath = (obstacle, newPos) => {
            const sweepRadius = obstacle.baseRadius + 30; // Larger sweep area for fast obstacles
            const sweepForce = 12; // Much stronger force to push ants away
            
            for (const ant of this.ants) {
                const distance = ant.position.subtract(newPos).magnitude();
                if (distance < sweepRadius) {
                    // Calculate direction away from obstacle
                    const awayDirection = ant.position.subtract(newPos).normalize();
                    
                    // Apply strong repulsion force with distance-based scaling
                    const repulsionForce = (sweepRadius - distance) / sweepRadius * sweepForce;
                    ant.velocity = ant.velocity.add(awayDirection.multiply(repulsionForce));
                    
                    // Ensure ant doesn't get pushed too fast
                    if (ant.velocity.magnitude() > 10) {
                        ant.velocity = ant.velocity.normalize().multiply(10);
                    }
                    
                    // Emergency teleport if ant is too close to obstacle center
                    if (distance < obstacle.baseRadius * 0.5) {
                        // Teleport ant to a safe distance outside the obstacle
                        const safeDistance = obstacle.baseRadius + 15;
                        const teleportDirection = ant.position.subtract(newPos).normalize();
                        ant.position = newPos.add(teleportDirection.multiply(safeDistance));
                        console.log('Emergency teleport: Ant moved outside obstacle');
                    }
                }
            }
        };
        
        // Helper method to check and fix ants trapped inside obstacles
        this.checkAndFixTrappedAnts = () => {
            for (const ant of this.ants) {
                for (const obstacle of this.obstacles) {
                    const rep = obstacle.repulse(ant.position);
                    
                    // Fix ants that are inside or very close to obstacles
                    if (rep.dist < 0.8) {
                        // Calculate the closest point outside the obstacle
                        const awayDirection = ant.position.subtract(obstacle.pos).normalize();
                        const safeDistance = obstacle.baseRadius + 15;
                        
                        // Teleport ant to safe position
                        ant.position = obstacle.pos.add(awayDirection.multiply(safeDistance));
                        
                        // Apply stronger velocity away from obstacle
                        ant.velocity = awayDirection.multiply(3);
                        
                        console.log(`Fixed trapped ${ant.hasFood ? 'red' : 'green'} ant: Moved outside obstacle`);
                    }
                }
            }
        };
        
        // Helper method to sweep ants along with moving obstacles
        this.sweepAntsFromMovingObstacle = (obstacle) => {
            // Sweep ants along with moving obstacles (works even when paused)
            if (!obstacle.lastPos) return;
            
            const obstacleMovement = obstacle.pos.subtract(obstacle.lastPos);
            const movementMagnitude = obstacleMovement.magnitude();
            
            if (movementMagnitude < 0.1) return; // No significant movement
            
            for (const ant of this.ants) {
                const rep = obstacle.repulse(ant.position);
                const sweepRange = obstacle.baseRadius + 20; // Larger sweep range for dragging
                
                if (rep.dist < sweepRange) {
                    // Calculate sweep force based on distance from obstacle center
                    const distanceFactor = Math.max(0, (sweepRange - rep.dist) / sweepRange);
                    const sweepForce = distanceFactor * 1.2; // Stronger sweeping force for dragging
                    
                    // Apply obstacle movement to ant position
                    const sweptMovement = obstacleMovement.multiply(sweepForce);
                    ant.position = ant.position.add(sweptMovement);
                    
                    // Also add velocity in the direction of movement
                    const sweepVelocity = obstacleMovement.normalize().multiply(sweepForce * 3.0);
                    ant.velocity = ant.velocity.add(sweepVelocity);
                    
                    // Limit velocity to prevent excessive speed
                    if (ant.velocity.magnitude() > 8.0) {
                        ant.velocity = ant.velocity.normalize().multiply(8.0);
                    }
                }
            }
        };
        

        
        console.log('About to initialize simulation...');
        this.initialize();
    }
    
    reset() {
        console.log('Resetting simulation...');
        this.stop(); // Stop the current animation loop
        
        // Clear all existing objects
        this.obstacles = [];
        this.foodSources = [];
        this.ants = [];
        
        // Reset simulation state
        this.frameCount = 0;
        this.lastSpawnTime = 0;
        this.nextSpawnInterval = 60 + Math.floor(Math.random() * 120);
        this.startTime = performance.now();
        this.isPaused = false;
        
        // Clear pheromones
        this.pheromoneField.clear();
        
        // Reset nest
        this.nest.foodStored = 0;
        this.nest.isFull = false;
        
        // Create fresh layout
        this.initialize();
    }
    
    restart() {
        console.log('Restarting simulation with preserved positions...');
        
        // Reset simulation state but preserve positions
        this.ants = [];
        this.frameCount = 0;
        this.lastSpawnTime = 0;
        this.nextSpawnInterval = 60 + Math.floor(Math.random() * 120);

        this.startTime = performance.now();
        this.isPaused = false;
        
        // Clear pheromones
        this.pheromoneField.clear();
        
        // Reset food amounts but keep positions
        for (let food of this.foodSources) {
            food.amount = food.originalAmount;
        }
        
        // Reset nest storage
        this.nest.foodStored = 0;
        this.nest.isFull = false;
        
        // Create new ants
        for (let i = 0; i < this.antCount; i++) {
            let validPosition = false;
            let attempts = 0;
            let x, y;
            
            while (!validPosition && attempts < 50) {
                const angle = (i / this.antCount) * Math.PI * 2 + Math.random() * 0.5;
                const distance = 15 + Math.random() * 10;
                x = this.nest.x + Math.cos(angle) * distance;
                y = this.nest.y + Math.sin(angle) * distance;
                
                // Check if position is not inside any obstacle
                validPosition = true;
                for (const obstacle of this.obstacles) {
                    const rep = obstacle.repulse(new Vec(x, y));
                    if (rep.dist < 5) { // Minimum safe distance from obstacles
                        validPosition = false;
                        break;
                    }
                }
                attempts++;
            }
            
            const ant = new Ant(x, y, this);
            this.ants.push(ant);
            
            // Select the first green ant (exploring ant) for highlighting
            if (i === 0) {
                this.highlightedGreenAnt = ant;
                console.log('Selected green ant for highlighting and trail observation');
            }
        }
        
        // Give ants varied initial directions
        for (let i = 0; i < this.ants.length; i++) {
            const ant = this.ants[i];
            const angleToNest = ant.position.subtract(new Vec(this.nest.x, this.nest.y)).angle();
            ant.velocity = new Vec(Math.cos(angleToNest + (Math.random() - 0.5) * Math.PI), 
                                 Math.sin(angleToNest + (Math.random() - 0.5) * Math.PI)).multiply(2);
        }
        
        console.log(`Restarted simulation with ${this.ants.length} ants`);
    }
    
    setupDraggableObjects() {
        // Remove existing event listeners to prevent duplicates
        this.canvas.removeEventListener('mousedown', this._handlePointerDown);
        this.canvas.removeEventListener('mousemove', this._handlePointerMove);
        this.canvas.removeEventListener('mouseup', this._handlePointerUp);
        this.canvas.removeEventListener('mouseleave', this._handlePointerUp);
        
        let isDragging = false;
        let draggedFood = null;
        let draggedObstacle = null;
        let draggedNest = null;
        let dragOffset = { x: 0, y: 0 };
        
        // Helper function to get touch or mouse position
        const getPointerPosition = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };
        
        // Helper function to handle pointer down
        const handlePointerDown = (e) => {
            const pos = getPointerPosition(e);
            const mousePos = new Vec(pos.x, pos.y);
            
            // Check for button clicks first
            const resetDistance = Math.sqrt(Math.pow(pos.x - (this.width - 60), 2) + Math.pow(pos.y - 82.5, 2));
            if (resetDistance <= 40) {
                this.triggerButtonPress('reset');
                this.reset();
                console.log('Reset button clicked');
                return;
            }
            
            const pauseDistance = Math.sqrt(Math.pow(pos.x - (this.width - 60), 2) + Math.pow(pos.y - 122.5, 2));
            if (pauseDistance <= 40) {
                this.triggerButtonPress('pause');
                this.isPaused = !this.isPaused;
                console.log('Pause button clicked - simulation paused:', this.isPaused);
                return;
            }
            
            const restartDistance = Math.sqrt(Math.pow(pos.x - (this.width - 60), 2) + Math.pow(pos.y - 162.5, 2));
            if (restartDistance <= 40) {
                this.triggerButtonPress('restart');
                this.restart();
                console.log('Restart button clicked - simulation restarted with preserved positions');
                return;
            }
            
            const sampleDistance = Math.sqrt(Math.pow(pos.x - (this.width - 60), 2) + Math.pow(pos.y - 202.5, 2));
            if (sampleDistance <= 40) {
                this.sampleAntToggle = !this.sampleAntToggle;
                console.log('Sample Ant toggle clicked - highlighting:', this.sampleAntToggle ? 'ON' : 'OFF');
                return;
            }
            

            
            // Check if clicking on a food source
            for (let food of this.foodSources) {
                const distance = Math.sqrt(
                    Math.pow(pos.x - food.pos.x, 2) + 
                    Math.pow(pos.y - food.pos.y, 2)
                );
                
                if (distance <= food.radius) {
                    isDragging = true;
                    draggedFood = food;
                    dragOffset.x = pos.x - food.pos.x;
                    dragOffset.y = pos.y - food.pos.y;
                    this.canvas.style.cursor = 'grabbing';
                    break;
                }
            }
            
            // Check if clicking on an obstacle
            if (!isDragging) {
                for (const obstacle of this.obstacles) {
                    const distance = mousePos.subtract(obstacle.pos).magnitude();
                    if (distance <= obstacle.baseRadius) {
                        isDragging = true;
                        draggedObstacle = obstacle;
                        draggedObstacle.isBeingDragged = true;
                        dragOffset.x = pos.x - obstacle.pos.x;
                        dragOffset.y = pos.y - obstacle.pos.y;
                        this.canvas.style.cursor = 'grabbing';
                        e.preventDefault();
                        break;
                    }
                }
            }
            
            // Check if clicking on the nest
            if (!isDragging) {
                const nestDistance = Math.sqrt(
                    Math.pow(pos.x - this.nest.x, 2) + 
                    Math.pow(pos.y - this.nest.y, 2)
                );
                
                // Nest hitbox: 35 pixels radius (covers the entire nest structure)
                if (nestDistance <= 35) {
                    isDragging = true;
                    draggedNest = this.nest;
                    dragOffset.x = pos.x - this.nest.x;
                    dragOffset.y = pos.y - this.nest.y;
                    this.canvas.style.cursor = 'grabbing';
                    e.preventDefault();
                }
            }
        };
        
        // Helper function to handle pointer move
        const handlePointerMove = (e) => {
            const pos = getPointerPosition(e);
            const mousePos = new Vec(pos.x, pos.y);
                
            if (isDragging && draggedFood) {
                // Update food position
                draggedFood.pos.x = pos.x - dragOffset.x;
                draggedFood.pos.y = pos.y - dragOffset.y;
                
                // Keep food within canvas bounds
                draggedFood.pos.x = Math.max(draggedFood.radius, Math.min(this.width - draggedFood.radius, draggedFood.pos.x));
                draggedFood.pos.y = Math.max(draggedFood.radius, Math.min(this.height - draggedFood.radius, draggedFood.pos.y));
            } else if (isDragging && draggedObstacle) {
                // Update obstacle position
                const newPos = mousePos.subtract(new Vec(dragOffset.x, dragOffset.y));
                const offset = newPos.subtract(draggedObstacle.pos);
                const oldPos = draggedObstacle.pos.clone();
                
                // Update lastPos before changing current position
                draggedObstacle.lastPos = draggedObstacle.pos.clone();
                draggedObstacle.pos = newPos;
                
                // Sweep ants even when simulation is paused
                this.sweepAntsFromMovingObstacle(draggedObstacle);
                
                // Translate blob points instead of regenerating to prevent spinning
                if (draggedObstacle.blob) {
                    for (let point of draggedObstacle.blob) {
                        point.x += offset.x;
                        point.y += offset.y;
                    }
                }
                
                // Sweep ants away from the moving obstacle path (not just final position)
                this.sweepAntsFromObstaclePath(draggedObstacle, newPos);
                
                // Additional check for ants that might have been missed during movement
                const movementDistance = offset.magnitude();
                if (movementDistance > 5) { // Only for significant movements
                    // Check intermediate points along the movement path
                    const steps = Math.ceil(movementDistance / 5); // Check every 5 pixels
                    for (let i = 1; i <= steps; i++) {
                        const t = i / steps;
                        const intermediatePos = oldPos.add(offset.multiply(t));
                        this.sweepAntsFromObstaclePath(draggedObstacle, intermediatePos);
                    }
                }
                
                e.preventDefault();
            } else if (isDragging && draggedNest) {
                // Update nest position
                draggedNest.x = pos.x - dragOffset.x;
                draggedNest.y = pos.y - dragOffset.y;
                
                // Keep nest within canvas bounds (with some margin)
                const nestMargin = 35;
                draggedNest.x = Math.max(nestMargin, Math.min(this.width - nestMargin, draggedNest.x));
                draggedNest.y = Math.max(nestMargin, Math.min(this.height - nestMargin, draggedNest.y));
                
                e.preventDefault();
            } else {
                // Check if hovering over draggable objects for cursor feedback
                let hoveringOverDraggable = false;
                
                // Check food sources
                for (let food of this.foodSources) {
                    const distance = Math.sqrt(
                        Math.pow(pos.x - food.pos.x, 2) + 
                        Math.pow(pos.y - food.pos.y, 2)
                    );
                    if (distance <= food.radius) {
                        hoveringOverDraggable = true;
                        break;
                    }
                }
                
                // Check obstacles
                if (!hoveringOverDraggable) {
                    for (const obstacle of this.obstacles) {
                        const distance = mousePos.subtract(obstacle.pos).magnitude();
                        if (distance <= obstacle.baseRadius) {
                            hoveringOverDraggable = true;
                            break;
                        }
                    }
                }
                
                // Check nest
                if (!hoveringOverDraggable) {
                    const nestDistance = Math.sqrt(
                        Math.pow(pos.x - this.nest.x, 2) + 
                        Math.pow(pos.y - this.nest.y, 2)
                    );
                    if (nestDistance <= 35) {
                        hoveringOverDraggable = true;
                    }
                }
                
                this.canvas.style.cursor = hoveringOverDraggable ? 'grab' : 'default';
            }
        };
        
        // Helper function to handle pointer up
        const handlePointerUp = (e) => {
            if (isDragging) {
                isDragging = false;
                if (draggedObstacle) {
                    draggedObstacle.isBeingDragged = false;
                }
                draggedFood = null;
                draggedObstacle = null;
                draggedNest = null;
                this.canvas.style.cursor = 'default';
            }
        };
        
        // Store handlers as properties so they can be removed later
        this._handlePointerDown = handlePointerDown;
        this._handlePointerMove = handlePointerMove;
        this._handlePointerUp = handlePointerUp;
        
        // Mouse events
        this.canvas.addEventListener('mousedown', this._handlePointerDown);
        this.canvas.addEventListener('mousemove', this._handlePointerMove);
        this.canvas.addEventListener('mouseup', this._handlePointerUp);
        this.canvas.addEventListener('mouseleave', this._handlePointerUp);
        
        // Track mouse position for pause overlay hover
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.mouseX = e.clientX - rect.left;
            this.canvas.mouseY = e.clientY - rect.top;
        });
        
        // Touch events
        this.canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
        this.canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
        this.canvas.addEventListener('touchend', handlePointerUp, { passive: false });
        this.canvas.addEventListener('touchcancel', handlePointerUp, { passive: false });
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            switch(e.key.toLowerCase()) {
                case 'r':
                    this.reset();
                    console.log('Simulation reset (keyboard)');
                    break;
                case 'p':
                    this.isPaused = !this.isPaused;
                    console.log('Simulation paused (keyboard):', this.isPaused);
                    break;
                case 'a':
                    this.antCount = Math.min(this.antCount + 100, this.maxAnts);
                    this.updateAntCount();
                    console.log('Added 100 ants (keyboard), total:', this.antCount);
                    break;
            }
        });
    }
    
    loadPreset(presetName) {
        const preset = this.presets[presetName];
        if (!preset) {
            console.warn(`Preset '${presetName}' not found, using default`);
            return;
        }
        
        console.log(`Loading preset: ${preset.name}`);
        
        // Update simulation parameters
        this.antCount = preset.antCount || this.antCount;
        
        // Clear existing obstacles and food
        this.obstacles = [];
        this.foodSources = [];
        
        // Create obstacles from preset with overlap validation
        for (const obstacleData of preset.obstacles) {
            const obstacle = new Obstacle(obstacleData.x, obstacleData.y);
            obstacle.baseRadius = obstacleData.radius;
            obstacle.blob = makeBlob(obstacleData.x, obstacleData.y, obstacleData.radius, 0.2, 18);
            
            // Check for overlaps with existing obstacles
            let hasOverlap = false;
            for (const existingObstacle of this.obstacles) {
                const distance = obstacle.pos.subtract(existingObstacle.pos).magnitude();
                const minDistance = obstacle.baseRadius + existingObstacle.baseRadius + 20; // 20px buffer
                if (distance < minDistance) {
                    hasOverlap = true;
                    console.warn(`Obstacle overlap detected at (${obstacle.pos.x}, ${obstacle.pos.y}), skipping`);
                    break;
                }
            }
            
            if (!hasOverlap) {
                this.obstacles.push(obstacle);
            }
        }
        
        // Create food sources from preset with overlap validation
        for (const foodData of preset.foodSources) {
            const food = new Food(foodData.x, foodData.y);
            food.amount = foodData.amount;
            food.originalAmount = foodData.amount;
            
            // Check for overlaps with obstacles
            let hasOverlap = false;
            for (const obstacle of this.obstacles) {
                const distance = food.pos.subtract(obstacle.pos).magnitude();
                const minDistance = food.radius + obstacle.baseRadius + 30; // 30px buffer
                if (distance < minDistance) {
                    hasOverlap = true;
                    console.warn(`Food-obstacle overlap detected at (${food.pos.x}, ${food.pos.y}), skipping`);
                    break;
                }
            }
            
            // Check for overlaps with other food sources (temporarily disabled for debugging)
            /*
            if (!hasOverlap) {
                for (const existingFood of this.foodSources) {
                    const distance = food.pos.subtract(existingFood.pos).magnitude();
                    const minDistance = food.radius + existingFood.radius + 20; // Reduced to 20px buffer for preset loading
                    if (distance < minDistance) {
                        hasOverlap = true;
                        console.warn(`Food-food overlap detected at (${food.pos.x}, ${food.pos.y}), skipping`);
                        break;
                    }
                }
            }
            */
            
            if (!hasOverlap) {
                this.foodSources.push(food);
                console.log(`Added food source ${this.foodSources.length}: (${food.pos.x}, ${food.pos.y})`);
            }
        }
        
        console.log(`Loaded ${this.obstacles.length} obstacles and ${this.foodSources.length} food sources (overlaps filtered out)`);
    }
    
    spawnNewFoodSource() {
        const maxAttempts = 100;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            // Generate random position within canvas bounds with margins
            const margin = 80;
            const x = margin + Math.random() * (this.width - 2 * margin);
            const y = margin + Math.random() * (this.height - 2 * margin);
            
            const newFood = new Food(x, y);
            
            // Check for overlaps with obstacles
            let hasOverlap = false;
            for (const obstacle of this.obstacles) {
                const distance = newFood.pos.subtract(obstacle.pos).magnitude();
                const minDistance = newFood.radius + obstacle.baseRadius + 30; // 30px buffer
                if (distance < minDistance) {
                    hasOverlap = true;
                    break;
                }
            }
            
            // Check for overlaps with existing food sources
            if (!hasOverlap) {
                for (const existingFood of this.foodSources) {
                    const distance = newFood.pos.subtract(existingFood.pos).magnitude();
                    const minDistance = newFood.radius + existingFood.radius + 40; // 40px buffer
                    if (distance < minDistance) {
                        hasOverlap = true;
                        break;
                    }
                }
            }
            
            // Check for overlaps with nest
            if (!hasOverlap) {
                const distance = newFood.pos.subtract(new Vec(this.nest.x, this.nest.y)).magnitude();
                const minDistance = newFood.radius + this.nest.radius + 120; // Increased to 120px buffer
                if (distance < minDistance) {
                    hasOverlap = true;
                }
            }
            
            // If no overlaps, add the new food source
            if (!hasOverlap) {
                this.foodSources.push(newFood);
                console.log(`New food source spawned at (${Math.floor(x)}, ${Math.floor(y)})`);
                return;
            }
            
            attempts++;
        }
        
        console.warn('Could not find non-overlapping position for new food source');
    }
    
    // Preset management methods
    loadSavedPresets() {
        try {
            const savedPresets = localStorage.getItem('customPresets');
            if (savedPresets) {
                this.presets = JSON.parse(savedPresets);
                console.log('Loaded saved presets:', Object.keys(this.presets));
            }
        } catch (error) {
            console.error('Error loading saved presets:', error);
        }
    }
    
    savePreset(presetName, presetData) {
        try {
            this.presets[presetName] = presetData;
            localStorage.setItem('customPresets', JSON.stringify(this.presets));
            console.log(`Saved preset: ${presetName}`);
            return true;
        } catch (error) {
            console.error('Error saving preset:', error);
            return false;
        }
    }
    
    deletePreset(presetName) {
        try {
            delete this.presets[presetName];
            localStorage.setItem('customPresets', JSON.stringify(this.presets));
            console.log(`Deleted preset: ${presetName}`);
            return true;
        } catch (error) {
            console.error('Error deleting preset:', error);
            return false;
        }
    }
    
    saveCurrentLayoutAsPreset() {
        const presetName = prompt('Enter a name for this preset:');
        if (!presetName || presetName.trim() === '') return;
        
        const presetData = {
            name: presetName.trim(),
            description: "Custom preset created from current layout",
            antCount: this.antCount,
            obstacles: this.obstacles.map(obs => ({
                x: obs.pos.x,
                y: obs.pos.y,
                radius: obs.baseRadius
            })),
            foodSources: this.foodSources.map(food => ({
                x: food.pos.x,
                y: food.pos.y,
                amount: food.amount
            }))
        };
        
        if (this.savePreset(presetName.trim(), presetData)) {
            alert(`Preset "${presetName}" saved successfully!`);
        } else {
            alert('Failed to save preset.');
        }
    }
    
    exportCurrentPreset() {
        if (!this.currentPreset || !this.presets[this.currentPreset]) {
            alert('No preset currently loaded to export.');
            return;
        }
        
        const presetData = this.presets[this.currentPreset];
        const exportData = {
            name: presetData.name,
            description: presetData.description,
            antCount: presetData.antCount,
            obstacles: presetData.obstacles,
            foodSources: presetData.foodSources
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `${presetData.name.replace(/\s+/g, '_')}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        alert(`Preset "${presetData.name}" exported successfully!`);
    }
    
    deleteCurrentPreset() {
        if (!this.currentPreset || !this.presets[this.currentPreset]) {
            alert('No preset currently loaded to delete.');
            return;
        }
        
        const presetName = this.presets[this.currentPreset].name;
        if (confirm(`Are you sure you want to delete preset "${presetName}"?`)) {
            if (this.deletePreset(this.currentPreset)) {
                this.currentPreset = null;
                alert(`Preset "${presetName}" deleted successfully!`);
            } else {
                alert('Failed to delete preset.');
            }
        }
    }
    
    createDefaultLayout() {
        // Create some random obstacles with overlap checking
        for (let i = 0; i < 30; i++) {
            let attempts = 0;
            let obstacle = null;
            
            while (attempts < 100) {
                obstacle = new Obstacle(
                    Math.random() * (this.width - 200) + 100,
                    Math.random() * (this.height - 200) + 100,
                    Math.random() * 350 + 50 // Random radius between 50-400
                );
                
                // Check for overlaps with existing obstacles
                let hasOverlap = false;
                for (const existingObstacle of this.obstacles) {
                    const distance = new Vec(obstacle.pos.x, obstacle.pos.y).subtract(existingObstacle.pos).magnitude();
                    const minDistance = obstacle.baseRadius + existingObstacle.baseRadius + 20; // 20px buffer
                    if (distance < minDistance) {
                        hasOverlap = true;
                        break;
                    }
                }
                
                if (!hasOverlap) {
                    break;
                }
                attempts++;
            }
            
            if (obstacle) {
                this.obstacles.push(obstacle);
            }
        }
        
        // Create some random food sources with overlap checking
        const numFoodSources = Math.floor(Math.random() * 3) + 4; // Random number between 4-6
        for (let i = 0; i < numFoodSources; i++) {
            let attempts = 0;
            let food = null;
            
            while (attempts < 100) {
                food = new Food(
                    Math.random() * (this.width - 200) + 100,
                    Math.random() * (this.height - 200) + 100,
                    Math.floor(Math.random() * 300) + 200 // Random amount between 200-500
                );
                
                // Check for overlaps with obstacles
                let hasOverlap = false;
                for (const obstacle of this.obstacles) {
                    const distance = new Vec(food.pos.x, food.pos.y).subtract(obstacle.pos).magnitude();
                    const minDistance = food.radius + obstacle.baseRadius + 30; // 30px buffer
                    if (distance < minDistance) {
                        hasOverlap = true;
                        break;
                    }
                }
                
                // Check for overlaps with existing food sources
                if (!hasOverlap) {
                    for (const existingFood of this.foodSources) {
                        const distance = new Vec(food.pos.x, food.pos.y).subtract(existingFood.pos).magnitude();
                        const minDistance = food.radius + existingFood.radius + 20; // 20px buffer
                        if (distance < minDistance) {
                            hasOverlap = true;
                            break;
                        }
                    }
                }
                
                // Check distance from nest (avoid placing food too close to nest)
                if (!hasOverlap) {
                    const distanceFromNest = new Vec(food.pos.x, food.pos.y).subtract(new Vec(this.nest.x, this.nest.y)).magnitude();
                    const minDistanceFromNest = food.radius + this.nest.radius + 400; // 400px buffer from nest
                    if (distanceFromNest < minDistanceFromNest) {
                        hasOverlap = true;
                    }
                }
                
                if (!hasOverlap) {
                    break;
                }
                attempts++;
            }
            
            if (food) {
                this.foodSources.push(food);
            }
        }
        
        console.log('Created default layout with', this.obstacles.length, 'obstacles and', this.foodSources.length, 'food sources');
    }
    
    initialize() {
        // Initialize pheromone field
        this.pheromoneField = new PheromoneField(this.width, this.height, 6);
        
        // Load preset if specified
        if (this.currentPreset && this.presets[this.currentPreset]) {
            this.loadPreset(this.currentPreset);
        } else {
            // Create default random layout if no preset is loaded
            this.createDefaultLayout();
        }
        
        // Place single nest with improved overlap validation
        const nestMargin = 100;
        let nestPlaced = false;
        let attempts = 0;
        
        // Try multiple placement strategies
        const placementStrategies = [
            // Strategy 1: Center area
            () => ({
                x: this.width / 2 + (Math.random() - 0.5) * 200,
                y: this.height / 2 + (Math.random() - 0.5) * 200
            }),
            // Strategy 2: Top-left area
            () => ({
                x: nestMargin + Math.random() * 200,
                y: nestMargin + Math.random() * 200
            }),
            // Strategy 3: Top-right area
            () => ({
                x: this.width - nestMargin - Math.random() * 200,
                y: nestMargin + Math.random() * 200
            }),
            // Strategy 4: Bottom-left area
            () => ({
                x: nestMargin + Math.random() * 200,
                y: this.height - nestMargin - Math.random() * 200
            }),
            // Strategy 5: Bottom-right area
            () => ({
                x: this.width - nestMargin - Math.random() * 200,
                y: this.height - nestMargin - Math.random() * 200
            }),
            // Strategy 6: Random position
            () => ({
                x: nestMargin + Math.random() * (this.width - 2 * nestMargin),
                y: nestMargin + Math.random() * (this.height - 2 * nestMargin)
            })
        ];
        
        for (const strategy of placementStrategies) {
            for (let attempt = 0; attempt < 50; attempt++) {
                const pos = strategy();
                
                // Keep nest within bounds
                this.nest.x = Math.max(nestMargin, Math.min(this.width - nestMargin, pos.x));
                this.nest.y = Math.max(nestMargin, Math.min(this.height - nestMargin, pos.y));
                
                // Check for overlaps with obstacles
                let hasOverlap = false;
                for (const obstacle of this.obstacles) {
                    const distance = new Vec(this.nest.x, this.nest.y).subtract(obstacle.pos).magnitude();
                    const minDistance = this.nest.radius + obstacle.baseRadius + 80; // Increased buffer
                    if (distance < minDistance) {
                        hasOverlap = true;
                        break;
                    }
                }
                
                // Check for overlaps with food sources
                if (!hasOverlap) {
                    for (const food of this.foodSources) {
                        const distance = new Vec(this.nest.x, this.nest.y).subtract(food.pos).magnitude();
                        const minDistance = this.nest.radius + food.radius + 120; // 120px buffer
                        if (distance < minDistance) {
                            hasOverlap = true;
                            break;
                        }
                    }
                }
                
                if (!hasOverlap) {
                    nestPlaced = true;
                    console.log(`Nest placed successfully using strategy ${placementStrategies.indexOf(strategy) + 1}`);
                    break;
                }
            }
            
            if (nestPlaced) break;
        }
        
        if (!nestPlaced) {
            console.warn('Could not find non-overlapping nest position, using emergency placement');
            // Emergency placement: find the least crowded area
            let bestX = this.width / 2;
            let bestY = this.height / 2;
            let minOverlap = Infinity;
            
            for (let x = nestMargin; x < this.width - nestMargin; x += 50) {
                for (let y = nestMargin; y < this.height - nestMargin; y += 50) {
                    let totalOverlap = 0;
                    
                    for (const obstacle of this.obstacles) {
                        const distance = new Vec(x, y).subtract(obstacle.pos).magnitude();
                        const minDistance = this.nest.radius + obstacle.baseRadius;
                        if (distance < minDistance) {
                            totalOverlap += (minDistance - distance);
                        }
                    }
                    
                    if (totalOverlap < minOverlap) {
                        minOverlap = totalOverlap;
                        bestX = x;
                        bestY = y;
                    }
                }
            }
            
            this.nest.x = bestX;
            this.nest.y = bestY;
            console.log(`Emergency nest placement at (${bestX}, ${bestY}) with ${minOverlap.toFixed(1)} overlap`);
        }
        
        console.log(`Single nest placed at (${this.nest.x.toFixed(0)}, ${this.nest.y.toFixed(0)})`);
        
        // Calculate nest capacity based on total food available
        let totalFoodAvailable = 0;
        for (const food of this.foodSources) {
            totalFoodAvailable += food.originalAmount;
        }
        this.nest.maxCapacity = totalFoodAvailable;
        console.log(`Nest capacity set to ${totalFoodAvailable} (total food available)`);
        console.log(`Loaded ${this.foodSources.length} food sources and ${this.obstacles.length} obstacles from preset`);
        
        // Create ants for single colony
        this.ants = [];
        for (let i = 0; i < this.antCount; i++) {
            // Create ants in a wider area around the nest
            let validPosition = false;
            let attempts = 0;
            let x, y;
            
            while (!validPosition && attempts < 50) {
                const angle = (i / this.antCount) * Math.PI * 2 + Math.random() * 0.5;
                const distance = 15 + Math.random() * 10;
                x = this.nest.x + Math.cos(angle) * distance;
                y = this.nest.y + Math.sin(angle) * distance;
                
                // Check if position is not inside any obstacle
                validPosition = true;
                for (const obstacle of this.obstacles) {
                    const rep = obstacle.repulse(new Vec(x, y));
                    if (rep.dist < 5) { // Minimum safe distance from obstacles
                        validPosition = false;
                        break;
                    }
                }
                attempts++;
            }
            
            const ant = new Ant(x, y, this);
            this.ants.push(ant);
            
            // Select the first ant for highlighting
            if (i === 0) {
                this.highlightedGreenAnt = ant;
                console.log('Selected ant for highlighting and trail observation in initialize()');
            }
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
        console.log('Simulation initialized');
        this.start();
    }
    

    

    
    updateAntCount() {
        const currentCount = this.ants.length;
        if (this.antCount > currentCount) {
            // Add more ants with proper initialization
            for (let i = currentCount; i < this.antCount; i++) {
                let validPosition = false;
                let attempts = 0;
                let x, y;
                
                while (!validPosition && attempts < 50) {
                    const angle = Math.random() * Math.PI * 2;
                    const distance = 15 + Math.random() * 10;
                    x = this.nest.x + Math.cos(angle) * distance;
                    y = this.nest.y + Math.sin(angle) * distance;
                    
                    // Check if position is not inside any obstacle
                    validPosition = true;
                    for (const obstacle of this.obstacles) {
                        const rep = obstacle.repulse(new Vec(x, y));
                        if (rep.dist < 5) { // Minimum safe distance from obstacles
                            validPosition = false;
                            break;
                        }
                    }
                    attempts++;
                }
                
                const newAnt = new Ant(x, y, this);
                newAnt.velocity = Vec.random().multiply(2);
                this.ants.push(newAnt);
                
                // If no highlighted ant exists, select this one
                if (!this.highlightedGreenAnt) {
                    this.highlightedGreenAnt = newAnt;
                    console.log('Selected new ant for highlighting in updateAntCount()');
                }
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
                    let validPosition = false;
                    let attempts = 0;
                    let x, y;
                    
                    while (!validPosition && attempts < 50) {
                        const angle = Math.random() * Math.PI * 2;
                        const distance = 10 + Math.random() * 15;
                        x = this.nest.x + Math.cos(angle) * distance;
                        y = this.nest.y + Math.sin(angle) * distance;
                        
                        // Check if position is not inside any obstacle
                        validPosition = true;
                        for (const obstacle of this.obstacles) {
                            const rep = obstacle.repulse(new Vec(x, y));
                            if (rep.dist < 5) { // Minimum safe distance from obstacles
                                validPosition = false;
                                break;
                            }
                        }
                        attempts++;
                    }
                    
                    const newAnt = new Ant(x, y, this);
                    newAnt.velocity = Vec.random().multiply(2);
                    this.ants.push(newAnt);
                }
                            console.log(`EMERGENCY: Spawned ${emergencySpawn} ants! Population: ${this.ants.length}/${targetPopulation}`);
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
                    let validPosition = false;
                    let attempts = 0;
                    let x, y;
                    
                    while (!validPosition && attempts < 50) {
                        const angle = Math.random() * Math.PI * 2;
                        const distance = 10 + Math.random() * 15;
                        x = this.nest.x + Math.cos(angle) * distance;
                        y = this.nest.y + Math.sin(angle) * distance;
                        
                        // Check if position is not inside any obstacle
                        validPosition = true;
                        for (const obstacle of this.obstacles) {
                            const rep = obstacle.repulse(new Vec(x, y));
                            if (rep.dist < 5) { // Minimum safe distance from obstacles
                                validPosition = false;
                                break;
                            }
                        }
                        attempts++;
                    }
                    
                    const newAnt = new Ant(x, y, this);
                    newAnt.velocity = Vec.random().multiply(2);
                    this.ants.push(newAnt);
                }
                
                                    if (antsToSpawn > 0) {
                    console.log(`Spawned ${antsToSpawn} ants. Population: ${this.ants.length}/${targetPopulation}`);
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
        // Check if simulation is paused
        if (this.isPaused) {
            return; // Don't update anything when paused
        }
        
        this.frameCount++;
        
        // Update button press animations
        Object.keys(this.buttonPressTimers).forEach(buttonName => {
            if (this.buttonPressTimers[buttonName] > 0) {
                this.buttonPressTimers[buttonName]--;
                if (this.buttonPressTimers[buttonName] === 0) {
                    this.buttonPressStates[buttonName] = false;
                }
            }
        });
        
        // Update all ants and remove dead ones
        this.ants = this.ants.filter(ant => {
            ant.update();
            return ant.isAlive; // Keep only alive ants
        });
        
        // Continuous collision check to prevent ants from getting trapped inside obstacles
        this.checkAndFixTrappedAnts();
        
        // Spawn new ants to maintain population (disabled for immortal ants)
        // this.spawnNewAnts();
        
        // Check for depleted food sources and spawn new ones
        for (let i = this.foodSources.length - 1; i >= 0; i--) {
            const food = this.foodSources[i];
            
            // Remove depleted food sources
            if (food.amount <= 0) {
                this.foodSources.splice(i, 1);
                console.log(`Food source depleted and removed`);
                
                // Spawn a new food source at random location
                this.spawnNewFoodSource();
            }
        }
        
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
        
        // Draw ants (lower level)
        this.drawAnts();
        
        // Draw food sources (higher level)
        this.drawFoodSources();
        
        // Draw nest (higher level)
        this.drawNest();
        
        // Draw debug info
        this.drawDebugInfo();
        
        // Draw pause overlay if paused
        if (this.isPaused) {
            this.drawPauseIndicator();
        }
    }
    
    drawPauseIndicator() {
        // Semi-transparent overlay - more prominent dimming
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Check if mouse is hovering over the pause text area
        const mouseX = this.canvas.mouseX || 0;
        const mouseY = this.canvas.mouseY || 0;
        const textArea = {
            x: this.width / 2 - 150,
            y: this.height / 2 - 100,
            width: 300,
            height: 200
        };
        
        // Calculate distance from center of text area for gradual transition
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const distance = Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2));
        const maxDistance = 150; // Distance at which full transparency starts
        
        // Gradual transparency based on distance from center
        let textAlpha = 1.0;
        if (distance < maxDistance) {
            const transparencyFactor = distance / maxDistance;
            textAlpha = 0.08 + (transparencyFactor * 0.92); // Range from 0.08 to 1.0
        } else {
            textAlpha = 1.0; // Fully opaque when far from center
        }
        
        this.ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
        this.ctx.font = 'bold 48px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('PAUSED', this.width / 2, this.height / 2 - 60);
        
        // Instructions - more transparent when hovering
        this.ctx.font = 'bold 24px Arial, sans-serif';
        this.ctx.fillText('Press P to resume', this.width / 2, this.height / 2 - 20);
        this.ctx.fillText('Obstacles, apples, and nest can be moved', this.width / 2, this.height / 2 + 20);
    }
    
    

    

    

    
    drawPheromones() {
        const cell = this.pheromoneField.cell;
        
        // Draw pheromones for single colony - OPTIMIZED: Only draw cells with pheromones
        for (let x = 0; x < this.pheromoneField.gridW; x++) {
            for (let y = 0; y < this.pheromoneField.gridH; y++) {
                const homeStr = this.pheromoneField.home[x][y];
                const foodStr = this.pheromoneField.food[x][y];
                const success = this.pheromoneField.pathSuccess[x][y];
                
                // Only process cells that have actual pheromone values (performance optimization)
                if (homeStr > 2 || foodStr > 2) {
                    // Draw home trails (scouting trails for exploring ants)
                    if (homeStr > 2) {
                        const alpha = Math.min(0.6, homeStr / 100);
                        const scoutingColor = hexToRgb(this.scoutingTrailColor || '#404040');
                        this.ctx.fillStyle = `rgba(${scoutingColor.r}, ${scoutingColor.g}, ${scoutingColor.b}, ${alpha})`;
                        this.ctx.fillRect(x * cell, y * cell, cell, cell);
                    }
                    
                    // Draw food trails (returning ants with single color)
                    if (foodStr > 2) {
                        const alpha = Math.min(1.0, (foodStr + success) / 80);
                        const strength = Math.min(1.0, (foodStr + success) / 200);
                        
                        // Apply non-linear mapping for better distribution
                        const mappedStrength = Math.pow(strength, 0.7); // More gradual transition
                        
                        const returningColor = hexToRgb(this.returningTrailColor);
                        const finalAlpha = alpha * mappedStrength;
                        
                        this.ctx.fillStyle = `rgba(${returningColor.r}, ${returningColor.g}, ${returningColor.b}, ${finalAlpha})`;
                        this.ctx.fillRect(x * cell, y * cell, cell, cell);
                    }
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
        
        // Draw shadow first
        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        this.ctx.shadowBlur = 12;
        this.ctx.shadowOffsetX = 4;
        this.ctx.shadowOffsetY = 4;
        
        // Draw house body with shadow
        this.ctx.fillStyle = this.nestColor; // Customizable nest color
        this.ctx.fillRect(-30, -20, 60, 40);
        
        // Draw roof with shadow
        this.ctx.beginPath();
        this.ctx.moveTo(-35, -20);
        this.ctx.lineTo(0, -45);
        this.ctx.lineTo(35, -20);
        this.ctx.closePath();
        this.ctx.fillStyle = this.nestColor; // Customizable nest color
        this.ctx.fill();
        
        this.ctx.restore(); // Remove shadow for remaining elements
        
        // Draw house body again (without shadow)
        this.ctx.fillStyle = this.nestColor; // Customizable nest color
        this.ctx.fillRect(-30, -20, 60, 40);
        
        // Draw roof again (without shadow)
        this.ctx.beginPath();
        this.ctx.moveTo(-35, -20);
        this.ctx.lineTo(0, -45);
        this.ctx.lineTo(35, -20);
        this.ctx.closePath();
        this.ctx.fillStyle = this.nestColor; // Customizable nest color
        this.ctx.fill();
        
        // Draw unified outline for the entire nest (no separation between roof and wall)
        // Create brighter version of nest color for outline
        const nestColorRgb = hexToRgb(this.nestColor);
        const brighterR = Math.min(255, nestColorRgb.r + 60);
        const brighterG = Math.min(255, nestColorRgb.g + 60);
        const brighterB = Math.min(255, nestColorRgb.b + 60);
        this.ctx.strokeStyle = `rgba(${brighterR}, ${brighterG}, ${brighterB}, 0.9)`;
        this.ctx.lineWidth = 4;
        
        // Draw single outline for the entire nest shape
        this.ctx.beginPath();
        // Start from top of roof
        this.ctx.moveTo(0, -45);
        // Draw left side of roof
        this.ctx.lineTo(-35, -20);
        // Draw left wall
        this.ctx.lineTo(-30, -20);
        this.ctx.lineTo(-30, 20);
        // Draw bottom
        this.ctx.lineTo(30, 20);
        // Draw right wall
        this.ctx.lineTo(30, -20);
        // Draw right side of roof
        this.ctx.lineTo(35, -20);
        // Close the path back to top
        this.ctx.lineTo(0, -45);
        this.ctx.stroke();
        
        // Carve out door (completely transparent opening)
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillRect(-12, 0, 24, 22);
        this.ctx.globalCompositeOperation = 'source-over';
        
        // Draw door outline (without bottom line)
        this.ctx.beginPath();
        this.ctx.moveTo(-12, 0);  // Top left
        this.ctx.lineTo(12, 0);   // Top right
        this.ctx.moveTo(12, 0);   // Right side
        this.ctx.lineTo(12, 22);  // Right side
        this.ctx.moveTo(-12, 0);  // Left side
        this.ctx.lineTo(-12, 22); // Left side
        this.ctx.stroke();
        

        

        

        
        this.ctx.restore();
    }
    

    
    drawAnts() {
        console.log(`Drawing ${this.ants.length} ants`);
        
        // Debug: Check highlighted ant status
        if (this.highlightedGreenAnt) {
            console.log(`Highlighted ant: hasFood=${this.highlightedGreenAnt.hasFood}, position=(${Math.floor(this.highlightedGreenAnt.position.x)}, ${Math.floor(this.highlightedGreenAnt.position.y)}), path length=${this.highlightedGreenAnt.path ? this.highlightedGreenAnt.path.length : 0}`);
        } else {
            console.log('No highlighted ant found');
        }
        
        // Draw highlighted ant trail first (if exists and toggle is ON)
        if (this.highlightedGreenAnt && this.sampleAntToggle) {
            this.drawHighlightedAntTrail();
        }
        
        for (let ant of this.ants) {
            this.ctx.save();
            this.ctx.translate(ant.position.x, ant.position.y);
            
            const dir = ant.velocity.magnitude() > 0 ? ant.velocity.normalize() : new Vec(1, 0);
            const angle = Math.atan2(dir.y, dir.x);
            this.ctx.rotate(angle);
            
            // Fixed size for all ants
            let size = 5;
            
            // Make highlighted ant smaller for better visibility
            if (ant === this.highlightedGreenAnt && this.sampleAntToggle) {
                size = size * 0.7; // 30% smaller
            }
            
            this.ctx.beginPath();
            this.ctx.moveTo(size, 0);
            this.ctx.lineTo(-size * 0.6, size * 0.6);
            this.ctx.lineTo(-size * 0.6, -size * 0.6);
            this.ctx.closePath();
            
            // Color based on food status - returning ants use antColor, exploring ants use nestColor
            let baseColor = ant.hasFood ? this.antColor : this.nestColor;
            
            this.ctx.fillStyle = baseColor;
            this.ctx.fill();
            
            // Highlight the selected ant with yellow glow (only when toggle is ON)
            if (ant === this.highlightedGreenAnt && this.sampleAntToggle) {
                // Yellow glow effect
                this.ctx.shadowColor = '#ffff00';
                this.ctx.shadowBlur = 8;
                this.ctx.shadowOffsetX = 0;
                this.ctx.shadowOffsetY = 0;
                this.ctx.strokeStyle = '#ffff00'; // Bright yellow outline
                this.ctx.lineWidth = 2;
            } else {
                this.ctx.shadowColor = 'transparent';
                this.ctx.shadowBlur = 0;
            this.ctx.strokeStyle = '#222';
            this.ctx.lineWidth = 1;
            }
            this.ctx.stroke();
            
            // Visual feedback for escape mode
            if (ant.escapeMode) {
                // Pulsing red outline for escape mode
                const pulseIntensity = 0.5 + 0.5 * Math.sin(performance.now() * 0.01);
                this.ctx.strokeStyle = `rgba(255, 0, 0, ${pulseIntensity})`;
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
                
                // Red glow effect
                this.ctx.shadowColor = 'red';
                this.ctx.shadowBlur = 10;
                this.ctx.stroke();
                this.ctx.shadowBlur = 0;
            }
            

            
            this.ctx.restore();
        }
    }
    
    drawHighlightedAntTrail() {
        if (!this.highlightedGreenAnt || !this.sampleAntToggle) return;
        
        // Draw yellow trail for highlighted ant (regardless of food status)
                this.ctx.save();
        
        // Enhanced yellow glow effect for trail
        this.ctx.shadowColor = '#ffff00';
        this.ctx.shadowBlur = 12; // Increased glow
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)'; // Semi-transparent yellow
        this.ctx.lineWidth = 1;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Draw entire path since initialization (no limit)
        if (this.highlightedGreenAnt.path && this.highlightedGreenAnt.path.length > 1) {
                this.ctx.beginPath();
            
            // Start from the very beginning of the path
            this.ctx.moveTo(this.highlightedGreenAnt.path[0].x, this.highlightedGreenAnt.path[0].y);
            
            // Draw the entire path
            for (let i = 1; i < this.highlightedGreenAnt.path.length; i++) {
                this.ctx.lineTo(this.highlightedGreenAnt.path[i].x, this.highlightedGreenAnt.path[i].y);
            }
            
            this.ctx.stroke();
            }
            
            this.ctx.restore();
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
        this.ctx.save();
        // Shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        // Rounded rectangle background - larger size with press animation
        this.ctx.fillStyle = this.buttonPressStates.reset ? '#e69500' : '#ff6b00';
        const resetY = this.buttonPressStates.reset ? 67 : 65;
        this.roundRect(this.width - 110, resetY, 100, 35, 18);
        this.ctx.fill();
        
        // Bold white outline
        this.ctx.shadowColor = 'transparent';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Text - white, bold, larger font with shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const resetTextY = this.buttonPressStates.reset ? 84.5 : 82.5;
        this.ctx.fillText('RESET', this.width - 60, resetTextY);
        this.ctx.restore();
        
        // Draw pause button under reset button
        this.ctx.save();
        // Shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        // Rounded rectangle background - larger size with press animation
        this.ctx.fillStyle = this.buttonPressStates.pause ? '#e69500' : '#ff6b00';
        const pauseY = this.buttonPressStates.pause ? 107 : 105;
        this.roundRect(this.width - 110, pauseY, 100, 35, 18);
        this.ctx.fill();
        
        // Bold white outline
        this.ctx.shadowColor = 'transparent';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Text - white, bold, larger font with shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const pauseTextY = this.buttonPressStates.pause ? 124.5 : 122.5;
        this.ctx.fillText('PAUSE', this.width - 60, pauseTextY);
        this.ctx.restore();
        
        // Draw restart button under pause button
        this.ctx.save();
        // Shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        // Rounded rectangle background - larger size with press animation
        this.ctx.fillStyle = this.buttonPressStates.restart ? '#e69500' : '#ff6b00';
        const restartY = this.buttonPressStates.restart ? 147 : 145;
        this.roundRect(this.width - 110, restartY, 100, 35, 18);
        this.ctx.fill();
        
        // Bold white outline
        this.ctx.shadowColor = 'transparent';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Text - white, bold, larger font with shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const restartTextY = this.buttonPressStates.restart ? 164.5 : 162.5;
        this.ctx.fillText('RESTART', this.width - 60, restartTextY);
        this.ctx.restore();
        
        // Draw Ant toggle switch under restart button
        this.ctx.save();
        
        // Shadow - same as other buttons
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        
        // Rounded rectangle background - same size and style as other buttons
        this.ctx.fillStyle = '#ff6b00'; // Same orange as other buttons
        const sampleY = 185;
        this.roundRect(this.width - 110, sampleY, 100, 35, 18);
        this.ctx.fill();
        
        // Bold white outline - same as other buttons
        this.ctx.shadowColor = 'transparent';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Label text - positioned to the left
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial, sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('ANT', this.width - 100, sampleY + 17.5);
        
        // Draw toggle switch inside the button - positioned to the right
        const switchWidth = 40;
        const switchHeight = 20;
        const switchX = this.width - 55;
        const switchY = sampleY + 7.5;
        
        // Toggle switch background (track)
        this.ctx.fillStyle = this.sampleAntToggle ? '#4CAF50' : '#ccc';
        this.roundRect(switchX, switchY, switchWidth, switchHeight, switchHeight / 2);
        this.ctx.fill();
        
        // Toggle switch border
        this.ctx.strokeStyle = '#999';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // Toggle switch knob (slider)
        const knobSize = switchHeight - 4;
        const knobX = this.sampleAntToggle ? switchX + switchWidth - knobSize - 2 : switchX + 2;
        const knobY = switchY + 2;
        
        // Knob shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        
        // Knob background
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(knobX + knobSize/2, knobY + knobSize/2, knobSize/2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Knob border
        this.ctx.shadowColor = 'transparent';
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        this.ctx.restore();
        

        
        // Draw stats
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial, sans-serif';
        this.ctx.textAlign = 'left';
        

        
        // Count ants in escape mode
        let escapeModeCount = 0;
        for (let ant of this.ants) {
            if (ant.escapeMode) {
                escapeModeCount++;
            }
        }
        if (escapeModeCount > 0) {
            this.ctx.fillStyle = '#ff0000';
            this.ctx.fillText(`Escape Mode: ${escapeModeCount} ants`, 10, 105);
            this.ctx.fillStyle = '#ffffff';
        }
        

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
        

        

    }
    
    start() {
        console.log('Starting ant foraging simulation...');
        console.log('Ants array length:', this.ants ? this.ants.length : 'undefined');
        if (this.ants && this.ants.length > 0) {
            console.log(`Initial ant positions:`, this.ants.map(ant => ({x: ant.position.x, y: ant.position.y})));
        }
        
        // Stop any existing animation loop
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        // Performance monitoring
        let frameCount = 0;
        let lastFPS = 0;
        let lastTime = performance.now();
        
        const animate = (currentTime) => {
            try {
                // Remove frame rate limiting for smooth animations
                    this.update();
                    this.draw();
                    
                    // Performance monitoring
                    frameCount++;
                    if (currentTime - lastTime >= 1000) {
                        lastFPS = frameCount;
                        frameCount = 0;
                    lastTime = currentTime;
                        console.log(`Performance: ${lastFPS} FPS`);
                }
                
                this.animationId = requestAnimationFrame(animate);
            } catch (error) {
                console.error('Animation error:', error);
            }
        };
        animate();
    }
    
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    // Trigger button press animation
    triggerButtonPress(buttonName) {
        this.buttonPressStates[buttonName] = true;
        this.buttonPressTimers[buttonName] = 10; // Animation duration in frames
    }
}

// Obstacle class with blob-based collision detection
class Obstacle {
    constructor(x, y) {
        this.pos = new Vec(x, y);
        this.lastPos = new Vec(x, y); // Track previous position for sweeping
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
        const pts = this.blob;
        if (pts.length) {
            const mid = (a, b) => new Vec((a.x + b.x) / 2, (a.y + b.y) / 2);
            let prev = pts[pts.length - 1];
            let cur = pts[0];
            
            // Draw shadow first
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;
            ctx.fillStyle = 'rgba(50, 50, 50, 0.95)';
            ctx.beginPath();
            ctx.moveTo((prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
            for (let i = 0; i < pts.length; i++) {
                const next = pts[(i + 1) % pts.length];
                const c = pts[i];
                const m = mid(c, next);
                ctx.quadraticCurveTo(c.x, c.y, m.x, m.y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            
            // Draw main fill
            ctx.fillStyle = 'rgba(50, 50, 50, 0.95)';
            ctx.beginPath();
            ctx.moveTo((prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
            for (let i = 0; i < pts.length; i++) {
                const next = pts[(i + 1) % pts.length];
                const c = pts[i];
                const m = mid(c, next);
                ctx.quadraticCurveTo(c.x, c.y, m.x, m.y);
            }
            ctx.closePath();
            ctx.fill();
            
            // Draw brighter outline
            ctx.strokeStyle = 'rgba(80, 80, 80, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
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
        
        // No buffer - use actual distance for accurate collision detection
        const adjustedDist = minDist;
        
        return { vec: away.normalize(), dist: adjustedDist };
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
        
        // Draw shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        
        // Draw food background (depleted area) with shadow
        ctx.fillStyle = 'rgba(160, 57, 57, 0.3)';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw food amount (filled area) with shadow
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
        ctx.restore();
        
        // Draw stem with shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#5a3d1b';
        ctx.fillRect(-2, -this.radius - 7, 4, 7);
        
        // Draw leaf with shadow
        ctx.fillStyle = '#4f7d4f';
        ctx.beginPath();
        ctx.ellipse(-this.radius * 0.25 - 1, -this.radius - 9, this.radius * 0.3, this.radius * 0.12, Math.PI / 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Draw amount text with shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#fff';
        ctx.font = '700 16px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.amount.toString(), 0, 0);
        ctx.restore();
        
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
        
        // Trapped ant escape mode properties
        this.stuckTime = 0;
        this.lastPosition = this.position.clone();
        this.stuckThreshold = 120; // 2 seconds at 60fps
        this.isStuck = false;
        this.escapeMode = false;
        this.escapeStartTime = 0;
        this.escapeDuration = 300; // 5 seconds
        this.escapeAttempts = 0;
        this.maxEscapeAttempts = 5;
        
        // Enhanced trapped detection
        this.progressHistory = []; // Track progress toward goal
        this.progressThreshold = 30; // Reduced threshold for faster detection
        this.trappedTime = 0;
        this.trappedThreshold = 90; // Reduced to 1.5 seconds of no progress
        this.isTrapped = false;
        this.initialDistanceToGoal = 0; // Distance to goal when starting
        this.lastProgressCheck = 0;
        this.progressCheckInterval = 30; // Check progress every 30 frames (0.5 seconds)
    }
    
    update() {
        // Lifecycle update - check if ant is still alive (disabled for immortal ants)
        // this.age = performance.now() - this.birthTime;
        // this.energy -= this.energyDecayRate;
        
        // Die from old age or exhaustion (disabled for immortal ants)
        // if (this.age > this.lifespan || this.energy <= 0) {
        //     if (this.isAlive) {
        //         this.isAlive = false;
        //         this.deathTime = performance.now();
        //         this.graveEffect = {
        //             startTime: performance.now(),
        //             duration: 10000, // 10 seconds
        //             alpha: 1.0
        //         };
        //         // Increment dead ant counter
        //         this.simulation.deadAntCount++;
        //         console.log(`Ant died at age ${(this.age / 1000).toFixed(1)}s. Total dead: ${this.simulation.deadAntCount}`);
        //     }
        //     return; // Stop updating dead ants
        // }
        

        
        // Slow down when energy is low
        const energyFactor = Math.max(0.3, this.energy / 100);
        this.maxSpeed = 3.0 * energyFactor;
        
        let direction = new Vec(0, 0);
        
        if (this.hasFood) {
            // Returning to nest
            let targetNest = this.simulation.nest;
            const directToNest = new Vec(targetNest.x, targetNest.y).subtract(this.position).normalize();
            const homeGrad = this.simulation.getPheromoneGradient(this.position, 'home');
            const homeStrength = this.simulation.getPheromoneLevel(this.position, 'home');
            
            // Calculate distance to nest
            const nestDistance = this.position.subtract(new Vec(targetNest.x, targetNest.y)).magnitude();
            
                    // Check if in escape mode
            if (this.escapeMode) {
                // Check if escape mode should end (after 5 seconds)
                const escapeElapsed = performance.now() - this.escapeStartTime;
                if (escapeElapsed > 5000) { // 5 seconds
                    this.escapeMode = false;
                    console.log(`Ant exited escape mode after timeout`);
                } else {
                    // Escape mode: move away from nest with much stronger random component
                    const awayFromNest = directToNest.multiply(-1); // Opposite direction
                    direction = awayFromNest.multiply(0.1).add(Vec.random().multiply(0.9)); // 90% random movement
                    
                    // Skip pheromone deposition for escape mode
                    this.skipPheromoneDeposition = true;
                }
            }
            
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
            
            // Deposit food trail with enhanced success tracking (skip if in escape mode)
            if (!this.skipPheromoneDeposition) {
            const tripDuration = performance.now() - this.tripStartTime;
            const efficiency = Math.max(1, 3 - tripDuration / 10000); // Faster trips get higher bonus
            const successBonus = efficiency * (1 + this.path.length * 0.01); // Longer paths get slightly more bonus
            this.simulation.addPheromone(this.position, 'food', 12, successBonus);
            }
            this.skipPheromoneDeposition = false; // Reset flag
            
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
            
            // Check if in escape mode
            if (this.escapeMode) {
                // Check if escape mode should end (after 5 seconds)
                const escapeElapsed = performance.now() - this.escapeStartTime;
                if (escapeElapsed > 5000) { // 5 seconds
                    this.escapeMode = false;
                    console.log(`Ant exited escape mode after timeout`);
                } else {
                    // Escape mode: move randomly with slight bias away from food
                    if (nearestFood) {
                        const awayFromFood = nearestFood.pos.subtract(this.position).normalize().multiply(-1);
                        direction = awayFromFood.multiply(0.2).add(Vec.random().multiply(0.8));
                    } else {
                        direction = Vec.random();
                    }
                    
                    // Skip pheromone deposition for escape mode
                    this.skipPheromoneDeposition = true;
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
            
            // Deposit home trail with exploration bonus (skip if in escape mode)
            if (!this.skipPheromoneDeposition) {
            const explorationBonus = Math.min(2, this.path.length * 0.02); // Longer exploration gets bonus
            this.simulation.addPheromone(this.position, 'home', 6, 1 + explorationBonus);
            }
            this.skipPheromoneDeposition = false; // Reset flag
        }
        
        // Obstacle avoidance - optimized for high-density environments
        let totalAvoidForce = new Vec(0, 0);
        let avoidCount = 0;
        
        for (const obstacle of this.simulation.obstacles) {
            const rep = obstacle.repulse(this.position);
            if (rep.dist < 12) { // Slightly reduced detection range
                const avoidForce = Math.max(0.5, 2 / (rep.dist + 0.1)); // Reduced force for smoother movement
                totalAvoidForce = totalAvoidForce.add(rep.vec.multiply(avoidForce));
                avoidCount++;
            }
        }
        
        // Apply averaged avoidance force for smoother movement
        if (avoidCount > 0) {
            totalAvoidForce = totalAvoidForce.multiply(1 / avoidCount); // Average the forces
            direction = direction.add(totalAvoidForce.multiply(0.8)); // Reduced influence
        }
        
        // Normalize direction
        if (direction.magnitude() > 0) {
            direction = direction.normalize();
        } else {
            direction = Vec.random();
        }
        
        // Apply momentum - increased for stability
        const momentumStrength = this.hasFood ? 0.4 : 0.5; // Increased red ant momentum for stability
        this.momentum = this.momentum.multiply(0.7).add(direction.multiply(0.3));
        direction = direction.multiply(1 - momentumStrength).add(this.momentum.multiply(momentumStrength));
        direction = direction.normalize();
        
        // Smoother turning - copy red ant behavior
        if (this.velocity.magnitude() > 0) {
            const currentDir = this.velocity.normalize();
            const maxTurn = this.hasFood ? 0.3 : 0.4; // Reduced red ant turn limit for smoother movement
            const dot = Math.max(-1, Math.min(1, currentDir.dot(direction)));
            const angle = Math.acos(dot);
            
            if (angle > maxTurn) {
                const t = maxTurn / angle;
                direction = currentDir.multiply(1-t).add(direction.multiply(t)).normalize();
            }
        }

        // Apply smooth velocity changes with momentum - copy red ant behavior
        const targetSpeed = this.hasFood ? 2.5 : 3.0; // Red ant speed logic
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
        
        // Limit maximum speed to prevent tunneling
        const maxAllowedSpeed = this.maxSpeed * 1.5; // Allow some extra speed for emergency situations
        if (this.velocity.magnitude() > maxAllowedSpeed) {
            this.velocity = this.velocity.normalize().multiply(maxAllowedSpeed);
        }

        // Calculate new position
        let newPos = this.position.add(this.velocity);
        
        // Obstacle collision detection - smoother for high-density environments
        for (const obstacle of this.simulation.obstacles) {
            const rep = obstacle.repulse(newPos);
            if (rep.dist < 3) { // Reduced collision range for smoother movement
                // Smoother bounce off obstacle
                this.velocity = rep.vec.multiply(1.0); // Reduced bounce force
                newPos = this.position.add(this.velocity);
                break;
            }
        }
        
        // Emergency: Throw out ants that are inside obstacles
        for (const obstacle of this.simulation.obstacles) {
            const rep = obstacle.repulse(this.position);
            if (rep.dist < 0.5) { // Ant is inside obstacle
                // Calculate safe position outside obstacle
                const safeDistance = obstacle.baseRadius + 10; // 10px buffer
                const awayDirection = rep.vec.normalize();
                const safePosition = new Vec(
                    obstacle.pos.x + awayDirection.x * safeDistance,
                    obstacle.pos.y + awayDirection.y * safeDistance
                );
                
                // Teleport ant to safe position with strong velocity away from obstacle
                this.position = safePosition;
                this.velocity = awayDirection.multiply(4.0); // Strong escape velocity
                
                console.log(`Emergency: Ant thrown out of obstacle!`);
                break;
            }
        }
        
        // Obstacle sweeping: Move ants along with obstacles when being dragged
        for (const obstacle of this.simulation.obstacles) {
            if (obstacle.isBeingDragged && obstacle.lastPos) {
                const rep = obstacle.repulse(this.position);
                const sweepRange = obstacle.baseRadius + 15; // Sweep ants within this range
                
                if (rep.dist < sweepRange) {
                    // Calculate obstacle movement
                    const obstacleMovement = obstacle.pos.subtract(obstacle.lastPos);
                    const movementMagnitude = obstacleMovement.magnitude();
                    
                    if (movementMagnitude > 0.1) { // Only sweep if obstacle actually moved
                        // Calculate sweep force based on distance from obstacle center
                        const distanceFactor = Math.max(0, (sweepRange - rep.dist) / sweepRange);
                        const sweepForce = distanceFactor * 0.8; // Gentle sweeping force
                        
                        // Apply obstacle movement to ant position
                        const sweptMovement = obstacleMovement.multiply(sweepForce);
                        this.position = this.position.add(sweptMovement);
                        
                        // Also add some velocity in the direction of movement
                        const sweepVelocity = obstacleMovement.normalize().multiply(sweepForce * 2.0);
                        this.velocity = this.velocity.add(sweepVelocity);
                        
                        // Limit velocity to prevent excessive speed
                        if (this.velocity.magnitude() > 6.0) {
                            this.velocity = this.velocity.normalize().multiply(6.0);
                        }
                    }
                }
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
        
        // Enhanced trapped detection - check if ant is making progress toward goal
        this.checkTrappedStatus();
        
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
                    const field = this.simulation.pheromoneField;
                    field.reinforcePath(this.path, 3);
                }
                
                // Clear path for return journey
                this.path = [];
                
                console.log(`Food found! Energy restored to 100%`);
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
                
                // Full energy restoration from successful food delivery
                this.energy = 100; // Complete energy restoration
                
                // Clear state for clean transition to exploring
                this.path = [];
                this.momentum = Vec.random().multiply(0.3);
                this.tripStartTime = performance.now();
                
                // Log successful delivery
                console.log(`Ant delivered food! Efficiency: ${overallEfficiency.toFixed(2)}, Food gained: ${foodGained}, Energy restored to 100%`);
            }
        }
    }
    
    checkTrappedStatus() {
        // Only check progress periodically to avoid performance issues
        this.lastProgressCheck++;
        if (this.lastProgressCheck < this.progressCheckInterval) {
            return;
        }
        this.lastProgressCheck = 0;
        
        // Determine current goal
        let currentGoal;
        if (this.hasFood) {
            // Goal is the nest
            currentGoal = new Vec(this.simulation.nest.x, this.simulation.nest.y);
        } else {
            // Goal is the nearest food source
            let nearestFood = null;
            let nearestDist = Infinity;
            for (const f of this.simulation.foodSources) {
                if (!f.isDepleted()) {
                    const dist = this.position.subtract(f.pos).magnitude();
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestFood = f;
                    }
                }
            }
            if (nearestFood) {
                currentGoal = nearestFood.pos;
            } else {
                return; // No goal to progress toward
            }
        }
        
        // Calculate current distance to goal
        const currentDistance = this.position.subtract(currentGoal).magnitude();
        
        // Initialize initial distance if not set
        if (this.initialDistanceToGoal === 0) {
            this.initialDistanceToGoal = currentDistance;
        }
        
        // Calculate progress (how much closer we've gotten to the goal)
        const progress = this.initialDistanceToGoal - currentDistance;
        
        // Store progress in history
        this.progressHistory.push(progress);
        if (this.progressHistory.length > 10) { // Keep last 10 progress checks
            this.progressHistory.shift();
        }
        
        // Check if ant is making meaningful progress
        const recentProgress = this.progressHistory[this.progressHistory.length - 1] - this.progressHistory[0];
        const isMakingProgress = recentProgress > this.progressThreshold;
        
        if (!isMakingProgress) {
            this.trappedTime++;
            if (this.trappedTime > this.trappedThreshold && !this.escapeMode) {
                // Ant is trapped - enter escape mode
                this.enterEscapeMode();
            }
        } else {
            // Reset trapped time if making progress
            this.trappedTime = 0;
            this.escapeMode = false;
            this.escapeAttempts = 0;
        }
    }
    
    enterEscapeMode() {
        if (this.escapeAttempts >= this.maxEscapeAttempts) {
            return; // Max escape attempts reached
        }
        
        this.escapeMode = true;
        this.escapeStartTime = performance.now();
        this.escapeAttempts++;
        
        // Reset progress tracking to give escape mode a fresh start
        this.progressHistory = [];
        this.initialDistanceToGoal = 0;
        this.trappedTime = 0;
        
        console.log(`Ant entered escape mode (attempt ${this.escapeAttempts}/${this.maxEscapeAttempts})`);
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
    window.simulation = simulation; // Make it globally accessible
    console.log('Simulation created successfully');
    
    // Setup draggable objects
    simulation.setupDraggableObjects();
    

    
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
            
            // Hide panel after 1 second
            function startHideTimer() {
                hideTimeout = setTimeout(() => {
                    if (!isColorPickerOpen) {
                        colorPanel.classList.add('hidden');
                    }
                }, 1000);
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
                
                // Handle preset selector clicks
                if (e.target === simulation.canvas) {
                    const rect = simulation.canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    // Check if click is on preset selector area
                    if (x >= 10 && x <= 210 && y >= 10 && y <= 40) {
                        // Cycle through presets
                        const presetKeys = Object.keys(simulation.presets);
                        const currentIndex = presetKeys.indexOf(simulation.currentPreset);
                        const nextIndex = (currentIndex + 1) % presetKeys.length;
                        const nextPreset = presetKeys[nextIndex];
                        
                        simulation.currentPreset = nextPreset;
                        simulation.initialize();
                        console.log(`Switched to preset: ${simulation.presets[nextPreset].name}`);
                    }
                }
            });
            
            document.addEventListener('change', (e) => {
                if (e.target.type === 'color') {
                    isColorPickerOpen = false;
                }
            });
        }
        

        
        // Initialize auto-hide
        setupAutoHide();
        

    });

