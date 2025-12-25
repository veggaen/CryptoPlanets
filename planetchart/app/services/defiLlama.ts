import { dataConfig } from "@/config/dataConfig";
import { DefiLlamaChain, ChainData } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { validateDefiLlamaChains } from "@/utils/validation";

// Cache
let chainsCache: DefiLlamaChain[] | null = null;
let lastFetchTime = 0;

type CachedNumber = { value: number | null; timestamp: number };
const dexTotalCache: CachedNumber = { value: null, timestamp: 0 };
const dexChainCache: Map<string, CachedNumber> = new Map();

function isFresh(timestamp: number, ttlMs: number): boolean {
    return Date.now() - timestamp < ttlMs;
}

type DexOverviewResponse = {
    total24h?: number;
};

type DexChainResponse = {
    total24h?: number;
};

export async function fetchDexTotal24h(): Promise<number | null> {
    try {
        const ttl = dataConfig.cache.ttl.chains;
        if (dexTotalCache.timestamp > 0 && isFresh(dexTotalCache.timestamp, ttl)) {
            return dexTotalCache.value;
        }

        const url = `${dataConfig.defiLlama.baseURL}/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const raw = await response.json() as DexOverviewResponse;
        const value = typeof raw.total24h === 'number' && raw.total24h >= 0 ? raw.total24h : null;
        dexTotalCache.value = value;
        dexTotalCache.timestamp = Date.now();
        return value;
    } catch {
        return null;
    }
}

export async function fetchDexChainVolume24h(chainName: string): Promise<number | null> {
    try {
        const ttl = dataConfig.cache.ttl.chains;
        const cached = dexChainCache.get(chainName);
        if (cached && isFresh(cached.timestamp, ttl)) {
            return cached.value;
        }

        const candidates = getDexChainCandidates(chainName);
        for (const candidate of candidates) {
            const encoded = encodeURIComponent(candidate);
            const url = `${dataConfig.defiLlama.baseURL}/overview/dexs/${encoded}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume`;
            const response = await fetch(url);
            if (!response.ok) continue;
            const raw = await response.json() as DexChainResponse;
            const value = typeof raw.total24h === 'number' && raw.total24h >= 0 ? raw.total24h : null;
            // Cache using the original input name so callers don't need to normalize.
            dexChainCache.set(chainName, { value, timestamp: Date.now() });
            return value;
        }

        dexChainCache.set(chainName, { value: null, timestamp: Date.now() });
        return null;
    } catch {
        return null;
    }
}

function getDexChainCandidates(chainName: string): string[] {
    // DefiLlama endpoints sometimes use short names (e.g. "BSC") while chains/tvl can return "BNB Chain".
    const trimmed = chainName.trim();
    const candidates: string[] = [trimmed];

    const aliases: Record<string, string[]> = {
        'BNB Chain': ['BSC'],
        'BSC': ['BNB Chain'],
        'Binance Smart Chain': ['BSC', 'BNB Chain'],
        'PulseChain': ['Pulsechain'],
        'Pulsechain': ['PulseChain'],
    };

    const extra = aliases[trimmed];
    if (extra) candidates.push(...extra);

    // De-dupe while preserving order.
    return [...new Set(candidates)];
}

export async function fetchChainsTVL(): Promise<ChainData[]> {
    const now = Date.now();

    // Return cache if valid
    if (chainsCache && (now - lastFetchTime < dataConfig.cache.ttl.chains)) {
        debugLog('data', 'Using cached DefiLlama chains');
        return transformChains(chainsCache);
    }

    try {
        debugLog('data', 'Fetching chains from DefiLlama...');
        const response = await fetch(`${dataConfig.defiLlama.baseURL}${dataConfig.defiLlama.endpoints.chains}`);

        if (!response.ok) {
            throw new Error(`DefiLlama API error: ${response.status}`);
        }

        const rawData = await response.json();
        // console.log('DefiLlama rawData:', JSON.stringify(rawData, null, 2)); // Debug log

        // Validate
        validateDefiLlamaChains(rawData);

        // Update cache
        chainsCache = rawData;
        lastFetchTime = now;

        return transformChains(rawData);
    } catch (error) {
        console.error("Failed to fetch DefiLlama chains:", error);
        if (dataConfig.useMockDataOnError) {
            return getMockChains();
        }
        return [];
    }
}

function transformChains(chains: DefiLlamaChain[]): ChainData[] {
    // Filter and map to our internal ChainData format
    return chains
        .filter(c => c.tvl > dataConfig.minTVLThreshold)
        .map(c => {
            // Map DefiLlama name to our ChainID if possible
            const mappedId = Object.entries(dataConfig.chainIdMap).find(([dlName]) => dlName === c.name)?.[1];

            // If not in our map, skip it (or use a generic ID if we want to support all)
            // For now, we only support chains in our map to ensure we can get tokens for them
            if (!mappedId) return null;

            const chainData: ChainData = {
                id: mappedId,
                symbol: c.tokenSymbol || c.name.substring(0, 4).toUpperCase(),
                name: c.name,
                weight: c.tvl, // Default weight, re-calculated later
                tvl: c.tvl,
                tvlKind: 'defillama',
                change24h: 0, // Filled from CoinGecko snapshots (native token) in API route
                change24hKind: 'unknown',
                volume24h: 0, // Filled from DefiLlama DEX volume endpoint in API route (Volume24h mode)
                dominance: 0, // Calculated later
                color: "from-gray-500 to-gray-700", // Default color, overridden by visualConfig
                tokens: [],
                // Store gecko_id temporarily for price fetching (convert null to undefined for Zod)
                geckoId: c.gecko_id ?? undefined,
            };
            return chainData;
        })
        .filter((c): c is ChainData => c !== null);
}

function getMockChains(): ChainData[] {
    debugLog('data', 'Using MOCK DefiLlama chains');
    return [
        { id: "ethereum", symbol: "ETH", name: "Ethereum", weight: 0, tvl: 60000000000, change24h: 2.5, volume24h: 1000000000, dominance: 0, color: "", tokens: [] },
        { id: "solana", symbol: "SOL", name: "Solana", weight: 0, tvl: 4000000000, change24h: 5.2, volume24h: 500000000, dominance: 0, color: "", tokens: [] },
        { id: "bsc", symbol: "BNB", name: "BSC", weight: 0, tvl: 5000000000, change24h: -1.1, volume24h: 300000000, dominance: 0, color: "", tokens: [] },
    ];
}
