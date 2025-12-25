import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/dataConfig', () => {
  const ttlMs = 60_000;
  return {
    dataConfig: {
      dexScreener: {
        baseURL: 'https://api.dexscreener.com',
        endpoints: {
          search: '/latest/dex/search',
          tokens: '/latest/dex/tokens',
        },
      },
      cache: { ttl: { tokens: ttlMs } },
      useMockDataOnError: false,
      chainIdMap: {},
    },
    STABLECOIN_SYMBOLS: new Set(['USDC', 'USDT', 'DAI', 'FRAX']),
  };
});

describe('fetchDexScreenerTokensByAddress', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('aggregates liquidity across top pools and filters by chainId', async () => {
    const pepe = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
    const other = '0x1111111111111111111111111111111111111111';

    const responseBody = {
      pairs: [
        // PEPE on Ethereum (3 pools)
        {
          chainId: 'ethereum',
          dexId: 'uniswap',
          pairAddress: '0xpepe1',
          url: 'https://dexscreener.com/ethereum/0xpepe1',
          baseToken: { address: pepe, symbol: 'PEPE', name: 'Pepe' },
          quoteToken: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin' },
          priceUsd: '0.000001',
          liquidity: { usd: 30_800_000 },
          volume: { h24: 120_000_000 },
          priceChange: { h24: 3.2 },
          marketCap: 1_690_000_000,
        },
        {
          chainId: 'ethereum',
          dexId: 'uniswap',
          pairAddress: '0xpepe2',
          url: 'https://dexscreener.com/ethereum/0xpepe2',
          baseToken: { address: pepe, symbol: 'PEPE', name: 'Pepe' },
          quoteToken: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether' },
          // Non-stable counter pair (should NOT be preferred for pricing if a stable pair exists)
          priceUsd: '11.14',
          liquidity: { usd: 50_000_000 },
          volume: { h24: 40_000_000 },
          priceChange: { h24: 3.2 },
        },
        {
          chainId: 'ethereum',
          dexId: 'uniswap',
          pairAddress: '0xpepe3',
          url: 'https://dexscreener.com/ethereum/0xpepe3',
          baseToken: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin' },
          quoteToken: { address: pepe, symbol: 'PEPE', name: 'Pepe' },
          // Here PEPE is the QUOTE token; still must count toward aggregation.
          priceUsd: '1',
          priceNative: '1000000',
          liquidity: { usd: 2_000_000 },
          volume: { h24: 5_000_000 },
          priceChange: { h24: 3.2 },
        },

        // Same token address but on another chain must be ignored
        {
          chainId: 'bsc',
          dexId: 'pancakeswap',
          pairAddress: '0xpepeBsc',
          url: 'https://dexscreener.com/bsc/0xpepeBsc',
          baseToken: { address: pepe, symbol: 'PEPE', name: 'Pepe' },
          quoteToken: { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD' },
          priceUsd: '0.000001',
          liquidity: { usd: 999_999_999 },
          volume: { h24: 999_999_999 },
          priceChange: { h24: 3.2 },
        },

        // Other token on Ethereum
        {
          chainId: 'ethereum',
          pairAddress: '0xother1',
          url: 'https://dexscreener.com/ethereum/0xother1',
          baseToken: { address: other, symbol: 'OTR', name: 'Other' },
          quoteToken: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin' },
          priceUsd: '1.23',
          liquidity: { usd: 100_000 },
          volume: { h24: 200_000 },
          priceChange: { h24: -1.0 },
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: any) => {
        const u = String(url);
        if (!u.includes('/latest/dex/tokens/')) throw new Error(`Unexpected URL: ${u}`);
        return {
          ok: true,
          json: async () => responseBody,
        } as any;
      })
    );

    const { fetchDexScreenerTokensByAddress } = await import('@/services/dexScreener');
    const out = await fetchDexScreenerTokensByAddress('ethereum', [
      { address: pepe, symbol: 'PEPE', name: 'Pepe' },
      { address: other, symbol: 'OTR', name: 'Other' },
    ]);

    const pepeRow = out.find((t) => t.symbol === 'PEPE');
    expect(pepeRow).toBeTruthy();
    // Sum top3 eth pools by liquidity: 50M + 30.8M + 2M
    expect(pepeRow?.liquidity).toBe(82_800_000);
    expect(pepeRow?.volume24h).toBe(165_000_000);
    // Prefer stable-quoted pair for pricing
    expect(pepeRow?.price).toBeCloseTo(0.000001);
    // But deep-link should target the most-liquid pool (not necessarily the stable pool)
    expect(pepeRow?.dexPairAddress).toBe('0xpepe2');
    expect(pepeRow?.dexScreenerUrl).toBe('https://dexscreener.com/ethereum/0xpepe2');
    expect(pepeRow?.dexScreenerDexId).toBe('uniswap');
    expect(pepeRow?.dexScreenerBaseSymbol).toBe('PEPE');
    expect(pepeRow?.dexScreenerQuoteSymbol).toBe('WETH');

    const otherRow = out.find((t) => t.symbol === 'OTR');
    expect(otherRow?.liquidity).toBe(100_000);
  });
});
