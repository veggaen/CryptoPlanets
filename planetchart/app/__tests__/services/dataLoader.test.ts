import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadGalaxyData } from '@/services/dataLoader';

describe('DataLoader Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load and aggregate galaxy data', async () => {
        const nowIso = new Date().toISOString();
        const mockApiResponse = {
            success: true,
            source: 'api',
            data: {
                btc: {
                    price: 60000,
                    change24h: 5,
                    dominance: 50,
                    marketCap: 1_000_000_000_000,
                    volume24h: 50_000_000_000,
                },
                chains: [
                    {
                        id: 'ethereum',
                        name: 'Ethereum',
                        symbol: 'ETH',
                        tvl: 50_000_000_000,
                        weight: 0,
                        tokens: [
                            {
                                symbol: 'UNI',
                                name: 'Uniswap',
                                address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
                                price: 10,
                                change24h: 2.5,
                                volume24h: 1_000_000,
                                liquidity: 5_000_000,
                                marketCap: 1_000_000_000,
                                color: 'pink',
                            },
                        ],
                        change24h: 2.5,
                        volume24h: 1_000_000_000,
                        dominance: 0,
                        color: 'blue',
                    },
                    {
                        id: 'solana',
                        name: 'Solana',
                        symbol: 'SOL',
                        tvl: 10_000_000_000,
                        weight: 0,
                        tokens: [],
                        change24h: 5.0,
                        volume24h: 500_000_000,
                        dominance: 0,
                        color: 'green',
                    },
                ],
                lastUpdated: nowIso,
                totalMarketCap: 3_500_000_000_000,
                metric: 'TVL',
            },
        };

        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => mockApiResponse,
        })) as any);

        const data = await loadGalaxyData('TVL');

        expect(data).toBeDefined();
        expect(data.btc.price).toBe(60000);
        expect(data.chains).toHaveLength(2);
        expect(data.chains[0].tokens).toHaveLength(1);

        // Dominance is computed server-side and returned through the API response.
        expect(data.btc.dominance).toBe(50);
    });

    it('should handle partial failures', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('API Error');
        }) as any);

        // Use a different mode to avoid returning cached data from the previous test.
        const data = await loadGalaxyData('Volume24h');

        expect(data).toBeDefined();
        expect(data.chains).toEqual([]); // Fallback has empty chains
    });

    it('should not include capBasis in MarketCap requests', async () => {
        const nowIso = new Date().toISOString();
        const mockApiResponse = {
            success: true,
            source: 'api',
            data: {
                btc: {
                    price: 60000,
                    change24h: 0,
                    dominance: 50,
                    marketCap: 1,
                    volume24h: 1,
                },
                chains: [],
                lastUpdated: nowIso,
                totalMarketCap: 1,
                metric: 'MarketCap',
            },
        };

        const fetchSpy = vi.fn(async (input: any) => ({
            ok: true,
            json: async () => mockApiResponse,
        }));
        vi.stubGlobal('fetch', fetchSpy as any);

        await loadGalaxyData('MarketCap');

        expect(fetchSpy).toHaveBeenCalled();
        const firstUrl = String(fetchSpy.mock.calls[0][0]);
        expect(firstUrl).toContain('mode=MarketCap');
        expect(firstUrl).not.toContain('capBasis=');
    });
});
