// Phase 2: Physics Engine (Refined)
// Deterministic orbital mechanics with ring layouts, nested orbits, and scoped collisions

import type { GalaxyData, GalaxyState, GalaxyNode, ChainData, BTCData, WeightMode } from "@/types/galaxy";
import { physicsConfig } from "@/config/physicsConfig";
import { debugLog } from "@/utils/debug";

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
                    vx: (Math.random() - 0.5) * 0.5 + (index * 0.01), // Better randomization per planet
                    vy: (Math.random() - 0.5) * 0.5 + (tIndex * 0.01),
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
 * Moons/meteorites use deterministic orbits, planets use velocity physics
 */
export function tickGalaxy(state: GalaxyState, dt: number): void {
    const { nodes } = state;

    const planets = nodes.filter(n => n.type === 'planet');
    const moons = nodes.filter(n => n.type === 'moon');

    for (const node of nodes) {
        if (node.type === 'sun') {
            resetNodePhysics(node);
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

        // --- Step 3: Decay orbit radius back to base ---
        const baseRadius = baseOrbitRadii.get(node.id);
        if (baseRadius !== undefined && node.orbitRadius > baseRadius) {
            // Slowly decay back to base orbit (0.5% per tick)
            node.orbitRadius = node.orbitRadius * 0.995 + baseRadius * 0.005;
        }

        // --- Step 4: Calculate ideal position and set it ---
        const idealX = centerX + Math.cos(node.orbitAngle) * node.orbitRadius;
        const idealY = centerY + Math.sin(node.orbitAngle) * node.orbitRadius;

        if (node.type === 'moon' || node.type === 'meteorite') {
            // Deterministic: directly set position
            node.x = idealX;
            node.y = idealY;
            node.vx = 0;
            node.vy = 0;
        } else if (node.type === 'planet') {
            // Planets: Use deterministic orbits like moons for stability
            // The gravity/velocity system was causing drift over time
            // Just set position directly based on orbit angle and radius
            node.x = idealX;
            node.y = idealY;
            node.vx = 0;
            node.vy = 0;
        }

        // --- Step 5: Collision detection (moon vs moon, moon vs planet) ---
        if (node.type === 'moon') {
            // Moon vs other moons (same parent = stronger push)
            moons.forEach(other => {
                if (node.id !== other.id) {
                    const sameParent = node.parentId === other.parentId;
                    applyMoonCollision(node, other, sameParent ? 1.5 : 0.3);
                }
            });

            // Moon vs parent planet (push outward)
            if (parentNode) {
                applyMoonCollision(node, parentNode, 2.0);
            }
        }

        // --- Step 6: Velocity physics only needed for future non-deterministic bodies ---
        // Planets are now deterministic, so this block is a fallback
        if (node.type !== 'planet' && node.type !== 'moon' && node.type !== 'meteorite' && node.type !== 'sun') {
            node.vx *= physicsConfig.friction;
            node.vy *= physicsConfig.friction;

            const vSq = node.vx * node.vx + node.vy * node.vy;
            if (vSq > physicsConfig.maxVelocity * physicsConfig.maxVelocity) {
                const v = Math.sqrt(vSq);
                node.vx = (node.vx / v) * physicsConfig.maxVelocity;
                node.vy = (node.vy / v) * physicsConfig.maxVelocity;
            }

            node.x += node.vx * dt;
            node.y += node.vy * dt;

            // Bounds check
            const distFromCenter = Math.sqrt(node.x * node.x + node.y * node.y);
            if (distFromCenter > physicsConfig.galaxyBounds) {
                const nx = node.x / distFromCenter;
                const ny = node.y / distFromCenter;
                node.x = nx * physicsConfig.galaxyBounds;
                node.y = ny * physicsConfig.galaxyBounds;
            }
        }

        // Decay visuals
        decayVisuals(node);
    }
}

/**
 * Apply collision between moons - pushes orbit radius outward temporarily
 */
function applyMoonCollision(node: GalaxyNode, other: GalaxyNode, strength: number) {
    const dx = node.x - other.x;
    const dy = node.y - other.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

    const sumRadii = node.radius + other.radius;
    const minDist = sumRadii + physicsConfig.collidePadding;

    if (dist < minDist) {
        const overlap = minDist - dist;
        
        // Push orbit radius outward (will decay back)
        const pushAmount = overlap * 0.15 * strength;
        node.orbitRadius += pushAmount;
        
        // Cap max orbit expansion to 50% above base
        const baseRadius = baseOrbitRadii.get(node.id);
        if (baseRadius !== undefined) {
            const maxOrbit = baseRadius * 1.5;
            if (node.orbitRadius > maxOrbit) {
                node.orbitRadius = maxOrbit;
            }
        }

        // Trigger glow
        node.collisionGlow = Math.min(1.0, (node.collisionGlow || 0) + 0.5);
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
