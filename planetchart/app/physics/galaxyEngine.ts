// Phase 2: Physics Engine (Refined)
// Deterministic orbital mechanics with ring layouts, nested orbits, and scoped collisions

import type { GalaxyData, GalaxyState, GalaxyNode, ChainData, BTCData, WeightMode } from "@/types/galaxy";
import { physicsConfig } from "@/config/physicsConfig";
import { debugLog } from "@/utils/debug";

/**
 * Initialize galaxy physics state from data
 * Determines dynamic sun, assigns orbit radii, and creates nodes
 */
export function initGalaxyState(data: GalaxyData): GalaxyState {
    debugLog('physics', `initGalaxyState called with mode: ${data.metric}`);

    const nodes: GalaxyNode[] = [];

    // 1. Calculate BTC weight to compare with chains
    const btcWeight = calculateBTCWeight(data.btc, data.metric);

    // 2. Create a unified list of celestial bodies to rank
    type CelestialBody = {
        type: 'btc' | 'chain';
        data: BTCData | ChainData;
        weight: number;
        id: string;
    };

    const bodies: CelestialBody[] = [
        { type: 'btc', data: data.btc, weight: btcWeight, id: 'btc' },
        ...data.chains.map(c => ({ type: 'chain' as const, data: c, weight: c.weight, id: c.id }))
    ];

    // 3. Sort by weight (descending) to find the Sun
    bodies.sort((a, b) => b.weight - a.weight);

    // 4. Create Nodes
    const sunBody = bodies[0];
    const planets = bodies.slice(1);

    // --- Create SUN Node ---
    const sunNode: GalaxyNode = {
        id: sunBody.id,
        type: 'sun',
        parentId: null,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: physicsConfig.sunRadius,
        color: sunBody.type === 'btc' ? 'from-yellow-400 to-orange-600' : (sunBody.data as ChainData).color,
        orbitRadius: 0,
        orbitAngle: 0,
        angularVelocity: 0,
        weight: sunBody.weight,
        mass: physicsConfig.sunMass,
        data: sunBody.data as any,
        isDragging: false,
        isSelected: false,
        isHovered: false,
        collisionGlow: 0,
        radiusOffset: 0
    };
    nodes.push(sunNode);

    // --- Create PLANET Nodes ---
    planets.forEach((body, index) => {
        // Safe Planet Spacing: base + index * step
        const orbitRadius = physicsConfig.basePlanetOrbit + (index * physicsConfig.planetOrbitStep);
        const orbitAngle = Math.random() * Math.PI * 2;
        const angularVelocity = physicsConfig.baseChainAngularVel * Math.pow(physicsConfig.basePlanetOrbit / orbitRadius, physicsConfig.orbitSpeedFalloff);

        const x = Math.cos(orbitAngle) * orbitRadius;
        const y = Math.sin(orbitAngle) * orbitRadius;

        const node: GalaxyNode = {
            id: body.id,
            type: 'planet',
            parentId: null,
            x,
            y,
            vx: 0,
            vy: 0,
            radius: calculatePlanetRadius(body.weight, bodies[bodies.length - 1].weight, sunBody.weight),
            color: body.type === 'btc' ? 'from-yellow-400 to-orange-600' : (body.data as ChainData).color,
            orbitRadius,
            orbitAngle,
            angularVelocity,
            weight: body.weight,
            mass: 100,
            data: body.data as any,
            isDragging: false,
            isSelected: false,
            isHovered: false,
            collisionGlow: 0,
            radiusOffset: 0
        };
        nodes.push(node);

        // --- Create MOON & METEORITE Nodes (if chain) ---
        if (body.type === 'chain') {
            const chain = body.data as ChainData;
            const planetRadius = node.radius;

            // Sort tokens by liquidity/importance for hierarchy
            // Assuming tokens are already sorted by dataLoader, but safety sort here
            const sortedTokens = [...chain.tokens].sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0));

            // Split into Moons (Top N) and Meteorites (Rest)
            const moonCount = Math.min(sortedTokens.length, physicsConfig.maxMoonsPerPlanet);
            const moons = sortedTokens.slice(0, moonCount);
            const meteorites = sortedTokens.slice(moonCount, moonCount + physicsConfig.maxMeteoritesPerPlanet);

            const createdMoons: GalaxyNode[] = [];

            // 1. Create MOONS (Ring Layout)
            moons.forEach((token, tIndex) => {
                // Ring Layout Calculation
                const ringIndex = Math.floor(tIndex / physicsConfig.moonSlotsPerRing);
                const slotIndex = tIndex % physicsConfig.moonSlotsPerRing;

                // Radius increases with ring index
                const ringBaseRadius = planetRadius + physicsConfig.baseMoonOrbitRadius + (ringIndex * physicsConfig.moonRingStep);
                // Add some random variance to orbit radius so rings aren't perfect circles
                const moonOrbitRadius = ringBaseRadius + (Math.random() * 10 - 5);

                // Angle based on slot + random offset + planet stagger (breaks synchronization)
                const angleStep = (Math.PI * 2) / physicsConfig.moonSlotsPerRing;
                const planetPhaseOffset = index * 0.137; // Golden angle offset per planet
                const moonAngle = (slotIndex * angleStep) + (Math.random() * 0.5 - 0.25) + planetPhaseOffset;

                const moonX = x + Math.cos(moonAngle) * moonOrbitRadius;
                const moonY = y + Math.sin(moonAngle) * moonOrbitRadius;

                // Normalize liquidity for sizing (0-1 relative to best token)
                const maxLiq = moons[0].liquidity || 1;
                const normLiq = (token.liquidity || 0) / maxLiq;
                const radius = lerp(physicsConfig.moonMinRadius, physicsConfig.moonMaxRadius, normLiq);

                const moonNode: GalaxyNode = {
                    id: `${chain.id}-${token.symbol}-${tIndex}`,
                    type: 'moon',
                    parentId: chain.id,
                    x: moonX,
                    y: moonY,
                    vx: 0,
                    vy: 0,
                    radius,
                    color: token.color || '#cbd5e1',
                    orbitRadius: moonOrbitRadius,
                    orbitAngle: moonAngle,
                    angularVelocity: physicsConfig.baseTokenAngularVel * (Math.random() * 0.8 + 0.6) * (ringIndex % 2 === 0 ? 1 : -1), // INCREASED variance (was 0.5 + 0.8)
                    weight: token.marketCap,
                    mass: 10,
                    data: token as any,
                    isDragging: false,
                    isSelected: false,
                    isHovered: false,
                    collisionGlow: 0,
                    radiusOffset: 0
                };
                nodes.push(moonNode);
                createdMoons.push(moonNode);
            });

            // 2. Create METEORITES (Orbiting Moons)
            meteorites.forEach((token, mIndex) => {
                if (createdMoons.length === 0) return; // No moons to orbit

                // Assign parent moon (Round Robin)
                const parentMoon = createdMoons[mIndex % createdMoons.length];

                // Orbit around parent moon
                const orbitRadius = physicsConfig.meteoriteOrbitRadius + (Math.random() * 5);
                const angle = Math.random() * Math.PI * 2;

                const metX = parentMoon.x + Math.cos(angle) * orbitRadius;
                const metY = parentMoon.y + Math.sin(angle) * orbitRadius;

                // Size mapping
                const radius = physicsConfig.meteoriteMinRadius + Math.random() * (physicsConfig.meteoriteMaxRadius - physicsConfig.meteoriteMinRadius);

                const metNode: GalaxyNode = {
                    id: `${chain.id}-met-${token.symbol}-${mIndex}`,
                    type: 'meteorite',
                    parentId: parentMoon.id, // Parent is the MOON
                    x: metX,
                    y: metY,
                    vx: 0,
                    vy: 0,
                    radius,
                    color: token.color || '#94a3b8', // Dimmer color
                    orbitRadius, // Relative to moon
                    orbitAngle: angle,
                    angularVelocity: physicsConfig.baseTokenAngularVel * 2 * (Math.random() > 0.5 ? 1 : -1), // Fast orbit
                    weight: token.marketCap || 0,
                    mass: 1,
                    data: token as any,
                    isDragging: false,
                    isSelected: false,
                    isHovered: false,
                    collisionGlow: 0,
                    radiusOffset: 0
                };
                nodes.push(metNode);
            });
        }
    });

    return {
        nodes,
        sunNode,
        planetNodes: nodes.filter(n => n.type === 'planet'),
        moonNodes: nodes.filter(n => n.type === 'moon'),
        meteoriteNodes: nodes.filter(n => n.type === 'meteorite'),
        timestamp: Date.now(),
    };
}

