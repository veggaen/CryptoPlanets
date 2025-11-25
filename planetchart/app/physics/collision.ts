// Phase 1: Collision Detection (Stub)
// Collision detection and resolution - REAL IMPLEMENTATION IN PHASE 2

import type { GalaxyNode } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { circlesOverlap } from "@/utils/math";

/**
 * Detect and resolve collisions between nodes
 * Phase 2: Will implement D3-style forceCollide
 */
export function resolveCollisions(nodes: GalaxyNode[], dt: number): void {
    debugLog('collisions', `resolveCollisions called for ${nodes.length} nodes (Phase 1 stub)`);

    // Phase 1: No-op
    // Phase 2: Implement collision resolution
}

/**
 * Check if two nodes are colliding
 */
export function areNodesColliding(n1: GalaxyNode, n2: GalaxyNode): boolean {
    return circlesOverlap(n1.x, n1.y, n1.radius, n2.x, n2.y, n2.radius);
}

/**
 * Apply collision force between two nodes
 * Phase 2: Will push nodes apart based on overlap
 */
export function applyCollisionForce(
    n1: GalaxyNode,
    n2: GalaxyNode,
    strength: number,
    dt: number
): void {
    debugLog('collisions', `applyCollisionForce called (Phase 1 stub)`);

    // Phase 1: No-op
}
