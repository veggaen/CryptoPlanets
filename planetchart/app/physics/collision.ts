// Phase 2: Full Collision Detection & Response
// Hard collisions with proper physics - no overlap allowed!
// Includes SUPERNOVA EVENTS: 25% chance on moon-moon collision to eject both into space

import type { GalaxyNode } from "@/types/galaxy";

// ============================================================================
// COLLISION CONFIG
// ============================================================================

export const collisionConfig = {
    // Physics - TRUE BOWLING BALL MOMENTUM TRANSFER!
    // When balls collide, momentum is conserved: m1*v1 + m2*v2 = m1*v1' + m2*v2'
    restitution: 0.95,           // Slight energy loss (0.95 = 95% energy retained)
    damping: 0.995,              // Very minimal damping - balls keep rolling
    minSeparation: 8,            // Bit more gap to prevent sticky collisions
    
    // Momentum transfer settings
    momentumTransferRatio: 1.0,  // 1.0 = perfect momentum transfer (bowling ball)
    massExponent: 0.8,           // How much mass affects collision (lower = more equal)
    
    // Thresholds
    grazingSpeedThreshold: 40,   // Below this = gentle touch, above = impact
    supernovaSpeedThreshold: 180, // Above this = full supernova effect
    
    // Supernova Event - sends moons on 1-3 orbits around the sun!
    supernovaCooldownMs: 60000,  // 1 minute between supernovas
    supernovaEventChance: 0.15,  // 15% chance per collision when cooldown ready
    supernovaEjectSpeed: 1200,   // VERY HIGH - sends moons toward sun
    supernovaEjectSpeedVariance: 600, // Big variance for drama
    supernovaReturnRate: 0.001,  // EXTREMELY slow return - 1-3 sun orbits
    supernovaMinSpeed: 5,        // Any collision can trigger
    supernovaMaxDistance: 80000, // Can travel very far (toward sun)
    
    // Particles
    maxParticles: 200,           // Performance cap
    sparkLifetime: 0.6,          // seconds
    smokeLifetime: 2.0,          // seconds
    
    // Visual feedback
    glowDecay: 0.95,             // How fast glow fades per frame
    maxGlow: 1.0,
    shakeIntensity: 8,           // Max camera shake pixels
    shakeDuration: 300,          // ms
} as const;

// ============================================================================
// SUPERNOVA EVENT TRACKING
// ============================================================================

export type FlungMoon = {
    nodeId: string;
    parentChainId: string;       // Original parent chain to return to
    baseOrbitRadius: number;     // Target orbit radius to return to
    ejectVx: number;             // Ejection velocity X
    ejectVy: number;             // Ejection velocity Y
    ejectTime: number;           // When ejection started
    phase: 'ejecting' | 'returning'; // Current phase
    returnProgress: number;      // 0-1, how close to orbit
};

// Track all currently flung moons
const flungMoons = new Map<string, FlungMoon>();

// Track last supernova time for cooldown
let lastSupernovaTime = 0;

/**
 * Check if supernova is allowed (respects cooldown)
 */
function canTriggerSupernova(): boolean {
    const now = Date.now();
    const cooldown = collisionConfig.supernovaCooldownMs || 120000;
    return (now - lastSupernovaTime) >= cooldown;
}

/**
 * Mark supernova as triggered (reset cooldown)
 */
function markSupernovaTriggered(): void {
    lastSupernovaTime = Date.now();
}

/**
 * Check if a moon is currently flung (in supernova ejection)
 */
export function isMoonFlung(nodeId: string): boolean {
    return flungMoons.has(nodeId);
}

/**
 * Get flung state for a moon (if flung)
 */
export function getFlungState(nodeId: string): FlungMoon | undefined {
    return flungMoons.get(nodeId);
}

/**
 * Get all currently flung moons
 */
export function getAllFlungMoons(): FlungMoon[] {
    return Array.from(flungMoons.values());
}

/**
 * Trigger a supernova ejection event for two colliding moons
 * Sends moons flying outward - potentially all the way to sun's orbit!
 */