/**
 * Advance physics simulation by one tick
 * Implements "N-body lite" with deterministic orbit blending for stability
 */
export function tickGalaxy(state: GalaxyState, dt: number): void {
    const { nodes } = state;

    // 1. Reset Forces & Prepare
    // We don't reset velocity here, we modify it.
    // Identify groups for optimized gravity
    const planets = nodes.filter(n => n.type === 'planet');
    const moons = nodes.filter(n => n.type === 'moon');
    const asteroids = nodes.filter(n => n.type === 'meteorite'); // Using 'meteorite' as 'asteroid' for now

    for (const node of nodes) {
        if (node.type === 'sun') {
            resetNodePhysics(node);
            continue;
        }

        // --- Step 1: Apply Gravity (N-Body Lite) ---
        // Sun pulls everything
        applyGravity(node, state.sunNode, physicsConfig.sunGravity, dt);

        // Planets pull their own moons
        if (node.type === 'moon' && node.parentId) {
            const parent = planets.find(p => p.id === node.parentId);
            if (parent) {
                applyGravity(node, parent, physicsConfig.planetGravity, dt);
            }
        }

        // Moons pull their own asteroids
        if (node.type === 'meteorite' && node.parentId) {
            const parent = moons.find(m => m.id === node.parentId);
            if (parent) {
                applyGravity(node, parent, physicsConfig.moonGravity, dt);
            }
        }

        // --- Step 2: Deterministic Orbit Correction ---
        // Calculate ideal orbital position
        node.orbitAngle += node.angularVelocity * dt;
        if (node.orbitAngle > Math.PI * 2) node.orbitAngle -= Math.PI * 2;

        let centerX = 0;
        let centerY = 0;
        let parentNode: GalaxyNode | undefined;

        if (node.type === 'planet') {
            centerX = 0;
            centerY = 0;
        } else if (node.parentId) {
            parentNode = nodes.find(n => n.id === node.parentId);
            if (parentNode) {
                centerX = parentNode.x;
                centerY = parentNode.y;
            }
        }

        const idealX = centerX + Math.cos(node.orbitAngle) * node.orbitRadius;
        const idealY = centerY + Math.sin(node.orbitAngle) * node.orbitRadius;

        // Blend: 80% Physics (current pos + vel), 20% Correction (pull towards ideal)
        // Instead of hard setting, we apply a "correction force" or spring
        const correctionStrength = physicsConfig.orbitCorrectionStrength; // Use config value
        const dx = idealX - node.x;
        const dy = idealY - node.y;

        node.vx += dx * correctionStrength * dt;
        node.vy += dy * correctionStrength * dt;

        // --- Step 3: Apply Repulsion (Collision Prevention) ---
        // Check vs other nodes to prevent overlap
        // Optimization: Check only relevant neighbors if possible, but for <500 nodes, O(N^2) is okay-ish if optimized
        // Let's do simple type-based checks

        if (node.type === 'planet') {
            // Planets repel other planets
            planets.forEach(other => {
                if (node.id !== other.id) applyRepulsion(node, other, dt);
            });
        } else if (node.type === 'moon') {
            // Moons ONLY repel moons in SAME system (same parentId)
            // This prevents expensive cross-system checks and reduces oscillation
            moons.forEach(other => {
                if (node.id !== other.id && node.parentId === other.parentId) {
                    applyRepulsion(node, other, dt, 1.0); // INCREASED from 0.5 to prevent overlaps
                }
            });
            // REDUCED repulsion from parent planet (was 2.0, now 0.5)
            // Moons should orbit close to parent, not be pushed away strongly
            const parentPlanet = planets.find(p => p.id === node.parentId);
            if (parentPlanet) {
                applyRepulsion(node, parentPlanet, dt, 0.5);
            }
        }

        // --- Step 4: Update Position & Velocity ---
        // Apply type-specific friction (moons get more damping due to faster movement)
        const frictionValue = node.type === 'moon' || node.type === 'meteorite'
            ? physicsConfig.moonFriction
            : physicsConfig.friction;
        node.vx *= frictionValue;
        node.vy *= frictionValue;

        // Cap Velocity (Stability)
        const vSq = node.vx * node.vx + node.vy * node.vy;
        if (vSq > physicsConfig.maxVelocity * physicsConfig.maxVelocity) {
            const v = Math.sqrt(vSq);
            node.vx = (node.vx / v) * physicsConfig.maxVelocity;
            node.vy = (node.vy / v) * physicsConfig.maxVelocity;
        }

        // Update Position
        node.x += node.vx * dt;
        node.y += node.vy * dt;

        // Decay Visuals
        decayVisuals(node);
    }
}

