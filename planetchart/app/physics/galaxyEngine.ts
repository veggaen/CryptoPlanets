// Phase 2: Physics Engine (Refined)
// Deterministic orbital mechanics with ring layouts, nested orbits, and HARD collisions

import type { GalaxyData, GalaxyState, GalaxyNode, ChainData, BTCData, WeightMode } from "@/types/galaxy";
import { physicsConfig } from "@/config/physicsConfig";
import { debugLog } from "@/utils/debug";
import { resolveAllCollisions, updateParticles, decayCollisionGlow, updateFlungMoons, isMoonFlung, applyProximityGlow, collisionConfig } from "./collision";

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

    const tokenWeightForMetric = (token: any): number => {
        if (data.metric === 'TVL') return typeof token?.liquidity === 'number' ? token.liquidity : 0;
        if (data.metric === 'Volume24h') return typeof token?.volume24h === 'number' ? token.volume24h : 0;
        return typeof token?.marketCap === 'number' ? token.marketCap : 0;
    };

    const tokenWeights: number[] = [];
    for (const chain of data.chains) {
        for (const token of chain.tokens) {
            const w = tokenWeightForMetric(token);
            if (typeof w === 'number' && Number.isFinite(w) && w > 0) {
                tokenWeights.push(w);
            }
        }
    }

    const globalTokenMax = tokenWeights.length ? Math.max(...tokenWeights) : 0;
    const globalTokenMin = tokenWeights.length ? Math.min(...tokenWeights) : 0;

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

            // Sort tokens by active metric for hierarchy (biggest = most important)
            const sortedTokens = [...chain.tokens].sort((a, b) => {
                const bw = tokenWeightForMetric(b);
                const aw = tokenWeightForMetric(a);
                return (bw - aw) || ((b.marketCap || 0) - (a.marketCap || 0));
            });

            // Split into Moons (Top N) and Meteorites (Rest)
            const moonCount = Math.min(sortedTokens.length, physicsConfig.maxMoonsPerPlanet);
            const moons = sortedTokens.slice(0, moonCount);
            const meteorites = sortedTokens.slice(moonCount, moonCount + physicsConfig.maxMeteoritesPerPlanet);

            const createdMoons: GalaxyNode[] = [];

            // 1. Create MOONS (Deterministic ring + slot allocator)
            moons.forEach((token, tIndex) => {
                const ringIndex = Math.floor(tIndex / physicsConfig.moonSlotsPerRing);
                const slotIndex = tIndex % physicsConfig.moonSlotsPerRing;
                const slotCount = physicsConfig.moonSlotsPerRing;

                // Deterministic ring radius with gentle jitter for life
                const ringBaseRadius = planetRadius + physicsConfig.baseMoonOrbitRadius + (ringIndex * physicsConfig.moonRingStep);
                const radiusVariance = Math.min(physicsConfig.moonOrbitRadiusVariance || 0, physicsConfig.moonRingStep * 0.4);
                const moonOrbitRadius = ringBaseRadius + (radiusVariance ? (Math.random() * radiusVariance - radiusVariance / 2) : 0);

                // Slot-based angle to prevent overlap
                const angleStep = (Math.PI * 2) / slotCount;
                const planetPhaseOffset = index * 0.137; // Golden angle offset per planet for desync
                const slotBaseAngle = (slotIndex * angleStep) + planetPhaseOffset;
                const slotJitterRange = angleStep * 0.2; // stay within reserved slot span
                const slotJitter = (Math.random() * 2 - 1) * slotJitterRange;
                const moonAngle = slotBaseAngle + slotJitter;

                // Random eccentricity for elliptical feel (small)
                const eccentricity = Math.random() * Math.min(physicsConfig.moonOrbitEccentricity || 0, 0.2);

                const moonX = x + Math.cos(moonAngle) * moonOrbitRadius;
                const moonY = y + Math.sin(moonAngle) * moonOrbitRadius;

                // ===== GLOBAL LOG SCALE based on ACTIVE METRIC =====
                // Use a consistent global range across all tokens in this response.
                const tokenWeight = tokenWeightForMetric(token);
                const resolvedMax = globalTokenMax > 0 ? globalTokenMax : Math.max(tokenWeight, 1);
                const resolvedMin = globalTokenMin > 0 ? globalTokenMin : Math.max(resolvedMax * 1e-6, 1);

                const safeWeight = tokenWeight > 0 ? tokenWeight : resolvedMin;
                const clampedWeight = clamp(safeWeight, resolvedMin, resolvedMax);

                const logMax = Math.log10(resolvedMax);
                const logMin = Math.log10(resolvedMin);
                const logToken = Math.log10(clampedWeight);
                const logRange = Math.max(1e-6, logMax - logMin);
                const normalizedLog = Math.max(0, Math.min(1, (logToken - logMin) / logRange));
                
                // Map to radius range with FULL range utilization
                // Use CUBIC easing for more dramatic size differences
                const easedNorm = normalizedLog * normalizedLog * normalizedLog;
                let radius = physicsConfig.moonMinRadius + 
                    easedNorm * (physicsConfig.moonMaxRadius - physicsConfig.moonMinRadius);

                // Clamp to range
                radius = Math.max(physicsConfig.moonMinRadius, Math.min(physicsConfig.moonMaxRadius, radius));
                
                // Hard cap: moon can never exceed 20% of planet radius
                const maxMoonRelative = data.metric === 'TVL' ? 0.30 : 0.20;
                if (radius > planetRadius * maxMoonRelative) {
                    radius = planetRadius * maxMoonRelative;
                }

                const moonId = `${chain.id}-${token.symbol}-${tIndex}`;
                
                // Heavier metric weight = more mass = harder to move in collision
                const moonMass = 5 + (normalizedLog * 45);
                
                // Calculate angular velocity for orbit
                const angularVel = physicsConfig.baseTokenAngularVel * (0.8 + Math.random() * 0.4) * (Math.random() > 0.5 ? 1 : -1);
                
                // NO INITIAL VELOCITY - moons start in calm orbital mode
                // Velocity only gets applied when hit by collision
                
                const moonNode: GalaxyNode = {
                    id: moonId,
                    type: 'moon',
                    parentId: node.id,
                    x: moonX,
                    y: moonY,
                    vx: 0,
                    vy: 0,
                    radius,
                    color: token.color || '#cbd5e1',
                    orbitRadius: moonOrbitRadius,
                    orbitAngle: moonAngle,
                    angularVelocity: angularVel,
                    targetOrbitRadius: moonOrbitRadius,
                    baseOrbitAngle: slotBaseAngle,
                    targetOrbitAngle: moonAngle,
                    angleOffset: slotJitter,
                    ringIndex,
                    slotIndex,
                    slotCount,
                    slotSpan: angleStep,
                    weight: tokenWeight,
                    mass: moonMass, // Mass based on market cap for bowling ball physics!
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

            if (createdMoons.length > 0) {
                const totalRadius = createdMoons.reduce((sum, moon) => sum + moon.radius, 0);
                const avgRadius = totalRadius / createdMoons.length;
                const innerBias = physicsConfig.fieldInnerSizeBias ?? 0;
                const outerBias = physicsConfig.fieldOuterSizeBias ?? 0;
                const baseInner = planetRadius + (physicsConfig.fieldInnerPadding ?? 0) + avgRadius * innerBias;
                const thickness = (physicsConfig.fieldBaseThickness ?? 0)
                    + createdMoons.length * (physicsConfig.fieldPerMoonSpread ?? 0)
                    + avgRadius * (physicsConfig.fieldMoonSizeSpread ?? 0);
                const baseOuter = baseInner + thickness;

                for (const moonNode of createdMoons) {
                    const inner = baseInner + moonNode.radius * innerBias;
                    const outer = baseOuter + moonNode.radius * outerBias;
                    const safeInner = Math.min(inner, outer - 10);
                    const safeOuter = Math.max(outer, inner + 10);
                    moonNode.fieldInnerRadius = safeInner;
                    moonNode.fieldOuterRadius = safeOuter;
                    moonNode.fieldMidRadius = (safeInner + safeOuter) * 0.5;
                    const clampedRadius = clamp(moonNode.orbitRadius, safeInner, safeOuter);
                    if (clampedRadius !== moonNode.orbitRadius) {
                        moonNode.orbitRadius = clampedRadius;
                        moonNode.targetOrbitRadius = clampedRadius;
                        const relAngle = Math.atan2(moonNode.y - node.y, moonNode.x - node.x);
                        moonNode.orbitAngle = relAngle;
                        const renderRadius = moonNode.orbitEccentricity
                            ? clampedRadius * (1 + moonNode.orbitEccentricity * Math.cos(moonNode.orbitAngle))
                            : clampedRadius;
                        moonNode.x = node.x + Math.cos(moonNode.orbitAngle) * renderRadius;
                        moonNode.y = node.y + Math.sin(moonNode.orbitAngle) * renderRadius;
                    }
                    baseOrbitRadii.set(moonNode.id, clampedRadius);
                }
            }

            // 2. Create METEORITES (Orbiting Moons)
            meteorites.forEach((token, mIndex) => {
                if (createdMoons.length === 0) return;

                const parentMoon = createdMoons[mIndex % createdMoons.length];
                const orbitRadius = physicsConfig.meteoriteOrbitRadius + (Math.random() * 50) - 25; // More variance
                const angle = Math.random() * Math.PI * 2;

                const metX = parentMoon.x + Math.cos(angle) * orbitRadius;
                const metY = parentMoon.y + Math.sin(angle) * orbitRadius;

                // Size based on market cap (smaller meteorites for smaller caps)
                const metCap = token.marketCap || 100000;
                const capNormalized = Math.log10(Math.max(metCap, 100000)) / 10; // 0-1 range roughly
                const radius = physicsConfig.meteoriteMinRadius + 
                    capNormalized * (physicsConfig.meteoriteMaxRadius - physicsConfig.meteoriteMinRadius);

                const metId = `${chain.id}-met-${token.symbol}-${mIndex}`;
                baseOrbitRadii.set(metId, orbitRadius);
                
                // SMALLER meteorites orbit FASTER (Kepler's laws - inversely proportional to distance)
                // Also: smaller mass = faster (think small asteroids vs big rocks)
                const sizeRatio = radius / physicsConfig.meteoriteMaxRadius; // 0-1, bigger = closer to 1
                const speedMultiplier = 3 - (sizeRatio * 2); // Range: 1-3x, smaller = faster

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
                    targetOrbitRadius: orbitRadius,
                    baseOrbitAngle: angle,
                    targetOrbitAngle: angle,
                    angleOffset: 0,
                    angularVelocity: physicsConfig.baseTokenAngularVel * speedMultiplier * (Math.random() > 0.5 ? 1 : -1), // Smaller = faster!
                    weight: token.marketCap || 0,
                    mass: 0.5 + (sizeRatio * 1.5), // Smaller mass for smaller meteorites
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
    const ANGLE_EASE = 0.2;
    const RADIUS_EASE = 0.12;

    for (const node of nodes) {
        if (node.type === 'sun') {
            resetNodePhysics(node);
            continue;
        }

        const prevOrbitRadius = node.orbitRadius;
        const prevOrbitAngle = node.orbitAngle;
        const wasFree = (node.freeOrbitTimer ?? 0) > 0;
        const wasBlending = (node.railBlendTimer ?? 0) > 0;
        const fieldBounds = getFieldBounds(node);
        
        // Skip flung moons - they're handled by updateFlungMoons
        if (isMoonFlung(node.id)) {
            continue;
        }

        const isFreeOrbiting = (node.freeOrbitTimer ?? 0) > 0;
        if (isFreeOrbiting) {
            node.freeOrbitTimer = Math.max(0, (node.freeOrbitTimer ?? 0) - dt);
        } else if (node.freeOrbitTimer) {
            node.freeOrbitTimer = 0;
            node.freeOrbitDurationTotal = 0;
        }

        const isRailBlending = !isFreeOrbiting && (node.railBlendTimer ?? 0) > 0;
        if (isRailBlending) {
            node.railBlendTimer = Math.max(0, (node.railBlendTimer ?? 0) - dt);
        } else if (!isFreeOrbiting && node.railBlendTimer) {
            node.railBlendTimer = 0;
        }

        if (node.slotReleaseTimer && node.slotReleaseTimer > 0) {
            node.slotReleaseTimer = Math.max(0, node.slotReleaseTimer - dt);
        } else if (node.slotReleaseTimer) {
            node.slotReleaseTimer = 0;
        }

        // --- Step 1: Advance target orbit angle deterministically ---
        if (typeof node.targetOrbitAngle !== 'number') {
            node.targetOrbitAngle = node.orbitAngle;
        }
        if (!isFreeOrbiting) {
            node.targetOrbitAngle = normalizeAngle(node.targetOrbitAngle + node.angularVelocity * dt);
        }

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

        // --- Step 3: Determine base/target orbit radius ---
        const baseRadius = baseOrbitRadii.get(node.id) ?? node.orbitRadius;
        if (typeof node.targetOrbitRadius !== 'number') {
            node.targetOrbitRadius = baseRadius;
        }

        let minOrbitRadius: number | undefined = fieldBounds?.inner;
        let maxOrbitRadius: number | undefined = fieldBounds?.outer;

        const shouldClampOrbit = !(isFreeOrbiting || isRailBlending);

        if (!fieldBounds && node.type === 'moon') {
            const parentPlanet = parentNode;
            const minDistFromPlanet = parentPlanet ? parentPlanet.radius + node.radius + 80 : 0;
            minOrbitRadius = minDistFromPlanet + 40;
            maxOrbitRadius = baseRadius * 1.35;
        }

        if (shouldClampOrbit) {
            if (fieldBounds) {
                const targetRadius = node.targetOrbitRadius ?? baseRadius;
                const clampedRadius = clamp(targetRadius, fieldBounds.inner, fieldBounds.outer);
                const spring = Math.min(1, Math.max(physicsConfig.fieldSpringStrength ?? 0, 0));
                node.targetOrbitRadius = spring > 0
                    ? targetRadius + (clampedRadius - targetRadius) * spring
                    : clampedRadius;
            } else if (
                typeof minOrbitRadius === 'number' &&
                typeof maxOrbitRadius === 'number'
            ) {
                node.targetOrbitRadius = clamp(node.targetOrbitRadius ?? baseRadius, minOrbitRadius, maxOrbitRadius);
            }
        }

        if (!isFreeOrbiting && !isRailBlending) {
            const relaxRate = node.type === 'moon'
                ? (physicsConfig.fieldRelaxRate ?? 0.05)
                : 0.02;
            const preferredRadius = fieldBounds
                ? clamp(baseRadius, fieldBounds.inner, fieldBounds.outer)
                : baseRadius;
            node.targetOrbitRadius += (preferredRadius - node.targetOrbitRadius) * relaxRate;
        }

        const desiredRadius = node.targetOrbitRadius ?? baseRadius;
        let desiredRenderRadius = desiredRadius;
        if (node.type === 'moon' && node.orbitEccentricity) {
            desiredRenderRadius = desiredRadius * (1 + node.orbitEccentricity * Math.cos(node.targetOrbitAngle));
        }
        const desiredX = centerX + Math.cos(node.targetOrbitAngle) * desiredRenderRadius;
        const desiredY = centerY + Math.sin(node.targetOrbitAngle) * desiredRenderRadius;

        const offsetX = node.x - centerX;
        const offsetY = node.y - centerY;
        const distFromCenter = Math.sqrt(offsetX * offsetX + offsetY * offsetY) || 1;
        const radialDirX = offsetX / distFromCenter;
        const radialDirY = offsetY / distFromCenter;

        if (isFreeOrbiting && collisionConfig.globalVelocityDrag) {
            const drag = Math.pow(collisionConfig.globalVelocityDrag, dt);
            node.vx *= drag;
            node.vy *= drag;
        }

        if (isFreeOrbiting) {
            const rawAnchorRadius = node.freeOrbitAnchorRadius ?? desiredRadius;
            const anchorRadius = fieldBounds
                ? clamp(rawAnchorRadius, fieldBounds.inner, fieldBounds.outer)
                : rawAnchorRadius;
            node.freeOrbitAnchorRadius = anchorRadius;
            const anchorAngle = node.freeOrbitAnchorAngle ?? node.targetOrbitAngle;

            // Slowly advance anchor angle so free flyers keep orbiting the parent
            node.freeOrbitAnchorAngle = normalizeAngle(anchorAngle + node.angularVelocity * dt);
            // Drift anchor radius back toward base for long flights
            node.freeOrbitAnchorRadius = anchorRadius + (baseRadius - anchorRadius) * 0.05 * dt;

            const radialError = (node.freeOrbitAnchorRadius ?? desiredRadius) - distFromCenter;
            const springRamp = (() => {
                const total = node.freeOrbitDurationTotal || collisionConfig.freeOrbitDuration || 1;
                if (!total) return 1;
                const remaining = Math.max(node.freeOrbitTimer ?? 0, 0);
                const normalized = 1 - Math.min(remaining / total, 1);
                const ramp = collisionConfig.freeOrbitSpringRamp ?? 0;
                return ramp <= 0 ? 1 : Math.min(1, Math.max(0.1, normalized * ramp + (1 - ramp)));
            })();
            const radialAccel = radialError * (collisionConfig.freeOrbitSpring || 0) * springRamp;
            node.vx += radialDirX * radialAccel * dt;
            node.vy += radialDirY * radialAccel * dt;

            const orbitAssist = collisionConfig.freeOrbitOrbitAssist ?? 0;
            const angularVel = node.angularVelocity || 0;
            if (orbitAssist > 0 && angularVel !== 0) {
                const tangentialDirX = -radialDirY * Math.sign(angularVel);
                const tangentialDirY = radialDirX * Math.sign(angularVel);
                const tangentialSpeed = (node.freeOrbitAnchorRadius ?? desiredRadius) * Math.abs(angularVel);
                const assistAccel = tangentialSpeed * orbitAssist;
                node.vx += tangentialDirX * assistAccel * dt;
                node.vy += tangentialDirY * assistAccel * dt;
            }

            node.x += node.vx * dt;
            node.y += node.vy * dt;

            const damping = Math.pow(collisionConfig.freeOrbitDamping, dt);
            node.vx *= damping;
            node.vy *= damping;

            const relX = node.x - centerX;
            const relY = node.y - centerY;
            node.orbitRadius = Math.sqrt(relX * relX + relY * relY) || node.orbitRadius;
            node.orbitAngle = normalizeAngle(Math.atan2(relY, relX));

            if (fieldBounds) {
                applyFieldBoundaryForce(node, fieldBounds, relX, relY, dt);
            }

            if ((node.freeOrbitTimer ?? 0) <= 0.05) {
                node.vx = 0;
                node.vy = 0;
                node.freeOrbitTimer = 0;
                node.freeOrbitDurationTotal = 0;

                const settledRadius = fieldBounds
                    ? clamp(node.orbitRadius, fieldBounds.inner, fieldBounds.outer)
                    : node.orbitRadius;
                const settledAngle = node.orbitAngle;
                if (node.type === 'moon' && minOrbitRadius !== undefined && maxOrbitRadius !== undefined) {
                    node.targetOrbitRadius = clamp(settledRadius, minOrbitRadius, maxOrbitRadius);
                } else {
                    node.targetOrbitRadius = settledRadius;
                }
                node.targetOrbitAngle = settledAngle;
                node.freeOrbitAnchorRadius = settledRadius;
                node.freeOrbitAnchorAngle = settledAngle;
                const blendDuration = collisionConfig.railBlendDuration || 0;
                node.railBlendTimer = blendDuration > 0 ? blendDuration : 0;
                if (physicsConfig.enableOrbitDebug && node.railBlendTimer) {
                    console.debug('[orbit-debug] blend-start', {
                        id: node.id,
                        radius: node.orbitRadius,
                        targetRadius: node.targetOrbitRadius,
                        blendDuration,
                    });
                }

                // Leave x/y as-is; deterministic orbit step will take over next frame
            }

            continue;
        }

        if (isRailBlending && (collisionConfig.railBlendDuration || 0) > 0) {
            const totalBlend = collisionConfig.railBlendDuration || 1;
            const remaining = Math.max(node.railBlendTimer ?? 0, 0);
            const blendT = 1 - Math.min(remaining / totalBlend, 1);
            const easeParam = collisionConfig.railBlendEase ?? 0;
            const eased = easeParam <= 0 ? blendT : 1 - Math.pow(1 - blendT, 1 + easeParam * 4);
            const startAngle = node.freeOrbitAnchorAngle ?? node.orbitAngle;
            const startRadius = node.freeOrbitAnchorRadius ?? node.orbitRadius;
            const targetRadius = node.targetOrbitRadius ?? baseRadius;
            const angleSpan = shortestAngleDiff(node.targetOrbitAngle, startAngle);

            node.orbitRadius = startRadius + (targetRadius - startRadius) * eased;
            node.orbitAngle = normalizeAngle(startAngle + angleSpan * eased);
            if (fieldBounds) {
                node.orbitRadius = clamp(node.orbitRadius, fieldBounds.inner, fieldBounds.outer);
            }

            if (blendT >= 0.999) {
                node.railBlendTimer = 0;
                node.freeOrbitAnchorAngle = undefined;
                node.freeOrbitAnchorRadius = undefined;
                node.orbitRadius = fieldBounds
                    ? clamp(targetRadius, fieldBounds.inner, fieldBounds.outer)
                    : targetRadius;
                node.orbitAngle = node.targetOrbitAngle;
            }
        } else {
            // Ease orbit radius toward target
            node.orbitRadius += (node.targetOrbitRadius - node.orbitRadius) * RADIUS_EASE;
            if (fieldBounds) {
                node.orbitRadius = clamp(node.orbitRadius, fieldBounds.inner, fieldBounds.outer);
            }

            // --- Step 4: Ease actual angle toward target angle ---
            const angleDiff = shortestAngleDiff(node.targetOrbitAngle, node.orbitAngle);
            node.orbitAngle = normalizeAngle(node.orbitAngle + angleDiff * ANGLE_EASE);
        }

        // --- Step 5: Calculate final drawing radius (apply eccentricity wobble) ---
        let renderRadius = node.orbitRadius;
        if (node.type === 'moon' && node.orbitEccentricity) {
            renderRadius = node.orbitRadius * (1 + node.orbitEccentricity * Math.cos(node.orbitAngle));
        }
        if (fieldBounds) {
            renderRadius = clamp(renderRadius, fieldBounds.inner, fieldBounds.outer);
        }

        const railTargetX = centerX + Math.cos(node.orbitAngle) * renderRadius;
        const railTargetY = centerY + Math.sin(node.orbitAngle) * renderRadius;

        if (isRailBlending) {
            const totalBlend = collisionConfig.railBlendDuration || 1;
            const remaining = Math.max(node.railBlendTimer ?? 0, 0);
            const blendT = 1 - Math.min(remaining / totalBlend, 1);
            const followLerp = Math.max(0.05, Math.min(1, blendT));
            node.x += (railTargetX - node.x) * followLerp;
            node.y += (railTargetY - node.y) * followLerp;
        } else {
            const railLerp = node.type === 'planet' ? 1 : (physicsConfig.railSnapLerp ?? 1);
            if (railLerp >= 1) {
                node.x = railTargetX;
                node.y = railTargetY;
            } else {
                node.x += (railTargetX - node.x) * railLerp;
                node.y += (railTargetY - node.y) * railLerp;
            }
        }

        if (physicsConfig.enableOrbitDebug) {
            const radiusThreshold = physicsConfig.orbitDebugRadiusThreshold ?? 0;
            const angleThreshold = physicsConfig.orbitDebugAngleThreshold ?? 0;
            const radiusDelta = Math.abs(node.orbitRadius - prevOrbitRadius);
            const angleDelta = Math.abs(shortestAngleDiff(node.orbitAngle, prevOrbitAngle));
            if ((radiusThreshold && radiusDelta > radiusThreshold) || (angleThreshold && angleDelta > angleThreshold)) {
                console.debug('[orbit-debug] jump-detected', {
                    id: node.id,
                    type: node.type,
                    radiusDelta: Math.round(radiusDelta),
                    angleDelta: Number(angleDelta.toFixed(3)),
                    wasFree,
                    wasBlending,
                    isFreeOrbiting,
                    isRailBlending,
                    orbitRadius: Math.round(node.orbitRadius),
                    targetRadius: Math.round(node.targetOrbitRadius || 0),
                    railBlendTimer: node.railBlendTimer,
                });
            }
        }
    }
    
    // --- Step 5: Update flung moons (supernova ejection physics) ---
    updateFlungMoons(nodes, dt);
    
    // --- Step 6: PROXIMITY GLOW - moons shine when approaching! ---
    applyProximityGlow(nodes);
    
    // --- Step 7: HARD collision detection for all pairs ---
    // Collisions give moons velocity, which makes them deviate from orbit
    resolveAllCollisions(nodes, (nodeId) => baseOrbitRadii.get(nodeId));
    
    // --- Step 8: Update particle effects ---
    updateParticles(dt);
    
    // --- Step 9: Decay collision glow ---
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
    if (Number.isNaN(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

type FieldBounds = {
    inner: number;
    outer: number;
};

function getFieldBounds(node: GalaxyNode): FieldBounds | null {
    const inner = node.fieldInnerRadius;
    const outer = node.fieldOuterRadius;
    if (typeof inner !== 'number' || typeof outer !== 'number') {
        return null;
    }
    const min = Math.min(inner, outer);
    const max = Math.max(inner, outer);
    if (!isFinite(min) || !isFinite(max) || max <= 0) {
        return null;
    }
    return { inner: min, outer: max };
}

function clampToField(node: GalaxyNode, value: number): number {
    const bounds = getFieldBounds(node);
    if (!bounds) return value;
    return clamp(value, bounds.inner, bounds.outer);
}

function applyFieldBoundaryForce(
    node: GalaxyNode,
    bounds: FieldBounds,
    relX: number,
    relY: number,
    dt: number
): void {
    const dist = Math.sqrt(relX * relX + relY * relY) || 1;
    const innerGap = bounds.inner - dist;
    const outerGap = dist - bounds.outer;
    let correction = 0;
    if (innerGap > 0) {
        correction = innerGap;
    } else if (outerGap > 0) {
        correction = -outerGap;
    }
    if (correction === 0) {
        node.orbitRadius = clamp(dist, bounds.inner, bounds.outer);
        return;
    }

    const nx = relX / dist;
    const ny = relY / dist;
    const spring = Math.max(physicsConfig.fieldVelocitySpring ?? 0, 0);
    if (spring > 0) {
        node.vx += nx * correction * spring * dt;
        node.vy += ny * correction * spring * dt;
    }

    const damping = physicsConfig.fieldBoundaryDamping ?? 1;
    if (damping < 1) {
        node.vx *= damping;
        node.vy *= damping;
    }

    node.orbitRadius = clamp(dist, bounds.inner, bounds.outer);
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