export function triggerSupernovaEjection(
    moonA: GalaxyNode, 
    moonB: GalaxyNode, 
    impactPoint: { x: number; y: number },
    baseRadiusA: number,
    baseRadiusB: number
): void {
    // Mark supernova triggered for cooldown
    markSupernovaTriggered();
    
    // Calculate direction TOWARD the sun (center) with some randomness
    // One moon goes toward sun, one goes opposite direction
    const sunAngleA = Math.atan2(-moonA.y, -moonA.x); // Angle toward center (sun)
    const sunAngleB = Math.atan2(-moonB.y, -moonB.x);
    
    // Add randomness: mostly toward/away from sun but with spread
    const randomSpread = Math.PI * 0.4; // 72 degrees of randomness
    const angleA = sunAngleA + (Math.random() - 0.5) * randomSpread;
    const angleB = sunAngleB + Math.PI + (Math.random() - 0.5) * randomSpread; // Opposite direction
    
    // Random speeds - one might go much faster than the other
    const speedA = collisionConfig.supernovaEjectSpeed + 
        (Math.random() * collisionConfig.supernovaEjectSpeedVariance);
    const speedB = collisionConfig.supernovaEjectSpeed * 0.7 + 
        (Math.random() * collisionConfig.supernovaEjectSpeedVariance * 0.7);
    
    // Register both moons as flung with trajectory toward/away from sun
    flungMoons.set(moonA.id, {
        nodeId: moonA.id,
        parentChainId: moonA.parentId || '',
        baseOrbitRadius: baseRadiusA,
        ejectVx: Math.cos(angleA) * speedA,
        ejectVy: Math.sin(angleA) * speedA,
        ejectTime: Date.now(),
        phase: 'ejecting',
        returnProgress: 0,
    });
    
    flungMoons.set(moonB.id, {
        nodeId: moonB.id,
        parentChainId: moonB.parentId || '',
        baseOrbitRadius: baseRadiusB,
        ejectVx: Math.cos(angleB) * speedB,
        ejectVy: Math.sin(angleB) * speedB,
        ejectTime: Date.now(),
        phase: 'ejecting',
        returnProgress: 0,
    });
    
    // Apply initial velocity to nodes
    moonA.vx = Math.cos(angleA) * speedA;
    moonA.vy = Math.sin(angleA) * speedA;
    moonB.vx = Math.cos(angleB) * speedB;
    moonB.vy = Math.sin(angleB) * speedB;
    
    // Spawn MASSIVE supernova particles - extra dramatic!
    spawnSupernovaExplosion(impactPoint, moonA.color, moonB.color);
    
    // Max glow on both moons - they're on fire!
    moonA.collisionGlow = 1.0;
    moonB.collisionGlow = 1.0;
    
    // Spawn the supernova explosion effect
    spawnSupernovaExplosion(impactPoint, moonA.color, moonB.color);
    
    // Max glow on both moons - they're on fire!
    moonA.collisionGlow = 1.0;
    moonB.collisionGlow = 1.0;
    
    // NO camera shake - user preference
    
    console.log(`🌟 SUPERNOVA! Moons ${moonA.id} and ${moonB.id} sent flying!`);
}

/**
 * Update flung moon physics - realistic gravity-affected curved paths
 * Moons are pulled by sun and planets, creating curved trajectories
 * Returns via orbital mechanics, spiraling back through the solar system
 */
