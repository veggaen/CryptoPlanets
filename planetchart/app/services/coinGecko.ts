import { dataConfig } from "@/config/dataConfig";
import { BTCData, TokenData } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { validateBTCData } from "@/utils/validation";

type CoinGeckoCoinListRow = {
    id: string;
    platforms?: Record<string, string | null | undefined>;
};

const COIN_PLATFORMS_CACHE_VERSION = 1;
const COIN_PLATFORMS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let coinPlatformsCache: {
    version: number;
    timestamp: number;
    platformsById: Map<string, Record<string, string>>;
} | null = null;

async function fetchPlatformsForCoinIds(coinIds: string[], headers: HeadersInit): Promise<Map<string, Record<string, string>>> {
    const now = Date.now();

    if (!coinPlatformsCache || coinPlatformsCache.version !== COIN_PLATFORMS_CACHE_VERSION) {
        coinPlatformsCache = {
            version: COIN_PLATFORMS_CACHE_VERSION,
            timestamp: now,
            platformsById: new Map(),
        };
    }

    const targetIds = [...new Set(coinIds)].filter(Boolean);
    const missing = targetIds.filter((id) => !coinPlatformsCache!.platformsById.has(id));
    if (missing.length === 0) return coinPlatformsCache.platformsById;

    // CoinGecko rate-limits; keep concurrency low.
    const concurrency = 3;
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (true) {
            const idx = nextIndex++;
            if (idx >= missing.length) return;

            const id = missing[idx];
            try {
                const url = `${dataConfig.coinGecko.baseURL}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
                const res = await fetch(url, { headers });
                if (!res.ok) continue;

                const raw = await res.json() as { platforms?: Record<string, unknown> };
                const platforms = raw?.platforms;
                if (!platforms || typeof platforms !== 'object') continue;

                const cleaned: Record<string, string> = {};
                for (const [key, value] of Object.entries(platforms)) {
                    if (typeof value === 'string') {
                        const trimmed = value.trim();
                        if (trimmed.length > 0) cleaned[key] = trimmed;
                    }
                }

                if (Object.keys(cleaned).length > 0) {
                    coinPlatformsCache!.platformsById.set(id, cleaned);
                }
            } catch {
                // Best-effort enrichment; ignore per-coin failures.
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, () => worker()));
    coinPlatformsCache.timestamp = now;
    return coinPlatformsCache.platformsById;
}

async function getCoinPlatformsById(): Promise<Map<string, Record<string, string>>> {
    const now = Date.now();

    if (
        coinPlatformsCache
        && coinPlatformsCache.version === COIN_PLATFORMS_CACHE_VERSION
        && (now - coinPlatformsCache.timestamp) < COIN_PLATFORMS_TTL_MS
    ) {
        return coinPlatformsCache.platformsById;
    }

    // Without an API key, CoinGecko rate-limits aggressively and this endpoint is large.
    // Skipping this call prevents the entire token list from collapsing to 0 ("missing moons").
    const apiKey = process.env.COINGECKO_API_KEY;
    if (!apiKey) {
        return coinPlatformsCache?.platformsById ?? new Map();
    }

    try {
        const url = `${dataConfig.coinGecko.baseURL}/coins/list?include_platform=true`;
        debugLog('data', 'Fetching CoinGecko platforms list (include_platform=true)');

        const headers: HeadersInit = { 'x-cg-demo-api-key': apiKey };

        const response = await fetch(url, { headers });
        if (!response.ok) {
            debugLog('data', `CoinGecko API error for coins/list include_platform: ${response.status} ${response.statusText}`);
            return coinPlatformsCache?.platformsById ?? new Map();
        }

        const raw = await response.json() as CoinGeckoCoinListRow[];
        const platformsById = new Map<string, Record<string, string>>();

        for (const row of raw) {
            if (!row || typeof row.id !== 'string') continue;
            const platforms = row.platforms;
            if (!platforms || typeof platforms !== 'object') continue;

            const cleaned: Record<string, string> = {};
            for (const [key, value] of Object.entries(platforms)) {
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (trimmed.length > 0) cleaned[key] = trimmed;
                }
            }
            if (Object.keys(cleaned).length > 0) {
                platformsById.set(row.id, cleaned);
            }
        }

        coinPlatformsCache = {
            version: COIN_PLATFORMS_CACHE_VERSION,
            timestamp: now,
            platformsById,
        };

        debugLog('data', `OK: Loaded platform mappings for ${platformsById.size} coins`);
        return platformsById;
    } catch (error) {
        debugLog('data', `Error fetching CoinGecko platforms list: ${error}`);
        return coinPlatformsCache?.platformsById ?? new Map();
    }
}

// ===== MOCK FLAG =====
// Use mock data in tests or when explicitly enabled
// FORCE FALSE for production/dev to ensure real data is attempted
const USE_MOCK_COINGECKO = false;
// process.env.USE_MOCK_COINGECKO === "true" ||
// process.env.NODE_ENV === "test";

// ===== CACHE STRUCTURES =====
interface CacheEntry<T> {
    data: T;
    lastFetched: number;
}

let btcCache: CacheEntry<BTCData> | null = null;
let globalCache: CacheEntry<{ totalMarketCapUsd: number; btcDominance: number }> | null = null;
const ecosystemTokensCache: Record<string, CacheEntry<TokenData[]>> = {};

// ===== RATE LIMIT TRACKING =====
let btcRateLimitHit: number = 0;
let globalRateLimitHit: number = 0;
const ecosystemRateLimitHit: Record<string, number> = {};

// ===== TYPE DEFINITIONS =====
export type RawCoinGeckoEcosystemToken = {
    id: string;
    symbol: string;
    name: string;
    current_price: number;
    market_cap: number;
    fully_diluted_valuation?: number | null;
    circulating_supply?: number | null;
    price_change_percentage_24h: number | null;
    total_volume: number;
    image?: string;
};

type RawCoinGeckoGlobal = {
    data?: {
        total_market_cap?: { usd?: number };
        market_cap_percentage?: { btc?: number };
    };
};

/**
 * Fetch global market stats from CoinGecko (total market cap + BTC dominance)
 * Used to align BTC dominance with BTC.D sources.
 */
export async function fetchGlobalMarketStats(): Promise<{ totalMarketCapUsd: number; btcDominance: number } | null> {
    const now = Date.now();

    if (USE_MOCK_COINGECKO) {
        // Keep deterministic-ish values for tests.
        return { totalMarketCapUsd: 3_500_000_000_000, btcDominance: 58.5 };
    }

    const cooldownRemaining = dataConfig.cache.rateLimitCooldown - (now - globalRateLimitHit);
    if (globalRateLimitHit > 0 && cooldownRemaining > 0) {
        if (globalCache) return globalCache.data;
        return null;
    }

    if (globalCache && (now - globalCache.lastFetched < dataConfig.cache.ttl.btc)) {
        return globalCache.data;
    }

    try {
        const url = `${dataConfig.coinGecko.baseURL}/global`;
        const apiKey = process.env.COINGECKO_API_KEY;
        const headers: HeadersInit = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

        const response = await fetch(url, { headers });
        if (!response.ok) {
            if (response.status === 429) {
                globalRateLimitHit = now;
            }
            return globalCache ? globalCache.data : null;
        }

        const raw = await response.json() as RawCoinGeckoGlobal;
        const totalMarketCapUsd = raw.data?.total_market_cap?.usd;
        const btcDominance = raw.data?.market_cap_percentage?.btc;

        if (typeof totalMarketCapUsd !== 'number' || typeof btcDominance !== 'number') {
            return globalCache ? globalCache.data : null;
        }

        const parsed = { totalMarketCapUsd, btcDominance };
        globalCache = { data: parsed, lastFetched: now };
        return parsed;
    } catch (error) {
        debugLog('data', `Error fetching CoinGecko global stats: ${error}`);
        return globalCache ? globalCache.data : null;
    }
}

// ===== HELPER FUNCTIONS =====

function getTokenColor(change24h: number): string {
    if (change24h > 10) return "from-green-400 to-emerald-600";
    if (change24h > 0) return "from-green-300 to-green-500";
    if (change24h < -10) return "from-red-400 to-rose-600";
    if (change24h < 0) return "from-red-300 to-red-500";
    return "from-slate-400 to-slate-600";
}

function getMockBTCData(): BTCData {
    debugLog('data', 'Using MOCK BTC data');
    return {
        price: 60000,
        marketCap: 1200000000000,
        volume24h: 30000000000,
        change24h: 2.5,
        dominance: 50,
    };
}

function getMockEcosystemTokens(categoryId: string, limit: number): TokenData[] {
    debugLog('data', `Using MOCK ecosystem tokens for ${categoryId}`);
    const prefix = categoryId.split('-')[0].toUpperCase().substring(0, 3);

    return Array.from({ length: Math.min(limit, 10) }).map((_, i) => ({
        symbol: `${prefix}TK${i}`,
        name: `${prefix} Token ${i}`,
        address: `mock-${i}`,
        price: Math.random() * 100,
        change24h: (Math.random() * 40) - 20,
        volume24h: Math.random() * 10000000,
        liquidity: Math.random() * 5000000,
        marketCap: Math.random() * 100000000,
        color: getTokenColor((Math.random() * 40) - 20),
    }));
}

// ===== MAIN API FUNCTIONS =====

/**
 * Fetch BTC stats from CoinGecko
 * Uses caching, mock flag, and 429 backoff
 */
export async function fetchBTCStats(): Promise<BTCData> {
    const now = Date.now();

    // Return mock data if flag is set
    if (USE_MOCK_COINGECKO) {
        debugLog('data', 'Using MOCK BTC data (test mode)');
        return getMockBTCData();
    }

    // Check if we're in rate limit cooldown
    const cooldownRemaining = dataConfig.cache.rateLimitCooldown - (now - btcRateLimitHit);
    if (btcRateLimitHit > 0 && cooldownRemaining > 0) {
        debugLog('data', `In rate limit cooldown for BTC (${Math.ceil(cooldownRemaining / 1000)}s remaining)`);
        if (btcCache) {
            return btcCache.data;
        }
        // No cache,return fallback
        return getMockBTCData();
    }

    // Return cache if valid and within TTL
    if (btcCache && (now - btcCache.lastFetched < dataConfig.cache.ttl.btc)) {
        debugLog('data', 'Using cached BTC data');
        return btcCache.data;
    }

    // Fetch from API
    try {
        const url = `${dataConfig.coinGecko.baseURL}${dataConfig.coinGecko.endpoints.markets}?vs_currency=usd&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false`;
        debugLog('data', `Fetching BTC stats from: ${url}`);

        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 429) {
                // Rate limited - record timestamp
                btcRateLimitHit = now;
                debugLog('data', `CoinGecko rate limit hit (429) for BTC - entering cooldown`);
            } else {
                debugLog('data', `CoinGecko API error for BTC: ${response.status} ${response.statusText}`);
            }

            // Return cached data if available
            if (btcCache) {
                debugLog('data', 'Returning cached BTC data due to API error');
                return btcCache.data;
            }

            // No cache, return fallback
            return getMockBTCData();
        }

        const rawData = await response.json();
        const btcMarket = rawData[0];

        const btcData: BTCData = {
            price: btcMarket.current_price,
            marketCap: btcMarket.market_cap,
            volume24h: btcMarket.total_volume,
            change24h: btcMarket.price_change_percentage_24h,
            dominance: 0, // Will be calculated by dataLoader
            icon: btcMarket.image, // BTC icon from CoinGecko
        };

        // Validate output
        validateBTCData(btcData);

        // Update cache
        btcCache = { data: btcData, lastFetched: now };
        debugLog('data', 'OK: Fetched fresh BTC data from CoinGecko');

        return btcData;
    } catch (error) {
        debugLog('data', `Error fetching BTC from CoinGecko: ${error}`);

        // Return cached data if available
        if (btcCache) {
            debugLog('data', 'Returning cached BTC data due to fetch error');
            return btcCache.data;
        }

        // No cache, return fallback
        return getMockBTCData();
    }
}

/**
 * Fetch ecosystem tokens for a specific chain using CoinGecko categories
 * e.g., ethereum-ecosystem, solana-ecosystem, binance-smart-chain
 * Uses caching, mock flag, and 429 backoff
 */
export async function fetchEcosystemTokensFromCoinGecko(
    categoryId: string,
    limit: number = 24
): Promise<TokenData[]> {
    const now = Date.now();

    // Return mock data if flag is set
    if (USE_MOCK_COINGECKO) {
        debugLog('data', `Using MOCK ecosystem tokens for ${categoryId} (test mode)`);
        return getMockEcosystemTokens(categoryId, limit);
    }

    // Check if we're in rate limit cooldown for this category
    const lastHit = ecosystemRateLimitHit[categoryId] || 0;
    const cooldownRemaining = dataConfig.cache.rateLimitCooldown - (now - lastHit);
    if (lastHit > 0 && cooldownRemaining > 0) {
        debugLog('data', `In rate limit cooldown for ${categoryId} (${Math.ceil(cooldownRemaining / 1000)}s remaining)`);
        if (ecosystemTokensCache[categoryId]) {
            return ecosystemTokensCache[categoryId].data;
        }
        // No cache, return fallback
        return getMockEcosystemTokens(categoryId, limit);
    }

    // Return cache if valid and within TTL
    if (ecosystemTokensCache[categoryId] && (now - ecosystemTokensCache[categoryId].lastFetched < dataConfig.cache.ttl.tokens)) {
        debugLog('data', `Using cached ecosystem tokens for ${categoryId}`);
        return ecosystemTokensCache[categoryId].data;
    }

    // Fetch from API
    try {
        const url = `${dataConfig.coinGecko.baseURL}${dataConfig.coinGecko.endpoints.ecosystemTokens}?vs_currency=usd&category=${encodeURIComponent(categoryId)}&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`;
        debugLog('data', `Fetching ${limit} ecosystem tokens for ${categoryId} from: ${url}`);

        // Add API key if available
        const apiKey = process.env.COINGECKO_API_KEY;
        const headers: HeadersInit = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 429) {
                // Rate limited - record timestamp
                ecosystemRateLimitHit[categoryId] = now;
                debugLog('data', `CoinGecko rate limit hit (429) for ${categoryId} - entering cooldown`);
            } else {
                debugLog('data', `CoinGecko API error for ${categoryId}: ${response.status} ${response.statusText}`);
            }

            // Return cached data if available
            if (ecosystemTokensCache[categoryId]) {
                debugLog('data', `Returning cached tokens for ${categoryId} due to API error`);
                return ecosystemTokensCache[categoryId].data;
            }

            // No cache, return fallback
            return getMockEcosystemTokens(categoryId, limit);
        }

        const rawData: RawCoinGeckoEcosystemToken[] = await response.json();

        const platformsById = await getCoinPlatformsById();

        // Map to our TokenData format
        const tokens: TokenData[] = rawData.map(token => {
            const fdv = typeof token.fully_diluted_valuation === 'number' ? token.fully_diluted_valuation : undefined;
            const hasMarketCap = typeof token.market_cap === 'number' && token.market_cap > 0;
            const circulatingSupply = typeof token.circulating_supply === 'number' ? token.circulating_supply : undefined;
            const canEstimateCap = !hasMarketCap && !fdv && typeof token.current_price === 'number' && token.current_price > 0 && typeof circulatingSupply === 'number' && circulatingSupply > 0;
            const estimatedMarketCap = canEstimateCap ? token.current_price * circulatingSupply : 0;
            const marketCap = hasMarketCap ? token.market_cap : (fdv ?? estimatedMarketCap);
            const marketCapKind: TokenData["marketCapKind"] = hasMarketCap
                ? 'market_cap'
                : (fdv ? 'fdv' : (canEstimateCap ? 'estimated' : 'unknown'));

            const platformAddresses = platformsById.get(token.id);
            return {
                symbol: token.symbol.toUpperCase(),
                name: token.name,
                address: token.id, // Stable identifier for this app
                geckoId: token.id,
                platformAddresses,
                price: token.current_price || 0,
                change24h: token.price_change_percentage_24h || 0,
                volume24h: token.total_volume || 0,
                liquidity: 0, // CoinGecko doesn't provide liquidity in this endpoint
                marketCap,
                fdv,
                marketCapKind,
                color: getTokenColor(token.price_change_percentage_24h || 0),
                icon: token.image, // Include icon URL from CoinGecko
            };
        });

        // Update cache
        ecosystemTokensCache[categoryId] = { data: tokens, lastFetched: now };
        debugLog('data', `OK: Fetched ${tokens.length} fresh ecosystem tokens for ${categoryId}`);

        return tokens;
    } catch (error) {
        debugLog('data', `Error fetching ecosystem tokens for ${categoryId}: ${error}`);

        // Return cached data if available
        if (ecosystemTokensCache[categoryId]) {
            debugLog('data', `Returning cached tokens for ${categoryId} due to fetch error`);
            return ecosystemTokensCache[categoryId].data;
        }

        // No cache, return fallback
        // debugLog('data', `Falling back to mock data for ${categoryId}`);
        // return getMockEcosystemTokens(categoryId, limit);
        return []; // Return empty to avoid confusing user with mock data
    }
}

/**
 * Fetch prices for multiple coins by their CoinGecko IDs
 * Used to get native token prices for chains (ETH, SOL, BNB, etc.)
 */
export async function fetchCoinsPrices(coinIds: string[]): Promise<Record<string, number>> {
    if (coinIds.length === 0) return {};

    // Return mock data if flag is set
    if (USE_MOCK_COINGECKO) {
        debugLog('data', `Using MOCK prices for coins: ${coinIds.join(', ')}`);
        const mockPrices: Record<string, number> = {};
        coinIds.forEach(id => {
            mockPrices[id] = Math.random() * 5000 + 100; // Random price between 100-5100
        });
        return mockPrices;
    }

    try {
        const ids = coinIds.join(',');
        const url = `${dataConfig.coinGecko.baseURL}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_market_cap=true`;
        debugLog('data', `Fetching prices for coins: ${ids}`);

        // Add API key if available
        const apiKey = process.env.COINGECKO_API_KEY;
        const headers: HeadersInit = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 429) {
                debugLog('data', `CoinGecko rate limit hit (429) for coin prices - using fallback`);
            } else {
                debugLog('data', `CoinGecko API error for coin prices: ${response.status} ${response.statusText}`);
            }
            // Return empty object on error
            return {};
        }

        const rawData = await response.json() as Record<string, { usd?: number }>;

        // Transform to our format: { "ethereum": 2500, "solana": 100, ... }
        const prices: Record<string, number> = {};
        Object.entries(rawData).forEach(([coinId, data]) => {
            if (typeof data?.usd === 'number') {
                prices[coinId] = data.usd;
            }
        });

        debugLog('data', `OK: Fetched ${Object.keys(prices).length} coin prices`);
        return prices;
    } catch (error) {
        debugLog('data', `Error fetching coin prices: ${error}`);
        return {};
    }
}

/**
 * Fetch market caps for multiple coins by their CoinGecko IDs
 * Returns a map of coinId -> market cap in USD
 */
export async function fetchCoinMarketCaps(coinIds: string[]): Promise<Record<string, number>> {
    if (coinIds.length === 0) return {};

    // Return mock data if flag is set
    if (USE_MOCK_COINGECKO) {
        debugLog('data', `Using MOCK market caps for coins: ${coinIds.join(', ')}`);
        const mockCaps: Record<string, number> = {};
        coinIds.forEach(id => {
            mockCaps[id] = Math.random() * 500000000000 + 1000000000; // Random between $1B - $500B
        });
        return mockCaps;
    }

    try {
        const ids = coinIds.join(',');
        const url = `${dataConfig.coinGecko.baseURL}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_market_cap=true`;
        debugLog('data', `Fetching market caps for coins: ${ids}`);

        const apiKey = process.env.COINGECKO_API_KEY;
        const headers: HeadersInit = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

        const response = await fetch(url, { headers });

        if (!response.ok) {
            debugLog('data', `CoinGecko API error for market caps: ${response.status}`);
            return {};
        }

        const rawData = await response.json();

        // Transform to our format: { "ethereum": 360000000000, "solana": 70000000000, ... }
        const marketCaps: Record<string, number> = {};
        Object.entries(rawData).forEach(([coinId, data]) => {
            const coinData = data as { usd_market_cap?: number };
            if (coinData && coinData.usd_market_cap) {
                marketCaps[coinId] = coinData.usd_market_cap;
            }
        });

        debugLog('data', `OK: Fetched ${Object.keys(marketCaps).length} coin market caps`);
        return marketCaps;
    } catch (error) {
        debugLog('data', `Error fetching coin market caps: ${error}`);
        return {};
    }
}

export type CoinMarketSnapshot = {
    id: string;
    marketCap?: number;
    fdv?: number;
    price?: number;
    volume24h?: number;
    change24h?: number;
    circulatingSupply?: number;
    totalSupply?: number;
};

/**
 * Fetch market snapshot for multiple coins by CoinGecko IDs.
 * Uses /coins/markets to access fully_diluted_valuation + supply fields.
 */
export async function fetchCoinMarketSnapshots(coinIds: string[]): Promise<Record<string, CoinMarketSnapshot>> {
    if (coinIds.length === 0) return {};

    if (USE_MOCK_COINGECKO) {
        const out: Record<string, CoinMarketSnapshot> = {};
        coinIds.forEach(id => {
            out[id] = {
                id,
                marketCap: Math.random() * 500000000000 + 1000000000,
                fdv: Math.random() * 700000000000 + 1000000000,
                price: Math.random() * 2000 + 1,
                volume24h: Math.random() * 20000000000,
                change24h: (Math.random() * 40) - 20,
                circulatingSupply: Math.random() * 1e9,
                totalSupply: Math.random() * 2e9,
            };
        });
        return out;
    }

    try {
        const ids = coinIds.join(',');
        const url = `${dataConfig.coinGecko.baseURL}${dataConfig.coinGecko.endpoints.markets}?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${coinIds.length}&page=1&sparkline=false`;
        debugLog('data', `Fetching coin snapshots for: ${ids}`);

        const apiKey = process.env.COINGECKO_API_KEY;
        const headers: HeadersInit = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};
        const response = await fetch(url, { headers });
        if (!response.ok) {
            debugLog('data', `CoinGecko API error for snapshots: ${response.status} ${response.statusText}`);
            return {};
        }

        const rawData = await response.json() as Array<Record<string, unknown>>;
        const out: Record<string, CoinMarketSnapshot> = {};

        for (const row of rawData) {
            const id = typeof row.id === 'string' ? row.id : null;
            if (!id) continue;

            out[id] = {
                id,
                marketCap: typeof row.market_cap === 'number' ? row.market_cap : undefined,
                fdv: typeof row.fully_diluted_valuation === 'number' ? row.fully_diluted_valuation : undefined,
                price: typeof row.current_price === 'number' ? row.current_price : undefined,
                volume24h: typeof row.total_volume === 'number' ? row.total_volume : undefined,
                change24h: typeof row.price_change_percentage_24h === 'number' ? row.price_change_percentage_24h : undefined,
                circulatingSupply: typeof row.circulating_supply === 'number' ? row.circulating_supply : undefined,
                totalSupply: typeof row.total_supply === 'number' ? row.total_supply : undefined,
            };
        }

        return out;
    } catch (error) {
        debugLog('data', `Error fetching coin snapshots: ${error}`);
        return {};
    }
}

/**
 * Fetch specific tokens by their CoinGecko IDs
 * Used for priority tokens (moons)
 */
export async function fetchSpecificTokens(tokenIds: string[]): Promise<TokenData[]> {
    if (tokenIds.length === 0) return [];

    // Return mock data if flag is set
    if (USE_MOCK_COINGECKO) {
        debugLog('data', `Using MOCK specific tokens for: ${tokenIds.join(', ')}`);
        return tokenIds.map((id) => ({
            symbol: id.substring(0, 3).toUpperCase(),
            name: id,
            address: id,
            price: Math.random() * 100,
            change24h: (Math.random() * 40) - 20,
            volume24h: Math.random() * 10000000,
            liquidity: Math.random() * 5000000,
            marketCap: Math.random() * 100000000,
            color: getTokenColor((Math.random() * 40) - 20),
        }));
    }

    try {
        const ids = tokenIds.join(',');
        const url = `${dataConfig.coinGecko.baseURL}${dataConfig.coinGecko.endpoints.markets}?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${tokenIds.length}&page=1&sparkline=false`;
        debugLog('data', `Fetching specific tokens from: ${url}`);

        // Add API key if available
        const apiKey = process.env.COINGECKO_API_KEY;
        if (apiKey) {
            debugLog('data', `Using CoinGecko API Key: ${apiKey.substring(0, 4)}...`);
        } else {
            debugLog('data', `WARNING: No CoinGecko API Key found!`);
        }
        const headers: HeadersInit = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 429) {
                console.error(`[CoinGecko] ERROR: Rate limit hit (429) for specific tokens - check if COINGECKO_API_KEY is set`);
            } else {
                console.error(`[CoinGecko] ERROR: API error for specific tokens: ${response.status} ${response.statusText}`);
            }
            return [];
        }

        const rawData: RawCoinGeckoEcosystemToken[] = await response.json();

        // Optional enrichment: map CoinGecko IDs -> platform contract addresses.
        // - With an API key, use the large cached mapping endpoint.
        // - Without an API key, fall back to per-coin lookups for just these tokens (best effort).
        let platformsById = await getCoinPlatformsById();
        if (!apiKey) {
            platformsById = await fetchPlatformsForCoinIds(tokenIds, headers);
        }

        // Map to our TokenData format
        const tokens: TokenData[] = rawData.map(token => {
            const fdv = typeof token.fully_diluted_valuation === 'number' ? token.fully_diluted_valuation : undefined;
            const hasMarketCap = typeof token.market_cap === 'number' && token.market_cap > 0;
            const circulatingSupply = typeof token.circulating_supply === 'number' ? token.circulating_supply : undefined;
            const canEstimateCap = !hasMarketCap && !fdv && typeof token.current_price === 'number' && token.current_price > 0 && typeof circulatingSupply === 'number' && circulatingSupply > 0;
            const estimatedMarketCap = canEstimateCap ? token.current_price * circulatingSupply : 0;
            const marketCap = hasMarketCap ? token.market_cap : (fdv ?? estimatedMarketCap);
            const marketCapKind: TokenData["marketCapKind"] = hasMarketCap
                ? 'market_cap'
                : (fdv ? 'fdv' : (canEstimateCap ? 'estimated' : 'unknown'));

            const platformAddresses = platformsById.get(token.id);
            return {
                symbol: token.symbol.toUpperCase(),
                name: token.name,
                address: token.id, // Stable identifier for this app
                geckoId: token.id,
                platformAddresses,
                price: token.current_price || 0,
                change24h: token.price_change_percentage_24h || 0,
                volume24h: token.total_volume || 0,
                liquidity: 0,
                marketCap,
                fdv,
                marketCapKind,
                color: getTokenColor(token.price_change_percentage_24h || 0),
                icon: token.image, // Include icon URL from CoinGecko
            };
        });

        debugLog('data', `OK: Fetched ${tokens.length} specific priority tokens`);
        return tokens;

    } catch (error) {
        debugLog('data', `Error fetching specific tokens: ${error}`);
        return [];
    }
}

/**
 * Fetch coin icons from CoinGecko by their IDs
 * Returns a map of coinId -> icon URL
 */
export async function fetchCoinIcons(coinIds: string[]): Promise<Record<string, string>> {
    if (coinIds.length === 0) return {};

    try {
        const ids = coinIds.join(',');
        const url = `${dataConfig.coinGecko.baseURL}${dataConfig.coinGecko.endpoints.markets}?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${coinIds.length}&page=1&sparkline=false`;
        
        const apiKey = process.env.COINGECKO_API_KEY;
        const headers: HeadersInit = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

        const response = await fetch(url, { headers });

        if (!response.ok) {
            debugLog('data', `CoinGecko API error for coin icons: ${response.status}`);
            return {};
        }

        const rawData: RawCoinGeckoEcosystemToken[] = await response.json();
        
        const icons: Record<string, string> = {};
        rawData.forEach(coin => {
            if (coin.image) {
                icons[coin.id] = coin.image;
            }
        });

        debugLog('data', `Fetched ${Object.keys(icons).length} coin icons`);
        return icons;
    } catch (error) {
        debugLog('data', `Error fetching coin icons: ${error}`);
        return {};
    }
}
