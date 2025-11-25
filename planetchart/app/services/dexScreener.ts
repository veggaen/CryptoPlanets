import { dataConfig } from "@/config/dataConfig";
import { TokenData } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { validateDexScreenerTokens } from "@/utils/validation";

// Cache
const tokensCache: Record<string, { data: TokenData[], timestamp: number }> = {};

export async function fetchTokensForChain(chainId: string, limit: number = 20): Promise<TokenData[]> {
    const now = Date.now();

    // Return cache if valid
    if (tokensCache[chainId] && (now - tokensCache[chainId].timestamp < dataConfig.cache.ttl.tokens)) {
        debugLog('data', `Using cached tokens for ${chainId}`);
        return tokensCache[chainId].data;
    }

    try {
        debugLog('data', `Fetching tokens for ${chainId} from DexScreener...`);

        // DexScreener search endpoint
        const searchUrl = `${dataConfig.dexScreener.baseURL}${dataConfig.dexScreener.endpoints.search}?q=${chainId}`;
        const response = await fetch(searchUrl);

        if (!response.ok) {
            throw new Error(`DexScreener API error: ${response.status}`);
        }

        const rawData = await response.json();

        // The search returns pairs. We need to extract unique base tokens from these pairs.
        if (!rawData.pairs || !Array.isArray(rawData.pairs)) {
            return [];
        }

        // Filter for the correct chainId (DexScreener uses specific chain IDs)
        // We need to map our internal ID to DexScreener's if they differ.
        // dataConfig.chainIdMap handles this.
        const targetChainId = dataConfig.chainIdMap[chainId as keyof typeof dataConfig.chainIdMap] || chainId;

        const relevantPairs = rawData.pairs.filter((p: any) => p.chainId === targetChainId);

        // Extract unique tokens
        const uniqueTokens = new Map<string, TokenData>();

        for (const pair of relevantPairs) {
            if (uniqueTokens.size >= limit) break;

            const token = pair.baseToken;
            if (uniqueTokens.has(token.address)) continue;

            uniqueTokens.set(token.address, {
                symbol: token.symbol,
                name: token.name,
                address: token.address,
                price: parseFloat(pair.priceUsd || "0"),
                change24h: pair.priceChange?.h24 || 0,
                volume24h: pair.volume?.h24 || 0,
                liquidity: pair.liquidity?.usd || 0,
                marketCap: pair.fdv || pair.marketCap || 0,
                color: "from-slate-400 to-slate-600", // Default, will be themed
            });
        }

        const tokens = Array.from(uniqueTokens.values());

        // Update cache
        tokensCache[chainId] = { data: tokens, timestamp: now };

        return tokens;
    } catch (error) {
        console.error(`Failed to fetch tokens for ${chainId}:`, error);
        if (dataConfig.useMockDataOnError) {
            return getMockTokens(chainId);
        }
        return [];
    }
}

function getMockTokens(chainId: string): TokenData[] {
    // Return some dummy tokens based on chain
    const suffix = chainId.substring(0, 3).toUpperCase();
    return Array.from({ length: 5 }).map((_, i) => ({
        symbol: `TKN${i}-${suffix}`,
        name: `Token ${i} ${suffix}`,
        address: `0x${i}${i}${i}`,
        price: Math.random() * 100,
        change24h: (Math.random() * 20) - 10,
        volume24h: Math.random() * 1000000,
        liquidity: Math.random() * 500000,
        marketCap: Math.random() * 10000000,
        color: "from-blue-400 to-blue-600"
    }));
}