export function updateFlungMoons(nodes: GalaxyNode[], dt: number): void {
    const sun = nodes.find(n => n.type === 'sun');
    const planets = nodes.filter(n => n.type === 'planet');
    
    for (const [nodeId, flung] of flungMoons.entries()) {
        const moon = nodes.find(n => n.id === nodeId);
        if (!moon) {
            flungMoons.delete(nodeId);
            continue;
        }
        
        const parent = nodes.find(n => n.id === flung.parentChainId);
        if (!parent) {
            flungMoons.delete(nodeId);
            continue;
        }
        
        // Calculate distance from sun
        const distFromSun = Math.sqrt(moon.x * moon.x + moon.y * moon.y);
        const maxDistance = collisionConfig.supernovaMaxDistance || 80000;
        
        // === SUN COLLISION CHECK - prevent moons from passing through! ===
        if (sun) {
            const sunRadius = sun.radius || 5400;
            const minDistFromSun = sunRadius + moon.radius + 100; // Buffer zone
            
            if (distFromSun < minDistFromSun) {
                // Moon is too close to sun! Bounce it away
                const nx = moon.x / distFromSun; // Normal pointing away from sun
                const ny = moon.y / distFromSun;
                
                // Push moon outside sun
                moon.x = nx * minDistFromSun;
                moon.y = ny * minDistFromSun;
                
                // Reflect velocity (bounce off sun surface)
                const dotProduct = flung.ejectVx * nx + flung.ejectVy * ny;
                flung.ejectVx = flung.ejectVx - 2 * dotProduct * nx;
                flung.ejectVy = flung.ejectVy - 2 * dotProduct * ny;
                
                // Add some energy from the "heat" of the sun
                const bounceBoost = 1.2;
                flung.ejectVx *= bounceBoost;
                flung.ejectVy *= bounceBoost;
                
                // Dramatic glow from sun proximity
                moon.collisionGlow = 1.0;
                
                // Spawn heat particles
                spawnParticles({
                    count: 20,
                    pos: { x: moon.x, y: moon.y },
                    speed: 100,
                    life: 1.0,
                    colors: ['#ffff00', '#ffaa00', '#ff6600', '#ffffff'],
                    size: 6,
                    gravity: 0,
                    angleSpread: Math.PI,
                    direction: Math.atan2(ny, nx),
                    type: 'spark',
                });
                
                console.log(`☀️ Moon ${nodeId} bounced off the sun!`);
            }
        }
        
        // === APPLY GRAVITY FROM SUN AND PLANETS ===
        // This creates curved paths, not straight lines!
        let gravX = 0;
        let gravY = 0;
        
        // Sun gravity (strongest)
        if (sun) {
            const dx = sun.x - moon.x;
            const dy = sun.y - moon.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const sunGravity = 0.15; // Strong pull from sun
            const force = sunGravity * 10000 / (dist * dist + 10000); // Inverse square with softening
            gravX += (dx / dist) * force;
            gravY += (dy / dist) * force;
        }
        
        // Planet gravity (weaker, but creates interesting curves)
        for (const planet of planets) {
            const dx = planet.x - moon.x;
            const dy = planet.y - moon.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist < 5000) { // Only nearby planets affect trajectory
                const planetGravity = 0.05;
                const force = planetGravity * 2000 / (dist * dist + 2000);
                gravX += (dx / dist) * force;
                gravY += (dy / dist) * force;
            }
        }
        
        if (flung.phase === 'ejecting') {
            // Apply gravity to velocity (curves the path!)
            flung.ejectVx += gravX * dt * 60;
            flung.ejectVy += gravY * dt * 60;
            
            // Apply velocity to position
            moon.x += flung.ejectVx * dt;
            moon.y += flung.ejectVy * dt;
            
            // Gentle velocity decay
            flung.ejectVx *= 0.998;
            flung.ejectVy *= 0.998;
            
            // Keep the moon glowing while flying
            moon.collisionGlow = Math.max(0.4, (moon.collisionGlow || 0) * 0.999);
            
            // Check if should start returning
            const speed = Math.sqrt(flung.ejectVx * flung.ejectVx + flung.ejectVy * flung.ejectVy);
            const shouldReturn = speed < 10 || distFromSun > maxDistance || distFromSun < 2000;
            
            if (shouldReturn) {
                flung.phase = 'returning';
                flung.returnProgress = 0;
                
                // Initialize return orbit - moon will orbit the sun back toward parent
                // Calculate a tangential velocity for orbital motion
                const angleFromSun = Math.atan2(moon.y, moon.x);
                const orbitSpeed = Math.sqrt(50000 / distFromSun) * 0.5; // Kepler-ish
                flung.ejectVx = Math.cos(angleFromSun + Math.PI/2) * orbitSpeed;
                flung.ejectVy = Math.sin(angleFromSun + Math.PI/2) * orbitSpeed;
                
                // "Gravity capture" effect
                spawnParticles({
                    count: 12,
                    pos: { x: moon.x, y: moon.y },
                    speed: 40,
                    life: 1.8,
                    colors: ['#4488ff', '#88aaff', '#aaccff'],
                    size: 4,
                    gravity: 0,
                    angleSpread: Math.PI * 2,
                    direction: 0,
                    type: 'smoke',
                });
                
                console.log(`🔄 Moon ${nodeId} captured into return orbit at distance ${Math.round(distFromSun)}px`);
            }
            
            // Trail particles while ejecting
            if (speed > 30 && Math.random() < 0.3) {
                spawnParticles({
                    count: 2,
                    pos: { x: moon.x, y: moon.y },
                    speed: 25,
                    life: 1.0,
                    colors: ['#ff8800', '#ffaa00', moon.color],
                    size: moon.radius * 0.3,
                    gravity: 0,
                    angleSpread: Math.PI * 0.3,
                    direction: Math.atan2(-flung.ejectVy, -flung.ejectVx),
                    type: 'smoke',
                });
            }
        } else {
            // RETURNING phase - orbital mechanics back to parent
            // Moon orbits the sun while slowly spiraling toward parent planet
            
            // Apply gravity (creates orbital motion)
            flung.ejectVx += gravX * dt * 60;
            flung.ejectVy += gravY * dt * 60;
            
            // Extra pull toward parent planet (gradual homing)
            const dxToParent = parent.x - moon.x;
            const dyToParent = parent.y - moon.y;
            const distToParent = Math.sqrt(dxToParent * dxToParent + dyToParent * dyToParent) || 1;
            
            // Homing strength increases with return progress
            flung.returnProgress += collisionConfig.supernovaReturnRate || 0.001;
            const homingStrength = 0.01 + flung.returnProgress * 0.05;
            
            flung.ejectVx += (dxToParent / distToParent) * homingStrength;
            flung.ejectVy += (dyToParent / distToParent) * homingStrength;
            
            // Apply velocity
            moon.x += flung.ejectVx * dt;
            moon.y += flung.ejectVy * dt;
            
            // Slight drag
            flung.ejectVx *= 0.999;
            flung.ejectVy *= 0.999;
            
            // Update moon's orbit angle to match position relative to parent
            moon.orbitAngle = Math.atan2(moon.y - parent.y, moon.x - parent.x);
            
            // Fade glow
            moon.collisionGlow = Math.max(0.1, (moon.collisionGlow || 0) * 0.997);
            
            // Check if close enough to parent orbit to snap back
            const targetOrbitDist = Math.abs(distToParent - flung.baseOrbitRadius);
            const speed = Math.sqrt(flung.ejectVx * flung.ejectVx + flung.ejectVy * flung.ejectVy);
            
            if ((targetOrbitDist < 150 && speed < 3) || flung.returnProgress >= 2.0) {
                // Snap back to proper orbit
                moon.x = parent.x + Math.cos(moon.orbitAngle) * flung.baseOrbitRadius;
                moon.y = parent.y + Math.sin(moon.orbitAngle) * flung.baseOrbitRadius;
                moon.orbitRadius = flung.baseOrbitRadius;
                moon.vx = 0;
                moon.vy = 0;
                moon.collisionGlow = 0;
                flungMoons.delete(nodeId);
                
                // "Settled" effect
                spawnParticles({
                    count: 8,
                    pos: { x: moon.x, y: moon.y },
                    speed: 50,
                    life: 0.6,
                    colors: ['#44ff88', '#88ffaa', '#ffffff'],
                    size: 5,
                    gravity: 0,
                    angleSpread: Math.PI * 2,
                    direction: 0,
                    type: 'spark',
                });
                
                console.log(`✅ Moon ${nodeId} returned to orbit!`);
            }
            
            // Occasional subtle trail while returning
            if (Math.random() < 0.1) {
                spawnParticles({
                    count: 1,
                    pos: { x: moon.x, y: moon.y },
                    speed: 10,
                    life: 1.2,
                    colors: ['#6688aa', '#8899bb'],
                    size: moon.radius * 0.2,
                    gravity: 0,
                    angleSpread: Math.PI * 0.2,
                    direction: Math.atan2(-flung.ejectVy, -flung.ejectVx),
                    type: 'smoke',
                });
            }
        }
    }
}

