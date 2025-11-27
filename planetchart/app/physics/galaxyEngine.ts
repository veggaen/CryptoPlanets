// Phase 2: Physics Engine (Refined)
// Deterministic orbital mechanics with ring layouts, nested orbits, and HARD collisions

import type { GalaxyData, GalaxyState, GalaxyNode, ChainData, BTCData, WeightMode } from "@/types/galaxy";
import { physicsConfig } from "@/config/physicsConfig";
import { debugLog } from "@/utils/debug";
import { resolveAllCollisions, updateParticles, decayCollisionGlow, updateFlungMoons, isMoonFlung } from "./collision";

// Store base orbit radii for moons (to decay back to after collision push)
const baseOrbitRadii = new Map<string, number>();

/**
 * Initialize galaxy physics state from data
 * Determines dynamic sun, assigns orbit radii, and creates nodes
 */
export function initGalaxyState(data: GalaxyData): GalaxyState {
    debugLog('physics', `initGalaxyState called with mode: ${data.metric}`);

    // Clear base orbit tracking
    baseOrbitRadii.clear();

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

            // Sort tokens by marketCap for hierarchy (biggest = most important)
            const sortedTokens = [...chain.tokens].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

            // Split into Moons (Top N) and Meteorites (Rest)
            const moonCount = Math.min(sortedTokens.length, physicsConfig.maxMoonsPerPlanet);
            const moons = sortedTokens.slice(0, moonCount);
            const meteorites = sortedTokens.slice(moonCount, moonCount + physicsConfig.maxMeteoritesPerPlanet);

            const createdMoons: GalaxyNode[] = [];

            // 1. Create MOONS (Chaotic Asteroid Field Layout)
            moons.forEach((token, tIndex) => {
                // Base ring calculation (looser than before)
                const ringIndex = Math.floor(tIndex / physicsConfig.moonSlotsPerRing);
                const slotIndex = tIndex % physicsConfig.moonSlotsPerRing;

                // Radius with LARGE random variance for asteroid field feel
                const ringBaseRadius = planetRadius + physicsConfig.baseMoonOrbitRadius + (ringIndex * physicsConfig.moonRingStep);
                const radiusVariance = (physicsConfig.moonOrbitRadiusVariance || 800);
                const moonOrbitRadius = ringBaseRadius + (Math.random() * radiusVariance * 2 - radiusVariance);

                // Random starting angle (completely random, no slots)
                const moonAngle = Math.random() * Math.PI * 2;
                
                // Random eccentricity for elliptical orbits
                const eccentricity = Math.random() * (physicsConfig.moonOrbitEccentricity || 0.25);

                const moonX = x + Math.cos(moonAngle) * moonOrbitRadius;
                const moonY = y + Math.sin(moonAngle) * moonOrbitRadius;

                // LOG SCALE for dramatic size differentiation
                // log10($13B) = 10.1, log10($100M) = 8.0 → difference of 2.1
                const tokenCap = token.marketCap || 1;
                
                // Find max and min market cap among this chain's moons
                const moonCaps = moons.map(m => m.marketCap || 1);
                const maxMoonCap = Math.max(...moonCaps);
                const minMoonCap = Math.min(...moonCaps.filter(c => c > 0));
                
                // Log scale: normalize between 0 and 1
                const logMax = Math.log10(maxMoonCap);
                const logMin = Math.log10(minMoonCap);
                const logToken = Math.log10(tokenCap);
                
                // Normalized 0-1 based on log scale
                const logRange = logMax - logMin || 1;
                const normalizedLog = (logToken - logMin) / logRange;
                
                // Map to radius range with FULL range utilization
                let radius = physicsConfig.moonMinRadius + 
                    normalizedLog * (physicsConfig.moonMaxRadius - physicsConfig.moonMinRadius);

                // Clamp to range
                radius = Math.max(physicsConfig.moonMinRadius, Math.min(physicsConfig.moonMaxRadius, radius));
                
                // Hard cap: moon can never exceed 20% of planet radius
                const maxMoonRelative = 0.20;
                if (radius > planetRadius * maxMoonRelative) {
                    radius = planetRadius * maxMoonRelative;
                }

                const moonId = `${chain.id}-${token.symbol}-${tIndex}`;
                
                // Store base orbit radius for decay
                baseOrbitRadii.set(moonId, moonOrbitRadius);
                
                const moonNode: GalaxyNode = {
                    id: moonId,
                    type: 'moon',
                    parentId: chain.id,
                    x: moonX,
                    y: moonY,
                    vx: 0, // No initial velocity - calm orbits
                    vy: 0,
                    radius,
                    color: token.color || '#cbd5e1',
                    orbitRadius: moonOrbitRadius,
                    orbitAngle: moonAngle,
                    angularVelocity: physicsConfig.baseTokenAngularVel * (0.8 + Math.random() * 0.4) * (Math.random() > 0.5 ? 1 : -1), // Slight speed variance, random direction
                    weight: token.marketCap,
                    mass: 10 + Math.random() * 10, // Slight mass variance
                    orbitEccentricity: eccentricity, // Store for elliptical orbit
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
                if (createdMoons.length === 0) return;

                const parentMoon = createdMoons[mIndex % createdMoons.length];
                const orbitRadius = physicsConfig.meteoriteOrbitRadius + (Math.random() * 5);
                const angle = Math.random() * Math.PI * 2;

                const metX = parentMoon.x + Math.cos(angle) * orbitRadius;
                const metY = parentMoon.y + Math.sin(angle) * orbitRadius;

                const radius = physicsConfig.meteoriteMinRadius + Math.random() * (physicsConfig.meteoriteMaxRadius - physicsConfig.meteoriteMinRadius);

                const metId = `${chain.id}-met-${token.symbol}-${mIndex}`;
                baseOrbitRadii.set(metId, orbitRadius);

                const metNode: GalaxyNode = {
                    id: metId,
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

    // --- Compute size ratios ---
    // Planets compare to next-largest planet
    // Moons compare to next-largest moon on the SAME chain
    // Sun compares to largest planet
    
    // Sort planets by weight descending (including sun)
    const sunAndPlanets = nodes.filter(n => n.type === 'sun' || n.type === 'planet');
    const sortedPlanets = sunAndPlanets.sort((a, b) => b.weight - a.weight);
    
    for (let i = 0; i < sortedPlanets.length; i++) {
        const node = sortedPlanets[i];
        const nextNode = sortedPlanets[i + 1];
        
        if (nextNode && nextNode.weight > 0) {
            node.sizeRatio = node.weight / nextNode.weight;
            const nextSymbol = ('symbol' in nextNode.data ? nextNode.data.symbol : null)
                || ('name' in nextNode.data ? nextNode.data.name : null)
                || nextNode.id.toUpperCase();
            node.nextEntitySymbol = nextSymbol;
        } else {
            node.sizeRatio = undefined;
            node.nextEntitySymbol = undefined;
        }
    }
    
    // Compute sunMultiplier for all non-sun nodes (how many x to reach sun's market cap)
    const sunWeight = sunNode.weight;
    for (const node of nodes) {
        if (node.type !== 'sun' && node.weight > 0) {
            node.sunMultiplier = sunWeight / node.weight;
        }
    }
    
    // Group moons by parent chain
    const moonsByChain: Record<string, GalaxyNode[]> = {};
    for (const moon of nodes.filter(n => n.type === 'moon')) {
        const chainId = moon.parentId || 'unknown';
        if (!moonsByChain[chainId]) moonsByChain[chainId] = [];
        moonsByChain[chainId].push(moon);
    }
    
    // For each chain, sort moons by weight and compute ratios
    for (const chainId of Object.keys(moonsByChain)) {
        const chainMoons = moonsByChain[chainId].sort((a, b) => b.weight - a.weight);
        
        for (let i = 0; i < chainMoons.length; i++) {
            const moon = chainMoons[i];
            const nextMoon = chainMoons[i + 1];
            
            if (nextMoon && nextMoon.weight > 0) {
                moon.sizeRatio = moon.weight / nextMoon.weight;
                const nextSymbol = ('symbol' in nextMoon.data ? nextMoon.data.symbol : null)
                    || ('name' in nextMoon.data ? nextMoon.data.name : null)
                    || nextMoon.id.toUpperCase();
                moon.nextEntitySymbol = nextSymbol;
            } else {
                // Last/smallest moon on this chain
                moon.sizeRatio = undefined;
                moon.nextEntitySymbol = undefined;
            }
        }
    }

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
 * Moons use DETERMINISTIC orbits with gentle wobble for variety
 * NOT full velocity physics - just calm orbiting with slight variations
 */
export function tickGalaxy(state: GalaxyState, dt: number): void {
    const { nodes } = state;

    for (const node of nodes) {
        if (node.type === 'sun') {
            resetNodePhysics(node);
            continue;
        }
        
        // Skip flung moons - they're handled by updateFlungMoons
        if (isMoonFlung(node.id)) {
            continue;
        }

        // --- Step 1: Advance orbit angle ---
        node.orbitAngle += node.angularVelocity * dt;
        if (node.orbitAngle > Math.PI * 2) node.orbitAngle -= Math.PI * 2;
        if (node.orbitAngle < 0) node.orbitAngle += Math.PI * 2;

        // --- Step 2: Calculate parent center ---
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

        // --- Step 3: Calculate ideal orbital position ---
        const baseRadius = baseOrbitRadii.get(node.id) || node.orbitRadius;
        let effectiveRadius = node.orbitRadius;
        
        if (node.type === 'moon') {
            const eccentricity = node.orbitEccentricity || 0;
            effectiveRadius = node.orbitRadius * (1 + eccentricity * Math.cos(node.orbitAngle));
        }
        
        const idealX = centerX + Math.cos(node.orbitAngle) * effectiveRadius;
        const idealY = centerY + Math.sin(node.orbitAngle) * effectiveRadius;

        // --- Step 4: Handle moon physics (velocity-based when hit, orbital otherwise) ---
        if (node.type === 'moon') {
            // Check if moon has significant velocity from collision
            const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
            
            if (speed > 0.5) {
                // Moon was hit! Use velocity-based movement
                node.x += node.vx * dt * 60;
                node.y += node.vy * dt * 60;
                
                // Gradually decay velocity (friction)
                node.vx *= 0.985;
                node.vy *= 0.985;
                
                // Gentle pull back toward orbit (gravity-like)
                const pullStrength = 0.002;
                node.vx += (idealX - node.x) * pullStrength;
                node.vy += (idealY - node.y) * pullStrength;
                
                // Update orbit angle to match actual position (so orbit continues from here)
                node.orbitAngle = Math.atan2(node.y - centerY, node.x - centerX);
                node.orbitRadius = Math.sqrt((node.x - centerX) ** 2 + (node.y - centerY) ** 2);
                
                // Slowly decay orbit radius back to base
                if (Math.abs(node.orbitRadius - baseRadius) > 10) {
                    node.orbitRadius = node.orbitRadius * 0.998 + baseRadius * 0.002;
                }
            } else {
                // Normal calm orbital motion
                node.x = idealX;
                node.y = idealY;
                node.vx = 0;
                node.vy = 0;
                
                // Decay orbit radius back to base
                if (Math.abs(node.orbitRadius - baseRadius) > 5) {
                    node.orbitRadius = node.orbitRadius * 0.995 + baseRadius * 0.005;
                }
            }
        } else {
            // Planets and meteorites: deterministic orbits
            node.x = idealX;
            node.y = idealY;
        }
    }
    
    // --- Step 5: Update flung moons (supernova ejection physics) ---
    updateFlungMoons(nodes, dt);
    
    // --- Step 6: HARD collision detection for all pairs ---
    // Collisions give moons velocity, which makes them deviate from orbit
    resolveAllCollisions(nodes, (nodeId) => baseOrbitRadii.get(nodeId));
    
    // --- Step 7: Update particle effects ---
    updateParticles(dt);
    
    // --- Step 8: Decay collision glow ---
    decayCollisionGlow(nodes);
}

// Legacy function - kept for compatibility but now uses new system
function applyMoonCollision(node: GalaxyNode, other: GalaxyNode, strength: number) {
    // This is now handled by resolveAllCollisions
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

export function calculatePlanetRadius(weight: number, _minWeight: number, sunWeight: number): number {
    if (weight <= 0) return physicsConfig.minPlanetRadius;

    // CORRECT SQRT SCALING: Area proportional to market cap relative to Sun
    // Formula: radius = sunRadius * sqrt(weight / sunWeight)
    // This ensures: if BTC is 5x ETH's cap, ETH area = BTC area / 5, ETH radius = BTC radius / sqrt(5)
    const ratio = weight / sunWeight;
    const sqrtRatio = Math.sqrt(ratio);
    
    // Scale from Sun's radius
    const radius = physicsConfig.sunRadius * sqrtRatio;

    // Clamp between min and max for visibility
    return Math.max(physicsConfig.minPlanetRadius, Math.min(physicsConfig.maxPlanetRadius, radius));
}

export function calculateMoonRadius(marketCap: number): number {
    // Legacy fallback, actual sizing done in initGalaxyState
    return Math.max(physicsConfig.minTokenRadius, Math.min(physicsConfig.maxTokenRadius, Math.log10(marketCap || 1) * 2));
}

export function getNodeById(state: GalaxyState, id: string): GalaxyNode | undefined {
    return state.nodes.find(n => n.id === id);
}

/**
 * Get the base orbit radius for a moon (used for supernova return)
 */
export function getBaseOrbitRadius(nodeId: string): number | undefined {
    return baseOrbitRadii.get(nodeId);
}
