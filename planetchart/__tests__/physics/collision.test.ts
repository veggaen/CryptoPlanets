// Phase 1: Collision Detection Tests
import { describe, it, expect } from 'vitest';
import { areNodesColliding, resolveCollisions, applyCollisionForce } from '@/physics/collision';
import type { GalaxyNode } from '@/types/galaxy';

describe('collision', () => {
    const createMockNode = (id: string, x: number, y: number, radius: number): GalaxyNode => ({
        id,
        type: 'planet',
        parentId: null,
        x,
        y,
        vx: 0,
        vy: 0,
        radius,
        color: '#fff',
        orbitRadius: 0,
        orbitAngle: 0,
        angularVelocity: 0,
        weight: 1000,
        mass: 1000,
        data: {} as any,
        isDragging: false,
        isSelected: false,
        isHovered: false,
    });

    describe('areNodesColliding', () => {
        it('should detect overlapping circles', () => {
            const n1 = createMockNode('1', 0, 0, 50);
            const n2 = createMockNode('2', 60, 0, 50);

            expect(areNodesColliding(n1, n2)).toBe(true);
        });

        it('should detect non-overlapping circles', () => {
            const n1 = createMockNode('1', 0, 0, 50);
            const n2 = createMockNode('2', 200, 0, 50);

            expect(areNodesColliding(n1, n2)).toBe(false);
        });
    });

    // Phase 2: Real collision resolution tests
    describe('resolveCollisions (Phase 2)', () => {
        it.skip('should be implemented in Phase 2', () => {
            expect(true).toBe(true);
        });
    });
});
