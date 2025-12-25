import type { TokenData } from '@/types/galaxy';
import { debugLog } from '@/utils/debug';

const CMC_BASE_URL = 'https://pro-api.coinmarketcap.com';

const CMC_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (credit-friendly)

type CacheEntry = { timestamp: number; data: Map<string, Partial<TokenData>> };
const quotesCache = new Map<string, CacheEntry>();

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeSymbol(sym: unknown): string {
  return typeof sym === 'string' ? sym.trim().toUpperCase() : '';
}

function asNumber(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

export async function fetchCoinMarketCapQuotesBySymbols(symbols: string[]): Promise<Map<string, Partial<TokenData>>> {
  const apiKey = process.env.COINMARKETCAP_API_KEY;
  if (!apiKey) {
    debugLog('data', 'CoinMarketCap API key missing; skipping CMC quotes');
    return new Map();
  }

  const uniq = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  if (uniq.length === 0) return new Map();

  // Cache key is stable by symbol set.
  const cacheKey = uniq.slice().sort().join(',');
  const cached = quotesCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < CMC_CACHE_TTL_MS) {
    return cached.data;
  }

  debugLog('data', `CoinMarketCap: fetching quotes for ${uniq.length} symbols`);

  const out = new Map<string, Partial<TokenData>>();

  // Credit-friendly: batch symbols (CMC counts credits per symbol on many plans).
  // Keep batches moderate to avoid URL length issues.
  const batches = chunk(uniq, 50);

  for (const batch of batches) {
    const params = new URLSearchParams({
      symbol: batch.join(','),
      convert: 'USD',
    });

    const url = `${CMC_BASE_URL}/v2/cryptocurrency/quotes/latest?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': apiKey,
      },
      // CMC is not ultra-low-latency; allow normal caching upstream.
    });

    if (!res.ok) {
      debugLog('data', `CoinMarketCap quotes error: ${res.status} ${res.statusText}`);
      continue;
    }

    const raw = await res.json() as any;
    const data = raw?.data;
    if (!data || typeof data !== 'object') continue;

    for (const [symbol, rows] of Object.entries<any>(data)) {
      const sym = normalizeSymbol(symbol);
      if (!sym) continue;

      const arr = Array.isArray(rows) ? rows : [];
      if (arr.length === 0) continue;

      // Symbol collisions happen. Heuristic: pick the entry with the highest market cap.
      const best = arr
        .slice()
        .sort((a: any, b: any) => {
          const amc = asNumber(a?.quote?.USD?.market_cap) ?? 0;
          const bmc = asNumber(b?.quote?.USD?.market_cap) ?? 0;
          return bmc - amc;
        })[0];

      const quote = best?.quote?.USD;
      const price = asNumber(quote?.price) ?? 0;
      const change24h = asNumber(quote?.percent_change_24h) ?? 0;
      const volume24h = asNumber(quote?.volume_24h) ?? 0;
      const marketCap = asNumber(quote?.market_cap) ?? 0;
      const fdv = asNumber(quote?.fully_diluted_market_cap);

      out.set(sym, {
        price,
        change24h,
        volume24h,
        marketCap,
        fdv: fdv ?? undefined,
        marketCapKind: marketCap > 0 ? 'market_cap' : (fdv && fdv > 0 ? 'fdv' : 'unknown'),
      });
    }
  }

  quotesCache.set(cacheKey, { timestamp: now, data: out });
  return out;
}
