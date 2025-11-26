import { dataConfig } from "@/config/dataConfig";
import { DefiLlamaChain, ChainData } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { validateDefiLlamaChains } from "@/utils/validation";

// Cache
let chainsCache: DefiLlamaChain[] | null = null;
let lastFetchTime = 0;

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
                change24h: 0, // DefiLlama chains endpoint doesn't give 24h change, need another endpoint or calc
                volume24h: 0, // Placeholder
                dominance: 0, // Calculated later
                color: "from-gray-500 to-gray-700", // Default color, overridden by visualConfig
                tokens: [],
                // Store gecko_id temporarily for price fetching
                geckoId: c.gecko_id,
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
