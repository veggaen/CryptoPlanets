// Phase 1.5: Physics Engine (Orbital Refactor)
// Deterministic orbital mechanics with dynamic sun and collision wobble

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
    };
    nodes.push(sunNode);

    // --- Create PLANET Nodes ---
    planets.forEach((body, index) => {
        const orbitRadius = physicsConfig.minOrbitRadius + (index * physicsConfig.orbitSpacing);
        const orbitAngle = Math.random() * Math.PI * 2;
        const angularVelocity = physicsConfig.baseChainAngularVel * Math.pow(physicsConfig.minOrbitRadius / orbitRadius, physicsConfig.orbitSpeedFalloff);

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
        };
        nodes.push(node);

        // --- Create MOON Nodes (if chain) ---
        if (body.type === 'chain') {
            const chain = body.data as ChainData;
            chain.tokens.forEach((token, tIndex) => {
                const moonAngle = (tIndex / chain.tokens.length) * Math.PI * 2 + Math.random();
                const moonOrbitRadius = physicsConfig.tokenOrbitMinRadius + (Math.random() * (physicsConfig.tokenOrbitMaxRadius - physicsConfig.tokenOrbitMinRadius));

                const moonX = x + Math.cos(moonAngle) * moonOrbitRadius;
                const moonY = y + Math.sin(moonAngle) * moonOrbitRadius;

                const moonNode: GalaxyNode = {
                    id: `${chain.id}-${token.symbol}-${tIndex}`, // Add index for uniqueness
                    type: 'moon',
                    parentId: chain.id,
                    x: moonX,
                    y: moonY,
                    vx: 0,
                    vy: 0,
                    radius: calculateMoonRadius(token.marketCap),
                    color: token.color || '#cbd5e1',
                    orbitRadius: moonOrbitRadius,
                    orbitAngle: moonAngle,
                    angularVelocity: physicsConfig.baseTokenAngularVel * (Math.random() * 0.5 + 0.8),
                    weight: token.marketCap,
                    mass: 10,
                    data: token as any,
                    isDragging: false,
                    isSelected: false,
                    isHovered: false,
                };
                nodes.push(moonNode);
            });
        }
    });

    return {
        nodes,
        sunNode,
        planetNodes: nodes.filter(n => n.type === 'planet'),
        moonNodes: nodes.filter(n => n.type === 'moon'),
        timestamp: Date.now(),
    };
}

/**
 * Advance physics simulation by one tick
 */
export function tickGalaxy(state: GalaxyState, dt: number): void {
    const { nodes } = state;

    for (const node of nodes) {
        if (node.type === 'sun') {
            node.x = 0;
            node.y = 0;
            node.vx = 0;
            node.vy = 0;
            continue;
        }

        node.orbitAngle += node.angularVelocity * dt;
        if (node.orbitAngle > Math.PI * 2) node.orbitAngle -= Math.PI * 2;

        let centerX = 0;
        let centerY = 0;

        if (node.type === 'planet') {
            centerX = 0;
            centerY = 0;
        } else if (node.type === 'moon' && node.parentId) {
            const parent = nodes.find(n => n.id === node.parentId);
            if (parent) {
                centerX = parent.x;
                centerY = parent.y;
            }
        }

        const targetX = centerX + Math.cos(node.orbitAngle) * node.orbitRadius;
        const targetY = centerY + Math.sin(node.orbitAngle) * node.orbitRadius;

        if (node.isDragging) continue;

        applyCollisionWobble(node, nodes, dt);

        node.vx *= physicsConfig.wobbleDecay;
        node.vy *= physicsConfig.wobbleDecay;

        const dx = targetX - node.x;
        const dy = targetY - node.y;

        const springStrength = 0.05;
        node.vx += dx * springStrength * dt;
        node.vy += dy * springStrength * dt;

        node.x += node.vx * dt;
        node.y += node.vy * dt;

        node.vx *= 0.9;
        node.vy *= 0.9;
    }
}

function applyCollisionWobble(node: GalaxyNode, allNodes: GalaxyNode[], dt: number) {
    for (const other of allNodes) {
        if (node.id === other.id) continue;
        if (node.type !== other.type) continue;
        if (node.parentId !== other.parentId) continue;

        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

        const minDist = node.radius + other.radius + physicsConfig.collidePadding;

        if (dist < minDist) {
            const overlap = minDist - dist;
            const force = overlap * physicsConfig.wobbleStrength;

            const nx = dx / dist;
            const ny = dy / dist;

            node.vx += nx * force * dt;
            node.vy += ny * force * dt;
        }
    }
}

export function calculateBTCWeight(btc: BTCData, mode: WeightMode): number {
    switch (mode) {
        case 'TVL': return btc.marketCap * 0.1;
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
    return Math.max(physicsConfig.minTokenRadius, Math.min(physicsConfig.maxTokenRadius, Math.log10(marketCap || 1) * 2));
}

export function getNodeById(state: GalaxyState, id: string): GalaxyNode | undefined {
    return state.nodes.find(n => n.id === id);
}