// --- Helpers ---

function applyGravity(node: GalaxyNode, attractor: GalaxyNode, G: number, dt: number) {
    const dx = attractor.x - node.x;
    const dy = attractor.y - node.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq) || 1;

    // F = G * m1 * m2 / r^2
    // We simplify: F = G * mass / dist (linear falloff for stability) or standard gravity
    // Let's use a stable pull: Force proportional to distance (spring-like) for orbits, 
    // or inverse square for real gravity.
    // User requested "N-body lite", sun pulls all.
    // For stable orbits, a central force F = v^2 / r is needed.
    // Let's just add a vector towards center scaled by G.

    // F = ma -> a = F/m
    // We want 'a' to be applied to velocity.
    // Force = G * attractorMass / dist
    // Accel = Force / nodeMass

    const nodeMass = node.mass || 1;
    const force = G * (attractor.mass || 100) / dist; // Simplified gravity force
    const accel = force / nodeMass; // Apply F=ma

    const nx = dx / dist;
    const ny = dy / dist;

    node.vx += nx * accel * dt;
    node.vy += ny * accel * dt;
}

function applyRepulsion(node: GalaxyNode, other: GalaxyNode, dt: number, multiplier: number = 1.0) {
    const dx = node.x - other.x;
    const dy = node.y - other.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq) || 0.001; // Avoid divide by zero

    const sumRadii = node.radius + other.radius;
    const minDist = sumRadii + physicsConfig.collidePadding;

    if (dist < minDist) {
        // 1. Soft Repulsion (Linear Spring)
        // Force proportional to normalized overlap (0 to 1)
        const overlap = minDist - dist;
        const overlapRatio = overlap / sumRadii;
        const forceMag = physicsConfig.repulsion * overlapRatio * multiplier;

        const nx = dx / dist;
        const ny = dy / dist;

        // 2. Collision Damping (Inelasticity)
        // Project relative velocity onto collision normal
        const rvx = node.vx - other.vx;
        const rvy = node.vy - other.vy;
        const relVelProj = rvx * nx + rvy * ny;

        // Apply damping if moving towards each other (relVelProj < 0)
        let dampingForce = 0;
        if (relVelProj < 0) {
            dampingForce = -physicsConfig.damper * relVelProj;
        }

        const totalForce = forceMag + dampingForce;

        // Apply to this node
        // Note: In a full N-body loop where we check every pair once, we'd apply to both.
        // Here we iterate all nodes and check neighbors, so 'other' will eventually be 'node'.
        // However, for damping to work best, we should apply to both or ensure symmetry.
        // Given the loop structure (node vs all planets/moons), it's safer to apply to 'node' only
        // effectively treating 'other' as an immovable wall for this calculation, 
        // BUT 'other' will get its turn. 
        // To prevent double-counting or asymmetry issues with damping, we should be careful.
        // For now, applying to node is consistent with previous logic.

        // F = ma -> a = F/m
        const nodeMass = node.mass || 1;
        const accel = totalForce / nodeMass;

        node.vx += nx * accel * dt;
        node.vy += ny * accel * dt;

        // Trigger Glow
        node.collisionGlow = 1.0;
    }
}