/**
 * Spawn the MASSIVE supernova explosion effect - very dramatic!
 */
function spawnSupernovaExplosion(
    pos: { x: number; y: number }, 
    colorA: string, 
    colorB: string
): void {
    // STAGE 1: Blinding white core flash
    spawnParticles({
        count: 80,
        pos,
        speed: 800,
        life: 1.0,
        colors: ['#ffffff', '#ffffee', '#ffffcc'],
        size: 6,
        gravity: 0,
        angleSpread: Math.PI * 2,
        direction: 0,
        type: 'spark',
    });
    
    // STAGE 2: Golden-orange expanding ring
    spawnParticles({
        count: 60,
        pos,
        speed: 600,
        life: 0.8,
        colors: ['#ffff00', '#ffcc00', '#ffaa00', '#ff8800'],
        size: 5,
        gravity: 0,
        angleSpread: Math.PI * 2,
        direction: 0,
        type: 'spark',
    });
    
    // STAGE 3: Colored sparks from the moons
    spawnParticles({
        count: 50,
        pos,
        speed: 450,
        life: 1.2,
        colors: [colorA, colorB, '#ffffff'],
        size: 4,
        gravity: 0,
        angleSpread: Math.PI * 2,
        direction: 0,
        type: 'spark',
    });
    
    // STAGE 4: Massive hot gas cloud (expanding nebula)
    spawnParticles({
        count: 40,
        pos,
        speed: 200,
        life: 3.5,
        colors: ['#ff4400', '#ff6600', '#ff8800', '#ffaa00'],
        size: 18,
        gravity: -15,
        angleSpread: Math.PI * 2,
        direction: 0,
        type: 'smoke',
    });
    
    // STAGE 5: Secondary cooler smoke ring
    spawnParticles({
        count: 30,
        pos,
        speed: 120,
        life: 4.0,
        colors: ['#cc4422', '#aa3333', '#883333', '#664444'],
        size: 25,
        gravity: -8,
        angleSpread: Math.PI * 2,
        direction: 0,
        type: 'smoke',
    });
    
    // STAGE 6: Heavy debris flying out
    spawnParticles({
        count: 35,
        pos,
        speed: 500,
        life: 2.0,
        colors: [colorA, colorB, '#888888', '#666666', '#aaaaaa'],
        size: 7,
        gravity: 15,
        angleSpread: Math.PI * 2,
        direction: 0,
        type: 'debris',
    });
    
    // STAGE 7: Outer dark dust cloud
    spawnParticles({
        count: 25,
        pos,
        speed: 80,
        life: 5.0,
        colors: ['#332222', '#222222', '#443333', '#333322'],
        size: 30,
        gravity: -5,
        angleSpread: Math.PI * 2,
        direction: 0,
        type: 'smoke',
    });
}

