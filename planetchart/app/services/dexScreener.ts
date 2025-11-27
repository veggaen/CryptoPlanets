import { dataConfig } from "@/config/dataConfig";
import { TokenData } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { validateDexScreenerTokens } from "@/utils/validation";

// Cache
const tokensCache: Record<string, { data: TokenData[], timestamp: number }> = {};

// HEX contract address (same on Ethereum and PulseChain due to fork)
const HEX_CONTRACT = "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39";

// Cache for HEX data
let hexCache: { data: { eHEX: TokenData | null, pHEX: TokenData | null }, timestamp: number } | null = null;

/**
 * Fetch HEX token data from DexScreener
 * CoinGecko has broken market cap data for HEX (shows 0 due to OA controversy)
 * DexScreener provides accurate circulating market cap excluding OA
 * 
 * Returns both eHEX (Ethereum) and pHEX (PulseChain) data
 */
export async function fetchHEXData(): Promise<{ eHEX: TokenData | null, pHEX: TokenData | null }> {
    const now = Date.now();

    // Return cache if valid (10 min TTL)
    if (hexCache && (now - hexCache.timestamp < dataConfig.cache.ttl.tokens)) {
        debugLog('data', 'Using cached HEX data from DexScreener');
        return hexCache.data;
    }

    try {
        debugLog('data', 'Fetching HEX data from DexScreener (better market cap than CoinGecko)...');

        const url = `${dataConfig.dexScreener.baseURL}/latest/dex/tokens/${HEX_CONTRACT}`;
        console.log('[HEX] Fetching from:', url);
        const response = await fetch(url);

        if (!response.ok) {
            console.error('[HEX] DexScreener error:', response.status);
            throw new Error(`DexScreener API error: ${response.status}`);
        }

        const rawData = await response.json();
        console.log('[HEX] Raw pairs count:', rawData.pairs?.length || 0);

        if (!rawData.pairs || !Array.isArray(rawData.pairs)) {
            console.error('[HEX] No pairs in response');
            return { eHEX: null, pHEX: null };
        }

        // Find the best pair for each chain (highest liquidity)
        const ethPairs = rawData.pairs.filter((p: any) => p.chainId === 'ethereum');
        const plsPairs = rawData.pairs.filter((p: any) => p.chainId === 'pulsechain');
        console.log('[HEX] Ethereum pairs:', ethPairs.length, 'PulseChain pairs:', plsPairs.length);

        // Get highest liquidity pair for each chain
        const bestEthPair = ethPairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
        const bestPlsPair = plsPairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

        const getTokenColor = (change24h: number): string => {
            if (change24h > 10) return "from-green-400 to-emerald-600";
            if (change24h > 0) return "from-green-300 to-green-500";
            if (change24h < -10) return "from-red-400 to-rose-600";
            if (change24h < 0) return "from-red-300 to-red-500";
            return "from-slate-400 to-slate-600";
        };

        let eHEX: TokenData | null = null;
        let pHEX: TokenData | null = null;

        if (bestEthPair) {
            const change24h = bestEthPair.priceChange?.h24 || 0;
            eHEX = {
                symbol: "HEX",
                name: "HEX",
                address: "hex", // Use CoinGecko ID for consistency
                price: parseFloat(bestEthPair.priceUsd || "0"),
                change24h,
                volume24h: bestEthPair.volume?.h24 || 0,
                liquidity: bestEthPair.liquidity?.usd || 0,
                // Use circulating marketCap (excludes OA), fallback to FDV
                marketCap: bestEthPair.marketCap || bestEthPair.fdv || 0,
                color: getTokenColor(change24h),
                icon: bestEthPair.info?.imageUrl || "https://coin-images.coingecko.com/coins/images/10103/large/HEX-logo.png",
            };
            console.log('[HEX] OK: Created eHEX:', { price: eHEX.price, mc: eHEX.marketCap });
        } else {
            console.log('[HEX] ERROR: No Ethereum pairs found!');
        }

        if (bestPlsPair) {
            const change24h = bestPlsPair.priceChange?.h24 || 0;
            pHEX = {
                symbol: "HEX", // Will display as HEX, but on PulseChain
                name: "HEX (PulseChain)",
                address: "hex-pulsechain", // Use CoinGecko ID for consistency
                price: parseFloat(bestPlsPair.priceUsd || "0"),
                change24h,
                volume24h: bestPlsPair.volume?.h24 || 0,
                liquidity: bestPlsPair.liquidity?.usd || 0,
                // Use circulating marketCap (excludes OA), fallback to FDV
                marketCap: bestPlsPair.marketCap || bestPlsPair.fdv || 0,
                color: getTokenColor(change24h),
                icon: bestPlsPair.info?.imageUrl || "https://coin-images.coingecko.com/coins/images/10103/large/HEX-logo.png",
            };
            console.log('[HEX] OK: Created pHEX:', { price: pHEX.price, mc: pHEX.marketCap });
        }

        // Update cache
        hexCache = { data: { eHEX, pHEX }, timestamp: now };

        debugLog('data', 'OK: Fetched HEX data from DexScreener (accurate market cap)');
        return { eHEX, pHEX };

    } catch (error) {
        debugLog('data', `Error fetching HEX from DexScreener: ${error}`);
        return { eHEX: null, pHEX: null };
    }
}

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
