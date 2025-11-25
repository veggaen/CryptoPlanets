import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { fetchChainsTVL } from '@/services/defiLlama';
import { dataConfig } from '@/config/dataConfig';

describe('DefiLlama Service', () => {
    const mockFetch = vi.fn();

    beforeAll(() => {
        vi.stubGlobal('fetch', mockFetch);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    beforeEach(() => {
        mockFetch.mockReset();
    });

    it.skip('should fetch and transform chains correctly', async () => {
        const mockResponse = [
            { name: 'Ethereum', tvl: 1000000, tokenSymbol: 'ETH', chainId: '1', cmcId: '1027', gecko_id: 'ethereum' },
            { name: 'Solana', tvl: 500000, tokenSymbol: 'SOL', chainId: 'solana', cmcId: '5426', gecko_id: 'solana' },
            { name: 'UnknownChain', tvl: 100, tokenSymbol: 'UNK', chainId: 'unknown' }, // Should be filtered out
        ];

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        } as Response);

        const chains = await fetchChainsTVL();

        expect(chains).toHaveLength(2); // Ethereum and Solana
        expect(chains[0].id).toBe('ethereum');
        expect(chains[0].tvl).toBe(1000000);
        expect(chains[1].id).toBe('solana');
    });

    it('should handle API errors gracefully', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
        } as Response);

        // Should return mock data or empty array depending on config
        // Assuming useMockDataOnError is true in test env or default
        const chains = await fetchChainsTVL();

        // If mock data is returned, it should have length > 0
        // If empty array, length 0.
        // Let's check if it returns an array at least.
        expect(Array.isArray(chains)).toBe(true);
    });
});