// Easing function for smooth return
function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

// ============================================================================
// PARTICLE SYSTEM
// ============================================================================

export type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;       // Remaining life (0-1)
    maxLife: number;    // Original lifetime
    size: number;
    color: string;
    type: 'spark' | 'smoke' | 'debris';
    gravity: number;    // Vertical acceleration (negative = rises)
    alpha: number;      // Current opacity
};

// Global particle pool
let particles: Particle[] = [];

/**
 * Spawn particles at a collision point
 */
export function spawnParticles(options: {
    count: number;
    pos: { x: number; y: number };
    speed: number;
    life: number;
    colors: string[];
    size: number;
    gravity?: number;
    angleSpread: number;     // Radians
    direction: number;       // Base direction in radians
    type: 'spark' | 'smoke' | 'debris';
}): void {
    const { count, pos, speed, life, colors, size, gravity = 0, angleSpread, direction, type } = options;
    
    for (let i = 0; i < count; i++) {
        if (particles.length >= collisionConfig.maxParticles) {
            // Remove oldest particle
            particles.shift();
        }
        
        const angle = direction + (Math.random() - 0.5) * angleSpread;
        const velocity = speed * (0.5 + Math.random() * 0.5);
        
        particles.push({
            x: pos.x + (Math.random() - 0.5) * 4,
            y: pos.y + (Math.random() - 0.5) * 4,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity,
            life: life * (0.7 + Math.random() * 0.3),
            maxLife: life,
            size: size * (0.7 + Math.random() * 0.6),
            color: colors[Math.floor(Math.random() * colors.length)],
            type,
            gravity,
            alpha: 1,
        });
    }
}

/**
 * Update all particles (call each frame)
 */
export function updateParticles(dt: number): void {
    const dtSeconds = dt; // dt is already in seconds from animation frame
    
    particles = particles.filter(p => {
        // Update physics
        p.vy += p.gravity * dtSeconds;
        p.x += p.vx * dtSeconds;
        p.y += p.vy * dtSeconds;
        
        // Decay life
        p.life -= dtSeconds;
        
        // Calculate alpha based on remaining life
        p.alpha = Math.max(0, p.life / p.maxLife);
        
        // Sparks fade faster at end
        if (p.type === 'spark' && p.alpha < 0.3) {
            p.alpha *= 0.8;
        }
        
        // Smoke expands as it rises
        if (p.type === 'smoke') {
            p.size *= 1.01;
            p.vx *= 0.98;
            p.vy *= 0.98;
        }
        
        return p.life > 0;
    });
}

/**
 * Get current particles for rendering
 */
export function getParticles(): readonly Particle[] {
    return particles;
}

/**
 * Clear all particles
 */
export function clearParticles(): void {
    particles = [];
}

// ============================================================================
// CAMERA SHAKE
// ============================================================================

let shakeAmount = 0;
let shakeDecay = 0;
let shakeStartTime = 0;

/**
 * Trigger camera shake
 */
export function triggerShake(intensity: number, duration: number): void {
    shakeAmount = Math.min(intensity, collisionConfig.shakeIntensity);
    shakeDecay = duration;
    shakeStartTime = Date.now();
}

