import { dataConfig } from "@/config/dataConfig";
import { BTCData, CoinGeckoMarket } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { validateCoinGeckoMarkets, validateBTCData } from "@/utils/validation";

// Cache
let btcCache: BTCData | null = null;
let lastFetchTime = 0;

export async function fetchBTCStats(): Promise<BTCData> {
    const now = Date.now();

    // Return cache if valid
    if (btcCache && (now - lastFetchTime < dataConfig.cache.ttl.btc)) {
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

        // Validate
        validateCoinGeckoMarkets(rawData);

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
        lastFetchTime = now;

        return btcData;
    } catch (error) {
        console.error("Failed to fetch BTC stats:", error);
        if (dataConfig.useMockDataOnError) {
            return getMockBTCData();
        }
        throw error;
    }
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

/**
 * Fetch top cryptocurrencies by market cap
 * Phase 2: Will implement if needed
 */
export async function fetchTopCoins(limit: number): Promise<CoinGeckoMarket[]> {
    debugLog('data', `fetchTopCoins(${limit}) (Phase 2 stub)`);
    throw new Error("Not implemented: Phase 2");
}