function resetNodePhysics(node: GalaxyNode) {
    node.x = 0;
    node.y = 0;
    node.vx = 0;
    node.vy = 0;
}

function decayVisuals(node: GalaxyNode) {
    if (node.collisionGlow && node.collisionGlow > 0.01) {
        node.collisionGlow *= physicsConfig.collisionGlowDecay;
    } else {
        node.collisionGlow = 0;
    }
}

function lerp(min: number, max: number, t: number): number {
    return min + (max - min) * Math.max(0, Math.min(1, t));
}

export function calculateBTCWeight(btc: BTCData, mode: WeightMode): number {
    switch (mode) {
        case 'TVL': return btc.marketCap * 0.1; // Arbitrary scaling for TVL mode
        case 'MarketCap': return btc.marketCap;
        case 'Volume24h': return btc.volume24h;
        case 'Change24h': return Math.abs(btc.change24h);
        default: return btc.marketCap;
    }
}

export function calculatePlanetRadius(weight: number, minWeight: number, maxWeight: number): number {
    if (weight <= 0) return physicsConfig.minPlanetRadius;

    const logWeight = Math.log10(weight || 1);
    const logMin = Math.log10(minWeight || 1);
    const logMax = Math.log10(maxWeight || 1);

    const t = (logWeight - logMin) / (logMax - logMin || 1);

    return physicsConfig.minPlanetRadius + t * (physicsConfig.maxPlanetRadius - physicsConfig.minPlanetRadius);
}

export function calculateMoonRadius(marketCap: number): number {
    // Legacy fallback, actual sizing done in initGalaxyState
    return Math.max(physicsConfig.minTokenRadius, Math.min(physicsConfig.maxTokenRadius, Math.log10(marketCap || 1) * 2));
}

export function getNodeById(state: GalaxyState, id: string): GalaxyNode | undefined {
    return state.nodes.find(n => n.id === id);
}