/**
 * Get current shake offset (call each frame)
 */
export function getShakeOffset(): { x: number; y: number } {
    if (shakeAmount <= 0.1) return { x: 0, y: 0 };
    
    const elapsed = Date.now() - shakeStartTime;
    const progress = Math.min(1, elapsed / shakeDecay);
    const currentShake = shakeAmount * (1 - progress);
    
    if (progress >= 1) {
        shakeAmount = 0;
        return { x: 0, y: 0 };
    }
    
    return {
        x: (Math.random() - 0.5) * 2 * currentShake,
        y: (Math.random() - 0.5) * 2 * currentShake,
    };
}

// ============================================================================
// COLLISION DETECTION & RESPONSE
// ============================================================================

export type CollisionResult = {
    occurred: boolean;
    impactPoint?: { x: number; y: number };
    impactSpeed?: number;
    normal?: { x: number; y: number };
    nodeA?: GalaxyNode;
    nodeB?: GalaxyNode;
};

/**
 * Check if two nodes are colliding
 */
export function areNodesColliding(n1: GalaxyNode, n2: GalaxyNode): boolean {
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < n1.radius + n2.radius;
}

/**
 * Resolve collision between two nodes with TRUE BOWLING BALL PHYSICS
 * Uses proper momentum conservation: m1*v1 + m2*v2 = m1*v1' + m2*v2'
 * Returns true if collision occurred
 */
export function resolveCollision(a: GalaxyNode, b: GalaxyNode): CollisionResult {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    
    const sumRadii = a.radius + b.radius;
    
    // No collision
    if (dist >= sumRadii + collisionConfig.minSeparation) {
        return { occurred: false };
    }
    
    // Calculate collision normal
    const nx = dx / dist;
    const ny = dy / dist;
    
    // Calculate overlap amount
    const overlap = sumRadii + collisionConfig.minSeparation - dist;
    
    // === BOWLING BALL PHYSICS: Proper mass-based momentum transfer ===
    // Use mass with exponent to allow smaller moons to still transfer momentum
    const massExponent = collisionConfig.massExponent;
    const aMass = Math.pow(a.mass, massExponent);
    const bMass = Math.pow(b.mass, massExponent);
    const totalMass = aMass + bMass;
    
    // Mass-based separation (heavier objects move less)
    const aRatio = bMass / totalMass;
    const bRatio = aMass / totalMass;
    
    // Separate them so they just touch (no overlap ever!)
    a.x -= nx * overlap * aRatio;
    a.y -= ny * overlap * aRatio;
    b.x += nx * overlap * bRatio;
    b.y += ny * overlap * bRatio;
    
    // Calculate relative velocity
    const relVx = b.vx - a.vx;
    const relVy = b.vy - a.vy;
    const relVelAlongNormal = relVx * nx + relVy * ny;
    
    // Calculate impact speed for effects (before checking direction)
    const impactSpeed = Math.sqrt(relVx * relVx + relVy * relVy);
    
    // Calculate impact point (on the surface of a, toward b)
    const impactPoint = {
        x: a.x + nx * a.radius,
        y: a.y + ny * a.radius,
    };
    
    // Only apply velocity change if objects are approaching
    if (relVelAlongNormal < 0) {
        // === TRUE MOMENTUM CONSERVATION ===
        // For elastic collision: v1' = ((m1-m2)*v1 + 2*m2*v2) / (m1+m2)
        // For 1D along normal: 
        // v1n' = ((m1-m2)*v1n + 2*m2*v2n) / (m1+m2)
        // v2n' = ((m2-m1)*v2n + 2*m1*v1n) / (m1+m2)
        
        const { restitution, momentumTransferRatio } = collisionConfig;
        
        // Get velocity components along normal
        const v1n = a.vx * nx + a.vy * ny;  // a's velocity along normal
        const v2n = b.vx * nx + b.vy * ny;  // b's velocity along normal
        
        // Get velocity components perpendicular to normal (tangent)
        const v1t = a.vx - v1n * nx;
        const v1ty = a.vy - v1n * ny;
        const v2t = b.vx - v2n * nx;
        const v2ty = b.vy - v2n * ny;
        
        // Calculate new normal velocities using momentum conservation
        // With restitution for energy loss
        const m1 = aMass;
        const m2 = bMass;
        
        const v1nNew = ((m1 - m2) * v1n + 2 * m2 * v2n) / (m1 + m2) * restitution;
        const v2nNew = ((m2 - m1) * v2n + 2 * m1 * v1n) / (m1 + m2) * restitution;
        
        // Apply momentum transfer ratio (1.0 = full transfer, 0.5 = half)
        const transfer = momentumTransferRatio;
        
        // New velocities = tangent (unchanged) + new normal component
        a.vx = v1t + v1nNew * nx * transfer;
        a.vy = v1ty + v1nNew * ny * transfer;
        b.vx = v2t + v2nNew * nx * transfer;
        b.vy = v2ty + v2nNew * ny * transfer;
        
        // Ensure minimum bounce velocity so collisions are visible
        const minBounce = 1.5;
        const aSpeed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
        const bSpeed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        
        if (aSpeed < minBounce && impactSpeed > 0.5) {
            // Give small kick in opposite direction of collision
            a.vx = -nx * minBounce * (0.8 + Math.random() * 0.4);
            a.vy = -ny * minBounce * (0.8 + Math.random() * 0.4);
        }
        if (bSpeed < minBounce && impactSpeed > 0.5) {
            b.vx = nx * minBounce * (0.8 + Math.random() * 0.4);
            b.vy = ny * minBounce * (0.8 + Math.random() * 0.4);
        }
    }
    
    return {
        occurred: true,
        impactPoint,
        impactSpeed,
        normal: { x: nx, y: ny },
        nodeA: a,
        nodeB: b,
    };
}

