// Phase 2: Full Collision Detection & Response
// Hard collisions with proper physics - no overlap allowed!
// Supernova ejection system DISABLED for stability – collisions stay local

import type { GalaxyNode } from "@/types/galaxy";

// ============================================================================
// COLLISION CONFIG
// ============================================================================

export const collisionConfig = {
    // Physics - TRUE BOWLING BALL MOMENTUM TRANSFER!
    // When balls collide, momentum is conserved: m1*v1 + m2*v2 = m1*v1' + m2*v2'
    restitution: 0.78,           // Slight bounce for realistic energy trade
    damping: 0.985,              // Legacy value (kept for compatibility)
    minSeparation: 12,           // More gap to prevent sticky collisions
    
    // Momentum transfer settings
    momentumTransferRatio: 1.0,  // 1.0 = perfect momentum transfer (bowling ball)
    massExponent: 0.7,           // How much mass affects collision (lower = more equal)
    
    // Thresholds
    grazingSpeedThreshold: 30,   // Below this = gentle touch, above = impact
    supernovaSpeedThreshold: 150, // Legacy (no longer used)
    
    // Supernova Event (DISABLED)
    supernovaCooldownMs: 0,
    supernovaEventChance: 0,
    supernovaEjectSpeed: 0,
    supernovaEjectSpeedVariance: 0,
    supernovaReturnRate: 0,
    supernovaMinSpeed: 0,
    supernovaMaxDistance: 80000,
    
    // PROXIMITY GLOW - shine when moons approach each other (before collision!)
    proximityGlowDistance: 400,  // Start glowing when this close (px)
    proximityGlowIntensity: 0.6, // Max proximity glow (0-1)
    
    // Particles
    maxParticles: 250,           // Performance cap
    sparkLifetime: 0.6,          // seconds
    smokeLifetime: 2.0,          // seconds
    
    // Visual feedback
    glowDecay: 0.93,             // How fast glow fades per frame (slower decay)
    maxGlow: 1.0,
    shakeIntensity: 8,           // Max camera shake pixels
    shakeDuration: 300,          // ms

    // Rail breakouts
    freeOrbitDuration: 90,       // Frames spent coasting after a collision (~1.5s)
    freeOrbitSpring: 0.013,      // Gentle radial pull back toward orbit band
    freeOrbitDamping: 0.975,     // Faster bleed to tame springbacks
    freeOrbitOrbitAssist: 0.18,  // Tangential boost to keep circular motion alive
    tangentialJitter: 0.08,      // Subtle randomness, no more soccer passes
    slotReleaseDuration: 40,     // Extra frames where angular clamp is loosened
    tangentialFriction: 0.4,     // How much side-slip is reduced per impact
    maxFreeSpeed: 240,           // Clamp runaway velocity from stacked impulses
    globalVelocityDrag: 0.995,   // Air drag applied each frame to free bodies
    freeOrbitSpringRamp: 0.25,   // 0-1: ramp spring strength across free-flight lifetime
    railBlendDuration: 45,       // Frames for smooth return to deterministic orbit
    railBlendEase: 0.15,         // How fast we ease toward the rail during blend
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

// Track all currently flung moons (legacy, now unused)
const flungMoons = new Map<string, FlungMoon>();

// Supernova helpers are now no-ops – system disabled for stability
function canTriggerSupernova(): boolean { return false; }
function markSupernovaTriggered(): void { /* no-op */ }
export function isMoonFlung(_nodeId: string): boolean { return false; }
export function getFlungState(_nodeId: string): FlungMoon | undefined { return undefined; }
export function getAllFlungMoons(): FlungMoon[] { return []; }

/**
 * Trigger a supernova ejection event for two colliding moons
 * Sends moons flying outward - potentially all the way to sun's orbit!
 */
export function triggerSupernovaEjection(
    _moonA: GalaxyNode, 
    _moonB: GalaxyNode, 
    _impactPoint: { x: number; y: number },
    _baseRadiusA: number,
    _baseRadiusB: number
): void {
    // Supernova ejection disabled – keep moons in local orbits
}

/**
 * Update flung moon physics - realistic gravity-affected curved paths
 * Moons are pulled by sun and planets, creating curved trajectories
 * Returns via orbital mechanics, spiraling back through the solar system
 */
export function updateFlungMoons(nodes: GalaxyNode[], dt: number): void {
    const sun = nodes.find(n => n.type === 'sun');
    const planets = nodes.filter(n => n.type === 'planet');
    
    // With supernova disabled, immediately clear any legacy flung state
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
let activeParticleCap: number = collisionConfig.maxParticles;

/**
 * Update particle budget at runtime based on quality mode
 */
export function setParticleBudget(maxParticles: number): void {
    const clamped = Math.max(25, Math.min(maxParticles, collisionConfig.maxParticles));
    activeParticleCap = clamped;
    if (particles.length > activeParticleCap) {
        particles = particles.slice(particles.length - activeParticleCap);
    }
}

export function getParticleBudget(): number {
    return activeParticleCap;
}

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
        if (particles.length >= activeParticleCap) {
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
 * Calculate effective orbital velocity for a node
 * Used for collision physics when node is in calm orbit (vx=0, vy=0)
 */
function getEffectiveVelocity(node: GalaxyNode): { vx: number; vy: number } {
    // If node already has velocity (from collision), use it
    const currentSpeed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (currentSpeed > 0.5) {
        return { vx: node.vx, vy: node.vy };
    }
    
    // Calculate orbital velocity: v = r * ω (radius * angular velocity)
    // Direction is tangent to orbit (perpendicular to radius)
    // REDUCED multiplier from 0.8 to 0.3 to prevent explosion velocities
    const orbitSpeed = (node.orbitRadius || 100) * Math.abs(node.angularVelocity || 0.001) * 0.3;
    const tangentAngle = (node.orbitAngle || 0) + Math.PI / 2 * Math.sign(node.angularVelocity || 1);
    
    return {
        vx: Math.cos(tangentAngle) * orbitSpeed,
        vy: Math.sin(tangentAngle) * orbitSpeed,
    };
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
    const massExponent = collisionConfig.massExponent;
    const aMass = Math.pow(a.mass || 10, massExponent);
    const bMass = Math.pow(b.mass || 10, massExponent);
    const totalMass = aMass + bMass;
    const aRatio = bMass / (totalMass || 1);
    const bRatio = aMass / (totalMass || 1);
    const physMassA = Math.max(a.mass || 10, 1);
    const physMassB = Math.max(b.mass || 10, 1);

    // Determine relative order along orbit to pick push direction
    const angleDelta = shortestAngleDiff(b.orbitAngle, a.orbitAngle);
    const directionA = angleDelta >= 0 ? -1 : 1; // push A opposite of B
    const directionB = -directionA;

    // Convert overlap distance into angular push (arc length = r * angle)
    const arcPush = overlap * 0.65 + 6;
    applyAngularPush(a, directionA * arcPush * aRatio);
    applyAngularPush(b, directionB * arcPush * bRatio);

    // Pull overlapping bodies apart immediately to avoid sticking
    separateNodes(a, b, nx, ny, overlap, physMassA, physMassB);

    // If moons share same parent ring, nudge lighter one outward to avoid stacking
    if (a.type === 'moon' && b.type === 'moon' && a.parentId === b.parentId) {
        const lighter = aMass <= bMass ? a : b;
        const heavier = lighter === a ? b : a;
        const radialNudge = overlap * 0.35;
        if (typeof lighter.targetOrbitRadius !== 'number') lighter.targetOrbitRadius = lighter.orbitRadius;
        lighter.targetOrbitRadius += radialNudge;
        clampTargetOrbitToField(lighter);
        if (typeof heavier.targetOrbitRadius !== 'number') heavier.targetOrbitRadius = heavier.orbitRadius;
        heavier.targetOrbitRadius -= radialNudge * 0.2;
        clampTargetOrbitToField(heavier);
    }

    // Get EFFECTIVE velocities (orbital motion for calm moons)
    const aVel = getEffectiveVelocity(a);
    const bVel = getEffectiveVelocity(b);

    applyFreeOrbitImpulse(a, b, { x: nx, y: ny }, overlap, aVel, bVel, physMassA, physMassB);
    
    // Calculate relative velocity using effective velocities
    const relVx = bVel.vx - aVel.vx;
    const relVy = bVel.vy - aVel.vy;
    
    // Calculate impact speed for effects
    const impactSpeed = Math.sqrt(relVx * relVx + relVy * relVy);
    
    // Calculate impact point (on the surface of a, toward b)
    const impactPoint = {
        x: a.x + nx * a.radius,
        y: a.y + ny * a.radius,
    };
    
    // Visual glow effect
    a.collisionGlow = Math.min(collisionConfig.maxGlow, (a.collisionGlow || 0) + 0.6);
    b.collisionGlow = Math.min(collisionConfig.maxGlow, (b.collisionGlow || 0) + 0.6);
    
    return {
        occurred: true,
        impactPoint,
        impactSpeed,
        normal: { x: nx, y: ny },
        nodeA: a,
        nodeB: b,
    };
}

function applyAngularPush(node: GalaxyNode, pushDistance: number) {
    if (node.type !== 'moon' && node.type !== 'meteorite') {
        return;
    }
    if ((node.freeOrbitTimer ?? 0) > 0) {
        // Don't fight active free-flight motion
        return;
    }
    const radius = Math.max(node.orbitRadius || 1, 1);
    const angleDelta = pushDistance / radius;

    const baseAngle = node.baseOrbitAngle ?? node.targetOrbitAngle ?? node.orbitAngle;
    const currentTarget = node.targetOrbitAngle ?? node.orbitAngle;
    const newTarget = normalizeAngle(currentTarget + angleDelta);
    const rawOffset = shortestAngleDiff(newTarget, baseAngle);
    const baseClamp = 0.45;
    let clampMultiplier = baseClamp;
    if (node.slotReleaseTimer && node.slotReleaseTimer > 0 && collisionConfig.slotReleaseDuration > 0) {
        const duration = collisionConfig.slotReleaseDuration;
        const releaseT = clamp(node.slotReleaseTimer / duration, 0, 1);
        clampMultiplier = baseClamp + releaseT * 0.75; // expand up to ~1.2x slot span
    }
    const slotLimit = (node.slotSpan ?? (Math.PI / 4)) * clampMultiplier;
    const clampedOffset = clamp(rawOffset, -slotLimit, slotLimit);
    node.angleOffset = clampedOffset;
    node.targetOrbitAngle = normalizeAngle(baseAngle + clampedOffset);
}

function normalizeAngle(angle: number): number {
    const twoPi = Math.PI * 2;
    let result = angle % twoPi;
    if (result < 0) result += twoPi;
    return result;
}

function shortestAngleDiff(target: number, current: number): number {
    const twoPi = Math.PI * 2;
    let diff = (target - current) % twoPi;
    if (diff > Math.PI) diff -= twoPi;
    if (diff < -Math.PI) diff += twoPi;
    return diff;
}

function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

type FieldBounds = {
    inner: number;
    outer: number;
};

function getNodeFieldBounds(node: GalaxyNode): FieldBounds | null {
    if (typeof node.fieldInnerRadius !== 'number' || typeof node.fieldOuterRadius !== 'number') {
        return null;
    }
    const inner = Math.min(node.fieldInnerRadius, node.fieldOuterRadius);
    const outer = Math.max(node.fieldInnerRadius, node.fieldOuterRadius);
    if (!isFinite(inner) || !isFinite(outer)) {
        return null;
    }
    return { inner, outer };
}

function clampRadiusToField(node: GalaxyNode, value: number): number {
    const bounds = getNodeFieldBounds(node);
    if (!bounds) return value;
    return clamp(value, bounds.inner, bounds.outer);
}

function clampTargetOrbitToField(node: GalaxyNode): void {
    if (typeof node.targetOrbitRadius !== 'number') return;
    node.targetOrbitRadius = clampRadiusToField(node, node.targetOrbitRadius);
}

function clampVelocity(node: GalaxyNode) {
    const maxSpeed = collisionConfig.maxFreeSpeed;
    if (!maxSpeed || maxSpeed <= 0) return;
    const speed = Math.hypot(node.vx, node.vy);
    if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        node.vx *= scale;
        node.vy *= scale;
    }
}

function enableFreeOrbit(node: GalaxyNode) {
    if (node.type !== 'moon' && node.type !== 'meteorite') return;
    const baseDuration = collisionConfig.freeOrbitDuration;
    const randomBoost = baseDuration * (0.5 + Math.random() * 0.5);
    node.freeOrbitTimer = Math.max(node.freeOrbitTimer ?? 0, randomBoost);
    node.freeOrbitDurationTotal = Math.max(node.freeOrbitDurationTotal ?? 0, node.freeOrbitTimer);
    node.freeOrbitAnchorRadius = clampRadiusToField(node, node.orbitRadius);
    node.freeOrbitAnchorAngle = node.orbitAngle;
    node.railBlendTimer = 0;
    const slotDuration = collisionConfig.slotReleaseDuration;
    if (slotDuration > 0) {
        node.slotReleaseTimer = Math.max(node.slotReleaseTimer ?? 0, slotDuration + Math.random() * slotDuration * 0.5);
    }
}

function separateNodes(
    a: GalaxyNode,
    b: GalaxyNode,
    nx: number,
    ny: number,
    overlap: number,
    massA: number,
    massB: number
) {
    const invMassA = 1 / Math.max(massA, 1);
    const invMassB = 1 / Math.max(massB, 1);
    const invSum = invMassA + invMassB;
    if (!isFinite(invSum) || invSum <= 0) return;
    const correction = overlap / invSum;

    if (a.type === 'moon' || a.type === 'meteorite') {
        a.x -= nx * correction * invMassA;
        a.y -= ny * correction * invMassA;
    }
    if (b.type === 'moon' || b.type === 'meteorite') {
        b.x += nx * correction * invMassB;
        b.y += ny * correction * invMassB;
    }
}

function applyFreeOrbitImpulse(
    a: GalaxyNode,
    b: GalaxyNode,
    normal: { x: number; y: number },
    overlap: number,
    aVel: { vx: number; vy: number },
    bVel: { vx: number; vy: number },
    massA: number,
    massB: number
) {
    const allowA = a.type === 'moon' || a.type === 'meteorite';
    const allowB = b.type === 'moon' || b.type === 'meteorite';
    if (!allowA && !allowB) return;

    const nx = normal.x;
    const ny = normal.y;
    const relVx = bVel.vx - aVel.vx;
    const relVy = bVel.vy - aVel.vy;
    const relNormalSpeed = relVx * nx + relVy * ny;
    const invMassA = 1 / Math.max(massA, 1);
    const invMassB = 1 / Math.max(massB, 1);
    const invMassSum = invMassA + invMassB;
    if (invMassSum <= 0) return;

    let impulseMagnitude = 0;
    if (relNormalSpeed < 0) {
        impulseMagnitude = -(1 + collisionConfig.restitution) * relNormalSpeed;
    }
    if (overlap > 0) {
        impulseMagnitude += overlap * 0.35;
    }
    if (impulseMagnitude !== 0) {
        impulseMagnitude /= invMassSum;
    }

    const impulseX = nx * impulseMagnitude;
    const impulseY = ny * impulseMagnitude;

    if (allowA) {
        if (Math.hypot(a.vx, a.vy) < 0.5) {
            a.vx = aVel.vx;
            a.vy = aVel.vy;
        }
        a.vx -= impulseX * invMassA;
        a.vy -= impulseY * invMassA;
    }

    if (allowB) {
        if (Math.hypot(b.vx, b.vy) < 0.5) {
            b.vx = bVel.vx;
            b.vy = bVel.vy;
        }
        b.vx += impulseX * invMassB;
        b.vy += impulseY * invMassB;
    }

    const tx = -ny;
    const ty = nx;
    const relativeTangent = relVx * tx + relVy * ty;
    const maxFrictionImpulse = Math.abs(impulseMagnitude) * collisionConfig.tangentialFriction;
    const frictionImpulse = clamp(-relativeTangent, -maxFrictionImpulse, maxFrictionImpulse);
    const frictionX = tx * frictionImpulse;
    const frictionY = ty * frictionImpulse;

    const jitter = collisionConfig.tangentialJitter * (Math.random() - 0.5);

    if (allowA) {
        a.vx -= frictionX * invMassA + tx * jitter;
        a.vy -= frictionY * invMassA + ty * jitter;
        clampVelocity(a);
        enableFreeOrbit(a);
    }
    if (allowB) {
        b.vx += frictionX * invMassB + tx * jitter;
        b.vy += frictionY * invMassB + ty * jitter;
        clampVelocity(b);
        enableFreeOrbit(b);
    }
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
        
        // Supernova visual mode disabled – keep standard strong impact effects only
    }
}

/**
 * Resolve all collisions between nodes
 * Call this AFTER applying forces, BEFORE integrating positions
 * Supernova events disabled – collisions are local only
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
            
            // === MOON-PLANET COLLISION PREVENTION ===
            // Moons should NEVER crash into their parent planet
            // Create a force field / buffer zone around planets
            const isPlanetMoonPair = (a.type === 'planet' && b.type === 'moon') || 
                                     (a.type === 'moon' && b.type === 'planet');
            
            if (isPlanetMoonPair) {
                const planetNode = a.type === 'planet' ? a : b;
                const moonNode = a.type === 'planet' ? b : a;
                
                // Check if this moon belongs to this planet
                const isMoonOfThisPlanet = moonNode.parentId === planetNode.id;
                
                const dx = moonNode.x - planetNode.x;
                const dy = moonNode.y - planetNode.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
                
                // Force field extends beyond planet surface - create a buffer zone
                const bufferZone = 200; // Extra gap to keep moons away from planet
                const minDist = planetNode.radius + moonNode.radius + bufferZone;
                
                if (dist < minDist) {
                    // Just add visual glow - don't push moons (deterministic orbit handles position)
                    moonNode.collisionGlow = Math.min(collisionConfig.maxGlow, (moonNode.collisionGlow || 0) + 0.5);
                    planetNode.collisionGlow = Math.min(collisionConfig.maxGlow, (planetNode.collisionGlow || 0) + 0.2);
                }
                continue; // Don't do normal collision for planet-moon pairs
            }
            
            const result = resolveCollision(a, b);
            if (result.occurred) {
                results.push(result);
                
                // Check for SUPERNOVA EVENT: ONLY cross-chain moon collisions!
                // Moons from the same planet just bounce, different planets = supernova potential
                // Supernova disabled – always use standard collision effects
                triggerCollisionEffects(result);
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

/**
 * Apply PROXIMITY GLOW effect - moons shine when approaching each other!
 * Creates anticipation before collision - like seeing a meteor approach.
 * Call this each frame in the physics loop.
 */
export function applyProximityGlow(nodes: GalaxyNode[]): void {
    const proximityDist = collisionConfig.proximityGlowDistance;
    const maxProximityGlow = collisionConfig.proximityGlowIntensity;
    
    // Only check moons and meteorites for proximity glow
    const glowableNodes = nodes.filter(n => n.type === 'moon' || n.type === 'meteorite');
    
    for (let i = 0; i < glowableNodes.length; i++) {
        for (let j = i + 1; j < glowableNodes.length; j++) {
            const a = glowableNodes[i];
            const b = glowableNodes[j];
            
            // Skip if same parent (same orbit, not interesting)
            if (a.parentId === b.parentId) continue;
            
            // Calculate distance between centers
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Check if within proximity range (but not colliding)
            const sumRadii = a.radius + b.radius;
            const gap = dist - sumRadii;
            
            if (gap > 0 && gap < proximityDist) {
                // Calculate glow intensity based on how close (closer = brighter)
                // gap=0 → max glow, gap=proximityDist → no glow
                const proximityRatio = 1 - (gap / proximityDist);
                const glowAmount = proximityRatio * proximityRatio * maxProximityGlow; // Quadratic falloff
                
                // Add proximity glow (don't override collision glow, add to it)
                a.collisionGlow = Math.min(collisionConfig.maxGlow, (a.collisionGlow || 0) + glowAmount * 0.1);
                b.collisionGlow = Math.min(collisionConfig.maxGlow, (b.collisionGlow || 0) + glowAmount * 0.1);
                
                // Spawn tiny anticipation particles when VERY close
                if (proximityRatio > 0.7 && Math.random() < 0.08) {
                    const midX = (a.x + b.x) / 2;
                    const midY = (a.y + b.y) / 2;
                    spawnParticles({
                        count: 2,
                        pos: { x: midX, y: midY },
                        speed: 30,
                        life: 0.4,
                        colors: ['#ffffff', '#ffff88', a.color, b.color],
                        size: 2,
                        gravity: 0,
                        angleSpread: Math.PI * 2,
                        direction: 0,
                        type: 'spark',
                    });
                }
            }
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
