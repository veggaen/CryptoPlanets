import { describe, it, expect, vi } from 'vitest';

// Concurrency regression test:
// Previously, /api/galaxy used a single global in-flight promise.
// Parallel requests with different cache keys (e.g. different modes / filters)
// could end up sharing the same promise and returning/caching the wrong variant.

vi.mock('@/config/dataConfig', () => {
  const ttlMs = 60_000;
  return {
    // Keep token lists empty so the route doesn't fan out into token fetching.
    CHAIN_TOKENS: {},
    DEXSCREENER_TOKENS: {},
    STABLECOIN_SYMBOLS: new Set<string>(),
    WRAPPED_PATTERNS: new Set<string>(),
    CHAIN_NATIVE_SYMBOLS: new Set<string>(),
    DEFAULT_FILTERS: { wrappedExceptions: [] as string[] },
    dataConfig: {
      maxChains: 2,
      tokensPerChain: 0,
      minTVLThreshold: 0,
      minTokenLiquidity: 0,
      useMockDataOnError: false,
      chainIdMap: {
        Ethereum: 'ethereum',
        Solana: 'solana',
        PulseChain: 'pulsechain',
      },
      cache: {
        enabled: true,
        ttl: { btc: ttlMs, chains: ttlMs, tokens: ttlMs, onChainStats: ttlMs },
        rateLimitCooldown: 1,
      },
      defiLlama: { baseURL: 'https://api.llama.fi', endpoints: { chains: '/v2/chains' } },
      dexScreener: { baseURL: 'https://api.dexscreener.com', endpoints: { tokens: '/latest/dex/tokens' } },
      coinGecko: { baseURL: 'https://api.coingecko.com/api/v3', endpoints: { markets: '/coins/markets' } },
    },
  };
});

describe('api/galaxy concurrency', () => {
  it('does not cross-contaminate different modes between concurrent requests', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Stub network calls used by real services (CoinGecko/DefiLlama/DexScreener).
    // We include a small delay on one request to ensure the two API calls overlap.
    const fetchStub = vi.fn((input: any) => {
      const url = String(input);

      const makeResponse = (body: any, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      // DefiLlama chains list
      if (url.includes('https://api.llama.fi/v2/chains')) {
        return Promise.resolve(makeResponse([
          { name: 'Ethereum', tvl: 100, tokenSymbol: 'ETH', gecko_id: 'ethereum' },
          { name: 'Solana', tvl: 90, tokenSymbol: 'SOL', gecko_id: 'solana' },
        ]));
      }

      // CoinGecko global stats
      if (url === 'https://api.coingecko.com/api/v3/global') {
        return Promise.resolve(makeResponse({ data: { total_market_cap: { usd: 0 }, market_cap_percentage: { btc: 0 } } }));
      }

      // CoinGecko /simple/price (used for both prices + market caps)
      if (url.startsWith('https://api.coingecko.com/api/v3/simple/price')) {
        // Include both usd and usd_market_cap.
        return Promise.resolve(makeResponse({
          ethereum: { usd: 1, usd_market_cap: 1000 },
          solana: { usd: 1, usd_market_cap: 200 },
        }));
      }

      // CoinGecko /coins/markets (used by BTC stats + snapshots)
      if (url.startsWith('https://api.coingecko.com/api/v3/coins/markets')) {
        const u = new URL(url);
        const ids = (u.searchParams.get('ids') || '').split(',').filter(Boolean);

        const rows = ids.map((id) => {
          if (id === 'bitcoin') {
            return {
              id: 'bitcoin',
              symbol: 'btc',
              name: 'Bitcoin',
              current_price: 100000,
              market_cap: 500,
              fully_diluted_valuation: 500,
              total_volume: 0,
              price_change_percentage_24h: 0,
              image: 'btc.png',
            };
          }
          if (id === 'ethereum') {
            return {
              id: 'ethereum',
              symbol: 'eth',
              name: 'Ethereum',
              current_price: 1,
              market_cap: 1000,
              fully_diluted_valuation: 3000,
              total_volume: 0,
              price_change_percentage_24h: 0,
              image: 'eth.png',
            };
          }
          if (id === 'solana') {
            return {
              id: 'solana',
              symbol: 'sol',
              name: 'Solana',
              current_price: 1,
              market_cap: 200,
              fully_diluted_valuation: 800,
              total_volume: 0,
              price_change_percentage_24h: 0,
              image: 'sol.png',
            };
          }
          return {
            id,
            symbol: id.slice(0, 3),
            name: id,
            current_price: 1,
            market_cap: 0,
            fully_diluted_valuation: 0,
            total_volume: 0,
            price_change_percentage_24h: 0,
            image: `${id}.png`,
          };
        });

        // Add an artificial delay for BTC stats path to force overlap.
        const response = makeResponse(rows);
        if (ids.length === 1 && ids[0] === 'bitcoin') {
          return new Promise((resolve) => setTimeout(() => resolve(response), 25));
        }
        return Promise.resolve(response);
      }

      // CoinGecko /coins/list?include_platform=true (optional contract-address resolution)
      if (url.startsWith('https://api.coingecko.com/api/v3/coins/list')) {
        return Promise.resolve(makeResponse([]));
      }

      // PulseChain RPC (used for optional stats)
      if (url === 'https://pulsechain-rpc.publicnode.com') {
        return Promise.resolve(
          makeResponse([
            { jsonrpc: '2.0', id: 1, result: '0x1' },
            { jsonrpc: '2.0', id: 2, result: '0x3b9aca00' },
          ])
        );
      }

      // DexScreener HEX call (return empty pairs)
      if (url.startsWith('https://api.dexscreener.com/latest/dex/tokens/')) {
        return Promise.resolve(makeResponse({ pairs: [] }));
      }

      // Default: fail fast so we notice unexpected calls.
      return Promise.resolve(makeResponse({ error: `Unhandled fetch url in test: ${url}` }, 500));
    });

    vi.stubGlobal('fetch', fetchStub as any);

    // Import after mocks so the route uses mocked modules.
    const { GET } = await import('@/api/galaxy/route');
    const { NextRequest } = await import('next/server');

    const reqMarketCap = new NextRequest(
      'http://localhost:3000/api/galaxy?mode=MarketCap&hideStables=false&hideWrapped=false'
    );
    const reqTVL = new NextRequest(
      'http://localhost:3000/api/galaxy?mode=TVL&hideStables=false&hideWrapped=false'
    );

    // Start first request, then quickly start second while first is still in-flight.
    const p1 = GET(reqMarketCap);
    const p2 = Promise.resolve().then(() => GET(reqTVL));

    const [res1, res2] = await Promise.all([p1, p2]);
    const body1 = await res1.json();
    const body2 = await res2.json();

    if (!body1.success || !body2.success) {
      throw new Error(`Unexpected API failure. body1=${JSON.stringify(body1)} body2=${JSON.stringify(body2)}`);
    }

    expect(body1.success).toBe(true);
    expect(body2.success).toBe(true);

    // Ensure modes stay correct per request.
    expect(body1.data.metric).toBe('MarketCap');
    expect(body2.data.metric).toBe('TVL');

    // Ensure chain weights match their mode expectations.
    const eth1 = body1.data.chains.find((c: any) => c.id === 'ethereum');
    const eth2 = body2.data.chains.find((c: any) => c.id === 'ethereum');

    expect(eth1.marketCapKind).toBe('market_cap');
    expect(eth1.weight).toBe(1000);
    expect(eth2.weight).toBe(100);

    // Sanity: we should have hit the network at least once.
    expect(fetchStub).toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
