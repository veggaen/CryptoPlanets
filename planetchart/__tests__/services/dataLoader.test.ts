// Phase 1: Data Loader Tests
import { describe, it, expect } from 'vitest';
import { loadGalaxyData, calculateChainWeight, getFallbackData } from '@/services/dataLoader';

describe('dataLoader', () => {
    describe('loadGalaxyData', () => {
        it('should return GalaxyData structure', async () => {
            const data = await loadGalaxyData('TVL');

            expect(data).toBeDefined();
            expect(data.btc).toBeDefined();
            expect(data.chains).toBeInstanceOf(Array);
            expect(data.lastUpdated).toBeInstanceOf(Date);
            expect(data.metric).toBe('TVL');
        });

        it('should return BTC data', async () => {
            const data = await loadGalaxyData('TVL');

            expect(data).toBeDefined();
            expect(data.btc).toBeDefined();
            expect(data.chains).toBeInstanceOf(Array);
        });
    });

    // Phase 2: Real API integration tests
    describe('calculateChainWeight (Phase 2)', () => {
        it.skip('should calculate weight based on different modes', () => {
            expect(true).toBe(true);
        });
    });
});
