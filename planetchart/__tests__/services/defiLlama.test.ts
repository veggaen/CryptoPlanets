// Phase 1: DefiLlama Service Tests
import { describe, it, expect } from 'vitest';
import { fetchChainsTVL } from '@/services/defiLlama';

describe('defiLlama', () => {
    describe('fetchChainsTVL', () => {
        it('should return array of chains', async () => {
            const chains = await fetchChainsTVL();

            expect(chains).toBeInstanceOf(Array);
            expect(chains.length).toBeGreaterThan(0);
        });

        it('should return chains with required fields', async () => {
            const chains = await fetchChainsTVL();
            const chain = chains[0];

            expect(chain).toHaveProperty('name');
            expect(chain).toHaveProperty('tvl');
            expect(chain.tvl).toBeGreaterThan(0);
        });
    });

    // Phase 2: Real API tests
    describe('Real API Integration (Phase 2)', () => {
        it.skip('should fetch real data from DefiLlama API', () => {
            expect(true).toBe(true);
        });
    });
});
