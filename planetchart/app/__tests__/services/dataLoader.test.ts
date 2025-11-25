import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadGalaxyData } from '@/services/dataLoader';
import * as defiLlama from '@/services/defiLlama';
import * as dexScreener from '@/services/dexScreener';
import * as coinGecko from '@/services/coinGecko';

// Mock dependencies
vi.mock('@/services/defiLlama', () => ({
    fetchChainsTVL: vi.fn(),
}));
vi.mock('@/services/dexScreener', () => ({
    fetchTokensForChain: vi.fn(),
}));
vi.mock('@/services/coinGecko', () => ({
    fetchBTCStats: vi.fn(),
}));

describe('DataLoader Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load and aggregate galaxy data', async () => {
        // Mock return values
        (coinGecko.fetchBTCStats as any).mockResolvedValue({
            price: 50000,
            change24h: 5,
            dominance: 0, // Will be calc
            marketCap: 1000000000000,
            volume24h: 50000000000,
        });

        (defiLlama.fetchChainsTVL as any).mockResolvedValue([
            {
                id: 'ethereum',
                name: 'Ethereum',
                symbol: 'ETH',
                tvl: 50000000000,
                weight: 0,
                tokens: [],
                change24h: 2.5,
                volume24h: 1000000000,
                dominance: 0,
                color: 'blue'
            },
            {
                id: 'solana',
                name: 'Solana',
                symbol: 'SOL',
                tvl: 10000000000,
                weight: 0,
                tokens: [],
                change24h: 5.0,
                volume24h: 500000000,
                dominance: 0,
                color: 'green'
            },
        ]);

        (dexScreener.fetchTokensForChain as any).mockResolvedValue([
            {
                symbol: 'UNI',
                name: 'Uniswap',
                address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
                price: 10,
                change24h: 2.5,
                volume24h: 1000000,
                liquidity: 5000000,
                marketCap: 1000000000,
                color: 'pink'
            },
        ]);

        const data = await loadGalaxyData('TVL');

        expect(data).toBeDefined();
        expect(data.btc.price).toBe(50000);
        expect(data.chains).toHaveLength(2);
        expect(data.chains[0].tokens).toHaveLength(1);

        // Check dominance calculation
        // Total = 1T (BTC) + 50B (ETH) + 10B (SOL) = 1.06T
        // BTC Dom = 1T / 1.06T ~= 94%
        expect(data.btc.dominance).toBeGreaterThan(90);
    });

    it('should handle partial failures', async () => {
        (coinGecko.fetchBTCStats as any).mockRejectedValue(new Error('API Error'));

        // Should return fallback data
        const data = await loadGalaxyData('TVL');

        expect(data).toBeDefined();
        expect(data.chains).toEqual([]); // Fallback has empty chains
    });
});
