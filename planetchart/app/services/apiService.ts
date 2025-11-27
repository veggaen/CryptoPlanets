import { debugLog } from "@/utils/debug";

// Rate limiting configuration
const RATE_LIMITS = {
    INFURA: { maxCalls: 100000, interval: 24 * 60 * 60 * 1000 }, // 100k/day
    ETHERSCAN: { maxCalls: 5, interval: 1000 }, // 5/sec
    COINGECKO: { maxCalls: 30, interval: 60 * 1000 }, // 30/min (conservative)
    DEXSCREENER: { maxCalls: 60, interval: 60 * 1000 }, // 1/sec (estimated)
};

// Cache configuration
const CACHE_TTL = {
    PRICES: 60 * 1000, // 1 min
    CHAIN_STATS: 5 * 60 * 1000, // 5 min
    TOKEN_DATA: 5 * 60 * 1000, // 5 min
};

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const cache: Record<string, CacheEntry<any>> = {};
const callCounts: Record<string, number> = {};
const lastReset: Record<string, number> = {};

/**
 * Check rate limits for a service
 */
function checkRateLimit(service: keyof typeof RATE_LIMITS): boolean {
    const now = Date.now();
    const limit = RATE_LIMITS[service];

    if (!lastReset[service] || now - lastReset[service] > limit.interval) {
        callCounts[service] = 0;
        lastReset[service] = now;
    }

    if (callCounts[service] >= limit.maxCalls) {
        debugLog('api', `Rate limit hit for ${service}`);
        return false;
    }

    callCounts[service]++;
    return true;
}

/**
 * Generic fetch with caching and rate limiting
 */
export async function fetchWithCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
    service: keyof typeof RATE_LIMITS
): Promise<T | null> {
    const now = Date.now();

    // Check cache
    if (cache[key] && now - cache[key].timestamp < ttl) {
        debugLog('api', `Using cached data for ${key}`);
        return cache[key].data;
    }

    // Check rate limit
    if (!checkRateLimit(service)) {
        // Return stale cache if available, otherwise null
        if (cache[key]) {
            debugLog('api', `Rate limited, using stale cache for ${key}`);
            return cache[key].data;
        }
        return null;
    }

    try {
        const data = await fetcher();
        cache[key] = { data, timestamp: now };
        return data;
    } catch (error) {
        console.error(`API Error [${service}] ${key}:`, error);
        // Return stale cache if available
        if (cache[key]) return cache[key].data;
        return null;
    }
}

// --- Specific API Helpers ---

export const apiService = {
    // Infura RPC Provider (placeholder for now, usually used with ethers.js/web3.js)
    getInfuraProviderUrl: (chainId: string) => {
        const key = process.env.INFURA_RPC;
        if (!key) return null;

        // Map internal chain IDs to Infura network names
        const networkMap: Record<string, string> = {
            'ethereum': 'mainnet',
            'polygon': 'polygon-mainnet',
            'optimism': 'optimism-mainnet',
            'arbitrum': 'arbitrum-mainnet',
        };

        const network = networkMap[chainId];
        if (!network) return null;

        return `https://${network}.infura.io/v3/${key}`;
    },

    // Etherscan API
    getEtherscanUrl: (module: string, action: string, params: string) => {
        const key = process.env.ETHERSCAN_API_KEY;
        return `https://api.etherscan.io/api?module=${module}&action=${action}&${params}&apikey=${key}`;
    }
};