/**
 * Trigger visual effects for a collision
 */
export function triggerCollisionEffects(result: CollisionResult): void {
    if (!result.occurred || !result.impactPoint || !result.impactSpeed) return;
    
    const { impactPoint, impactSpeed, normal, nodeA, nodeB } = result;
    const nx = normal?.x || 0;
    const ny = normal?.y || 0;
    
    // Calculate intensity (0-1) based on speed
    const intensity = Math.min(1, impactSpeed / 800);
    const isGrazing = impactSpeed < collisionConfig.grazingSpeedThreshold;
    const isSupernova = impactSpeed > collisionConfig.supernovaSpeedThreshold;
    
    // Direction away from impact
    const direction = Math.atan2(ny, nx);
    
    if (isGrazing) {
        // Gentle touch - tiny sparks and dust puff
        spawnParticles({
            count: 6,
            pos: impactPoint,
            speed: 80,
            life: 0.6,
            colors: ['#aaaaaa', '#888888', '#cccccc'],
            size: 2,
            gravity: 0,
            angleSpread: Math.PI,
            direction,
            type: 'spark',
        });
        
        spawnParticles({
            count: 3,
            pos: impactPoint,
            speed: 40,
            life: 1.8,
            colors: ['#ffcc88', '#ffaa66'],
            size: 6,
            gravity: -20,
            angleSpread: Math.PI * 0.5,
            direction: direction + Math.PI / 2,
            type: 'smoke',
        });
        
        // Mild glow
        if (nodeA) nodeA.collisionGlow = Math.min(collisionConfig.maxGlow, (nodeA.collisionGlow || 0) + 0.2);
        if (nodeB) nodeB.collisionGlow = Math.min(collisionConfig.maxGlow, (nodeB.collisionGlow || 0) + 0.2);
        
    } else {
        // Strong impact - sparks, smoke, debris!
        
        // Bright sparks
        spawnParticles({
            count: 15 + Math.floor(40 * intensity),
            pos: impactPoint,
            speed: 200 + 600 * intensity,
            life: 0.4 + 0.6 * intensity,
            colors: ['#ffffff', '#ffff88', '#ffaa00', '#ff8800'],
            size: 1.5 + 3 * intensity,
            gravity: 0,
            angleSpread: Math.PI * 0.7,
            direction,
            type: 'spark',
        });
        
        // Hot smoke/gas
        spawnParticles({
            count: 20 + Math.floor(30 * intensity),
            pos: impactPoint,
            speed: 50 + 200 * intensity,
            life: 1.2 + 1.5 * intensity,
            colors: ['#ff4400', '#ff8800', '#cc2222', '#aa4444'],
            size: 4 + 8 * intensity,
            gravity: -30,
            angleSpread: Math.PI,
            direction: direction + Math.PI / 2,
            type: 'smoke',
        });
        
        // Strong glow
        if (nodeA) nodeA.collisionGlow = Math.min(collisionConfig.maxGlow, (nodeA.collisionGlow || 0) + 0.6);
        if (nodeB) nodeB.collisionGlow = Math.min(collisionConfig.maxGlow, (nodeB.collisionGlow || 0) + 0.6);
        
        // NO camera shake - disabled by user preference
        
        if (isSupernova) {
            // SUPERNOVA MODE - extra debris and bright flash
            spawnParticles({
                count: 30 + Math.floor(50 * intensity),
                pos: impactPoint,
                speed: 300 + 500 * intensity,
                life: 0.8 + 1.2 * intensity,
                colors: ['#ffffff', '#ffffcc', '#ffff00'],
                size: 2 + 4 * intensity,
                gravity: 10,
                angleSpread: Math.PI * 2,
                direction: 0,
                type: 'debris',
            });
            
            // Max glow
            if (nodeA) nodeA.collisionGlow = collisionConfig.maxGlow;
            if (nodeB) nodeB.collisionGlow = collisionConfig.maxGlow;
            
            // NO camera shake - disabled by user preference
        }
    }
}

