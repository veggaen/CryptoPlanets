import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config/dataConfig', () => {
  const ttlMs = 60_000;
  return {
    dataConfig: {
      dexScreener: { baseURL: 'https://api.dexscreener.com', endpoints: { search: '/latest/dex/search' } },
      cache: { ttl: { tokens: ttlMs } },
      useMockDataOnError: false,
      chainIdMap: {},
    },
    STABLECOIN_SYMBOLS: new Set(['USDC', 'USDT', 'DAI', 'FRAX']),
  };
});

describe('DexScreener HEX parsing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('prefers pairs where HEX is the base token (avoids ETH price leak)', async () => {
    // Highest-liquidity pair has HEX as QUOTE (base=WETH) with priceUsd ~ ETH.
    // Lower-liquidity pair has HEX as BASE with correct price.
    const hex = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';

    const responseBody = {
      pairs: [
        {
          chainId: 'ethereum',
          baseToken: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether' },
          quoteToken: { address: hex, symbol: 'HEX', name: 'HEX' },
          priceUsd: '2858.39',
          priceNative: '3160000', // 1 WETH = 3.16M HEX
          liquidity: { usd: 10_000_000 },
          volume: { h24: 1_000_000 },
          priceChange: { h24: 1.23 },
          marketCap: 999, // should not be used (refers to WETH)
          fdv: 999,
          info: { imageUrl: 'eth.png' },
        },
        {
          chainId: 'ethereum',
          baseToken: { address: hex, symbol: 'HEX', name: 'HEX' },
          quoteToken: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether' },
          priceUsd: '0.0009044',
          priceNative: '0.000000316',
          liquidity: { usd: 1_000_000 },
          volume: { h24: 123_456 },
          priceChange: { h24: -2.5 },
          marketCap: 534_000_000,
          fdv: 0,
          info: { imageUrl: 'hex.png' },
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

    const { fetchHEXData } = await import('@/services/dexScreener');
    const { eHEX } = await fetchHEXData();

    expect(eHEX).toBeTruthy();
    expect(eHEX?.price).toBeGreaterThan(0);
    // Should be HEX price, not ETH price.
    expect(eHEX?.price).toBeLessThan(0.01);
    expect(eHEX?.price).toBeCloseTo(0.0009044, 8);
    expect(eHEX?.marketCapKind).toBe('market_cap');
    expect(eHEX?.marketCap).toBe(534_000_000);
  });

  it('inverts price when only quote-side pairs exist (never returns base token USD price)', async () => {
    const hex = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';

    const responseBody = {
      pairs: [
        {
          chainId: 'ethereum',
          baseToken: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether' },
          quoteToken: { address: hex, symbol: 'HEX', name: 'HEX' },
          priceUsd: '3000',
          priceNative: '3317132.0', // 1 WETH = 3,317,132 HEX
          liquidity: { usd: 10_000_000 },
          volume: { h24: 1_000_000 },
          priceChange: { h24: 1.23 },
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => responseBody }) as any)
    );

    const { fetchHEXData } = await import('@/services/dexScreener');
    const { eHEX } = await fetchHEXData();

    expect(eHEX).toBeTruthy();
    expect(eHEX?.price).toBeGreaterThan(0);
    // 3000 / 3,317,132 ~= 0.0009045
    expect(eHEX?.price).toBeLessThan(0.01);
    expect(eHEX?.price).toBeCloseTo(0.0009045, 6);

    // We cannot trust marketCap from a quote-side pair (it would refer to the base token).
    expect(eHEX?.marketCapKind).toBe('unknown');
    expect(eHEX?.marketCap).toBe(0);
  });

  it('ignores high-liquidity non-stable pairs that produce absurd USD prices (e.g., HEX/SHIB)', async () => {
    const hex = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';

    // This mirrors live DexScreener behavior where a non-stable pair can surface
    // a wildly wrong `priceUsd` despite huge liquidity. We must avoid selecting it.
    const responseBody = {
      pairs: [
        {
          chainId: 'ethereum',
          dexId: 'uniswap',
          baseToken: { address: hex, symbol: 'HEX', name: 'HEX' },
          quoteToken: { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', symbol: 'SHIB', name: 'Shiba Inu' },
          priceUsd: '2858.39',
          priceNative: '125.1718',
          liquidity: { usd: 564_000_000 },
          volume: { h24: 1_000_000 },
          priceChange: { h24: 0.35 },
          marketCap: 1_692_795_668_964_250,
          info: { imageUrl: 'bad.png' },
        },
        {
          chainId: 'ethereum',
          dexId: 'uniswap',
          baseToken: { address: hex, symbol: 'HEX', name: 'HEX' },
          quoteToken: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin' },
          priceUsd: '0.0009062',
          priceNative: '0.0009062',
          liquidity: { usd: 914_904.94 },
          volume: { h24: 72_500 },
          priceChange: { h24: 1.37 },
          marketCap: 536_709_629,
          fdv: 48_227_117,
          info: { imageUrl: 'good.png' },
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => responseBody }) as any)
    );

    const { fetchHEXData } = await import('@/services/dexScreener');
    const { eHEX } = await fetchHEXData();

    expect(eHEX).toBeTruthy();
    expect(eHEX?.price).toBeGreaterThan(0);
    expect(eHEX?.price).toBeLessThan(0.01);
    expect(eHEX?.price).toBeCloseTo(0.0009062, 8);
    expect(eHEX?.marketCapKind).toBe('market_cap');
    expect(eHEX?.marketCap).toBe(536_709_629);
  });
});
