import { dataConfig } from "@/config/dataConfig";
import { BTCData, TokenData } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { validateBTCData } from "@/utils/validation";

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
const ecosystemTokensCache: Record<string, CacheEntry<TokenData[]>> = {};

// ===== RATE LIMIT TRACKING =====
let btcRateLimitHit: number = 0;
const ecosystemRateLimitHit: Record<string, number> = {};

// ===== TYPE DEFINITIONS =====
export type RawCoinGeckoEcosystemToken = {
    id: string;
    symbol: string;
    name: string;
    current_price: number;
    market_cap: number;
    fully_diluted_valuation?: number | null;
    price_change_percentage_24h: number | null;
    total_volume: number;
    image?: string;
};

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

        // Map to our TokenData format
        // Use fully_diluted_valuation as fallback for market_cap
        const tokens: TokenData[] = rawData.map(token => {
            const marketCap = token.market_cap || token.fully_diluted_valuation || 0;
            return {
                symbol: token.symbol.toUpperCase(),
                name: token.name,
                address: token.id, // Use CoinGecko ID as address
                price: token.current_price || 0,
                change24h: token.price_change_percentage_24h || 0,
                volume24h: token.total_volume || 0,
                liquidity: 0, // CoinGecko doesn't provide liquidity in this endpoint
                marketCap,
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

    const now = Date.now();

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

        const rawData = await response.json();

        // Transform to our format: { "ethereum": 2500, "solana": 100, ... }
        const prices: Record<string, number> = {};
        Object.entries(rawData).forEach(([coinId, data]: [string, any]) => {
            if (data && data.usd) {
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

/**
 * Fetch specific tokens by their CoinGecko IDs
 * Used for priority tokens (moons)
 */
export async function fetchSpecificTokens(tokenIds: string[]): Promise<TokenData[]> {
    if (tokenIds.length === 0) return [];

    const now = Date.now();

    // Return mock data if flag is set
    if (USE_MOCK_COINGECKO) {
        debugLog('data', `Using MOCK specific tokens for: ${tokenIds.join(', ')}`);
        return tokenIds.map((id, i) => ({
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

        // Map to our TokenData format
        // Use fully_diluted_valuation as fallback for market_cap (e.g., HEX has market_cap:0 but FDV:68M)
        const tokens: TokenData[] = rawData.map(token => {
            const marketCap = token.market_cap || token.fully_diluted_valuation || 0;
            return {
                symbol: token.symbol.toUpperCase(),
                name: token.name,
                address: token.id, // Use CoinGecko ID as address
                price: token.current_price || 0,
                change24h: token.price_change_percentage_24h || 0,
                volume24h: token.total_volume || 0,
                liquidity: 0,
                marketCap,
                color: getTokenColor(token.price_change_percentage_24h || 0),
                icon: token.image, // Include icon URL from CoinGecko
            };
        });

        debugLog('data', `OK: Fetched ${tokens.length} specific priority tokens (using FDV fallback for market_cap=0)`);
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