/**
 * Resolve all collisions between nodes
 * Call this AFTER applying forces, BEFORE integrating positions
 * Includes 25% chance of SUPERNOVA EVENT on moon-moon collision!
 */
export function resolveAllCollisions(
    nodes: GalaxyNode[], 
    getBaseOrbitRadius?: (nodeId: string) => number | undefined
): CollisionResult[] {
    const results: CollisionResult[] = [];
    
    // Check all pairs
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            
            // Skip if either moon is currently flung (in supernova ejection)
            if (isMoonFlung(a.id) || isMoonFlung(b.id)) {
                continue;
            }
            
            // Skip sun collisions (sun is immovable)
            if (a.type === 'sun' || b.type === 'sun') {
                // Still prevent overlap with sun
                const sunNode = a.type === 'sun' ? a : b;
                const otherNode = a.type === 'sun' ? b : a;
                
                const dx = otherNode.x - sunNode.x;
                const dy = otherNode.y - sunNode.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
                const minDist = sunNode.radius + otherNode.radius + collisionConfig.minSeparation;
                
                if (dist < minDist) {
                    // Push other away from sun
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const overlap = minDist - dist;
                    otherNode.x += nx * overlap;
                    otherNode.y += ny * overlap;
                    
                    // Mild bounce
                    const bounceVel = 20;
                    otherNode.vx += nx * bounceVel;
                    otherNode.vy += ny * bounceVel;
                    
                    // Glow effect
                    otherNode.collisionGlow = Math.min(collisionConfig.maxGlow, (otherNode.collisionGlow || 0) + 0.3);
                }
                continue;
            }
            
            const result = resolveCollision(a, b);
            if (result.occurred) {
                results.push(result);
                
                // Check for SUPERNOVA EVENT: ONLY cross-chain moon collisions!
                // Moons from the same planet just bounce, different planets = supernova potential
                const isMoonMoonCollision = a.type === 'moon' && b.type === 'moon';
                const isCrossChainCollision = a.parentId !== b.parentId; // Different parent planets!
                const cooldownReady = canTriggerSupernova();
                const rollSupernova = Math.random() < collisionConfig.supernovaEventChance;
                
                if (isMoonMoonCollision && isCrossChainCollision && cooldownReady && rollSupernova) {
                    // SUPERNOVA EVENT! 🌟💥 Cross-chain collision!
                    markSupernovaTriggered();
                    
                    const baseRadiusA = getBaseOrbitRadius?.(a.id) ?? a.orbitRadius;
                    const baseRadiusB = getBaseOrbitRadius?.(b.id) ?? b.orbitRadius;
                    
                    triggerSupernovaEjection(
                        a, 
                        b, 
                        result.impactPoint!, 
                        baseRadiusA, 
                        baseRadiusB
                    );
                } else {
                    // Normal collision effects (gentle bump)
                    triggerCollisionEffects(result);
                }
            }
        }
    }
    
    return results;
}

/**
 * Decay collision glow effects each frame
 */
export function decayCollisionGlow(nodes: GalaxyNode[]): void {
    for (const node of nodes) {
        if (node.collisionGlow && node.collisionGlow > 0.01) {
            node.collisionGlow *= collisionConfig.glowDecay;
        } else {
            node.collisionGlow = 0;
        }
    }
}

// Legacy exports for backward compatibility
export function resolveCollisions(nodes: GalaxyNode[], dt: number): void {
    resolveAllCollisions(nodes);
    updateParticles(dt);
    decayCollisionGlow(nodes);
}

export function applyCollisionForce(
    n1: GalaxyNode,
    n2: GalaxyNode,
    strength: number,
    dt: number
): void {
    resolveCollision(n1, n2);
}
