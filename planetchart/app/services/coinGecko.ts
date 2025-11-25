import { dataConfig } from "@/config/dataConfig";
import { BTCData, TokenData } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { validateBTCData } from "@/utils/validation";

// Cache
let btcCache: BTCData | null = null;
let lastBTCFetchTime = 0;

const ecosystemTokensCache: Record<string, { data: TokenData[], timestamp: number }> = {};

// CoinGecko raw response types
export type RawCoinGeckoEcosystemToken = {
    id: string;
    symbol: string;
    name: string;
    current_price: number;
    market_cap: number;
    price_change_percentage_24h: number | null;
    total_volume: number;
    image?: string;
};

/**
 * Fetch ecosystem tokens for a specific chain using CoinGecko categories
 * e.g., ethereum-ecosystem, solana-ecosystem, binance-smart-chain
 */
export async function fetchEcosystemTokensFromCoinGecko(
    categoryId: string,
    limit: number = 24
): Promise<TokenData[]> {
    const now = Date.now();

    // Return cache if valid
    if (ecosystemTokensCache[categoryId] && (now - ecosystemTokensCache[categoryId].timestamp < dataConfig.cache.ttl.tokens)) {
        debugLog('data', `Using cached ecosystem tokens for ${categoryId}`);
        return ecosystemTokensCache[categoryId].data;
    }

    try {
        debugLog('data', `Fetching ecosystem tokens for ${categoryId} from CoinGecko...`);

        // Build URL with params
        const params = new URLSearchParams({
            vs_currency: 'usd',
            category: categoryId,
            order: 'market_cap_desc',
            per_page: limit.toString(),
            page: '1',
            sparkline: 'false',
        });

        const url = `${dataConfig.coinGecko.baseURL}${dataConfig.coinGecko.endpoints.ecosystemTokens}?${params}`;

        // Add API key if available
        const apiKey = process.env.COINGECKO_API_KEY;
        const headers: HeadersInit = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

        const response = await fetch(url, { headers });

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
        }

        const rawData: RawCoinGeckoEcosystemToken[] = await response.json();

        // Map to our TokenData format
        const tokens: TokenData[] = rawData.map(token => ({
            symbol: token.symbol.toUpperCase(),
            name: token.name,
            address: token.id, // Use CoinGecko ID as address for now
            price: token.current_price || 0,
            change24h: token.price_change_percentage_24h || 0,
            volume24h: token.total_volume || 0,
            liquidity: 0, // CoinGecko doesn't provide liquidity in this endpoint
            marketCap: token.market_cap || 0,
            color: getTokenColor(token.price_change_percentage_24h || 0),
        }));

        // Update cache
        ecosystemTokensCache[categoryId] = { data: tokens, timestamp: now };

        debugLog('data', `✅ Fetched ${tokens.length} ecosystem tokens for ${categoryId}`);
        return tokens;

    } catch (error) {
        console.error(`Failed to fetch ecosystem tokens for ${categoryId}:`, error);
        if (dataConfig.useMockDataOnError) {
            return getMockEcosystemTokens(categoryId, limit);
        }
        return [];
    }
}

/**
 * Fetch BTC stats from CoinGecko
 */
export async function fetchBTCStats(): Promise<BTCData> {
    const now = Date.now();

    // Return cache if valid
    if (btcCache && (now - lastBTCFetchTime < dataConfig.cache.ttl.btc)) {
        debugLog('data', 'Using cached BTC data');
        return btcCache;
    }

    try {
        debugLog('data', 'Fetching BTC stats from CoinGecko...');
        const response = await fetch(`${dataConfig.coinGecko.baseURL}${dataConfig.coinGecko.endpoints.markets}?vs_currency=usd&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false`);

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const rawData = await response.json();
        const btcMarket = rawData[0];

        const btcData: BTCData = {
            price: btcMarket.current_price,
            marketCap: btcMarket.market_cap,
            volume24h: btcMarket.total_volume,
            change24h: btcMarket.price_change_percentage_24h,
            dominance: 0, // Will be calculated by dataLoader
        };

        // Validate output
        validateBTCData(btcData);

        // Update cache
        btcCache = btcData;
        lastBTCFetchTime = now;

        return btcData;
    } catch (error) {
        console.error("Failed to fetch BTC stats:", error);
        if (dataConfig.useMockDataOnError) {
            return getMockBTCData();
        }
        throw error;
    }
}

// Helper functions
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

