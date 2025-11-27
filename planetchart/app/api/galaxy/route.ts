/**
 * Galaxy Data API Route - Centralized Caching Layer
 * 
 * This route is the ONLY place that calls external APIs (CoinGecko, DefiLlama, DexScreener).
 * All clients fetch from this endpoint, which returns cached data to avoid rate limits.
 * 
 * HOW TO ADJUST:
 * - CACHE_TTL_MS: How long data stays fresh (default 60 seconds)
 * - STALE_TTL_MS: How long stale data can be served if API fails (default 5 minutes)
 * 
 * CACHE BEHAVIOR:
 * 1. If cache is fresh (< CACHE_TTL_MS old) → return cached data immediately
 * 2. If cache is stale but API fails → return stale cache with "stale" flag
 * 3. If no cache exists and API fails → return error
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GalaxyData, WeightMode, ChainData } from '@/types/galaxy';

// ===== CACHE CONFIGURATION =====
const CACHE_TTL_MS = 60_000;        // 60 seconds - how often to refresh from external APIs
const STALE_TTL_MS = 300_000;       // 5 minutes - max age for stale cache fallback

// ===== IN-MEMORY CACHE =====
interface CacheEntry {
    data: GalaxyData;
    timestamp: number;
    source: 'api' | 'cache' | 'stale-cache';
}

// Module-level cache - persists across requests in the same Node.js process
const galaxyCache: Map<string, CacheEntry> = new Map();

// Lock to prevent multiple simultaneous API calls
let fetchInProgress: Promise<GalaxyData> | null = null;

// ===== HELPER: Check if cache is fresh =====
function isCacheFresh(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

function isCacheUsable(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < STALE_TTL_MS;
}

// ===== CORE DATA FETCHING (calls external APIs) =====
async function fetchGalaxyDataFromAPIs(weightMode: WeightMode): Promise<GalaxyData> {
    // Import services dynamically to avoid circular dependencies
    const { fetchChainsTVL } = await import('@/services/defiLlama');
    const { fetchHEXData } = await import('@/services/dexScreener');
    const { fetchBTCStats, fetchSpecificTokens, fetchCoinsPrices, fetchCoinIcons } = await import('@/services/coinGecko');
    const { getPulseChainData } = await import('@/services/pulseChain');
    const { dataConfig, CHAIN_TOKENS, STABLECOIN_SYMBOLS, WRAPPED_PATTERNS, CHAIN_NATIVE_SYMBOLS } = await import('@/config/dataConfig');

    // Helper functions
    const isStable = (symbol: string): boolean => STABLECOIN_SYMBOLS.has(symbol.toUpperCase());
    const isWrapped = (symbol: string): boolean => WRAPPED_PATTERNS.has(symbol.toUpperCase());
    const isChainNative = (symbol: string): boolean => CHAIN_NATIVE_SYMBOLS.has(symbol.toUpperCase());

    const calculateWeight = (chain: ChainData, mode: WeightMode): number => {
        switch (mode) {
            case 'TVL': return chain.tvl;
            case 'MarketCap': return chain.tvl;
            case 'Volume24h': return chain.volume24h;
            case 'Change24h': return Math.abs(chain.change24h);
            default: return chain.tvl;
        }
    };

    console.log('[API] Fetching fresh galaxy data from external APIs...');

    // 1. Fetch Core Data (Parallel)
    const [btcData, chains, pulseChain] = await Promise.all([
        fetchBTCStats(),
        fetchChainsTVL(),
        getPulseChainData()
    ]);

    // Add PulseChain to chains list if not present
    const allChains = [...chains];
    if (!allChains.find(c => c.id === 'pulsechain')) {
        allChains.push(pulseChain);
    }

    // 2. Sort & Filter Chains
    const weightedChains = allChains
        .map(chain => ({
            ...chain,
            weight: calculateWeight(chain, weightMode),
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, dataConfig.maxChains);

    // 3. Fetch Prices and Icons (Batch - single API call for all chains)
    const geckoIds = weightedChains
        .map(c => c.geckoId)
        .filter((id): id is string => id !== undefined && id !== null);

    console.log(`[API] Fetching prices/icons for ${geckoIds.length} chains in single batch`);
    const [chainPrices, chainIcons] = await Promise.all([
        fetchCoinsPrices(geckoIds),
        fetchCoinIcons(geckoIds)
    ]);

    // Apply chain prices and icons
    weightedChains.forEach(chain => {
        if (chain.geckoId) {
            if (chainPrices[chain.geckoId]) chain.price = chainPrices[chain.geckoId];
            if (chainIcons[chain.geckoId]) chain.icon = chainIcons[chain.geckoId];
        }
    });

    const totalVal = btcData.marketCap + allChains.reduce((sum, c) => sum + c.tvl, 0);

    // Fetch HEX data from DexScreener (CoinGecko has broken market cap data for HEX)
    const hexData = await fetchHEXData();

    // 4. Fetch ALL tokens in ONE batch call to minimize API requests
    const allTokenIds: string[] = [];
    const chainTokenMap: Map<string, string[]> = new Map();

    weightedChains.forEach(chain => {
        const curatedTokenIds = CHAIN_TOKENS[chain.id];
        if (curatedTokenIds && curatedTokenIds.length > 0) {
            // Filter out HEX IDs - we add from DexScreener
            const tokenIds = curatedTokenIds.filter(id => id !== 'hex' && id !== 'hex-pulsechain');
            chainTokenMap.set(chain.id, tokenIds);
            allTokenIds.push(...tokenIds);
        }
    });

    // Single batch fetch for ALL tokens across ALL chains
    const uniqueTokenIds = [...new Set(allTokenIds)];
    console.log(`[API] Fetching ${uniqueTokenIds.length} tokens in single batch call`);
    
    let allTokens: any[] = [];
    if (uniqueTokenIds.length > 0) {
        allTokens = await fetchSpecificTokens(uniqueTokenIds);
        console.log(`[API] Got ${allTokens.length} tokens from CoinGecko`);
    }

    // Create lookup map for tokens
    const tokenLookup = new Map(allTokens.map(t => [t.address, t])); // address = coingecko ID

    // 5. Assign tokens to chains
    const chainsWithTokens = weightedChains.map(chain => {
        const chainTokenIds = chainTokenMap.get(chain.id) || [];
        
        let tokens = chainTokenIds
            .map(id => tokenLookup.get(id))
            .filter((t): t is any => t !== undefined);

        // Apply safety filters
        tokens = tokens.filter(t => {
            const symbol = (t.symbol || "").toUpperCase();
            if (!symbol) return false;
            if (isStable(symbol)) return false;
            if (isWrapped(symbol)) return false;
            if (isChainNative(symbol)) return false;
            return true;
        });

        // Sort by marketCap and limit
        tokens = tokens
            .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
            .slice(0, dataConfig.tokensPerChain);

        // Add HEX from DexScreener
        if (chain.id === 'ethereum' && hexData.eHEX) {
            tokens = tokens.filter(t => t.symbol?.toUpperCase() !== 'HEX');
            tokens.unshift(hexData.eHEX);
        } else if (chain.id === 'pulsechain' && hexData.pHEX) {
            tokens = tokens.filter(t => t.symbol?.toUpperCase() !== 'HEX');
            tokens.unshift(hexData.pHEX);
        }

        return { ...chain, tokens };
    });

    // 6. Calculate Dominance
    btcData.dominance = (btcData.marketCap / totalVal) * 100;
    chainsWithTokens.forEach(c => {
        c.dominance = (c.tvl / totalVal) * 100;
    });

    const galaxyData: GalaxyData = {
        btc: btcData,
        chains: chainsWithTokens,
        lastUpdated: new Date(),
        totalMarketCap: totalVal,
        metric: weightMode,
    };

    // Type is already validated by TypeScript, no runtime assertion needed
    console.log(`[API] Successfully fetched galaxy data with ${galaxyData.chains.length} chains`);

    return galaxyData;
}

// ===== API ROUTE HANDLER =====
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const weightMode = (searchParams.get('mode') || 'MarketCap') as WeightMode;
    const cacheKey = `galaxy-${weightMode}`;

    try {
        // Check cache first
        const cached = galaxyCache.get(cacheKey);

        if (cached && isCacheFresh(cached)) {
            // Fresh cache - return immediately
            console.log(`[API] Returning fresh cached data (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
            return NextResponse.json({
                success: true,
                data: cached.data,
                source: 'cache',
                cacheAge: Date.now() - cached.timestamp,
                cacheTTL: CACHE_TTL_MS,
            });
        }

        // Cache is stale or missing - need to fetch fresh data
        // Use lock to prevent multiple simultaneous API calls
        if (!fetchInProgress) {
            fetchInProgress = fetchGalaxyDataFromAPIs(weightMode)
                .finally(() => { fetchInProgress = null; });
        }

        try {
            const freshData = await fetchInProgress;
            
            // Update cache
            galaxyCache.set(cacheKey, {
                data: freshData,
                timestamp: Date.now(),
                source: 'api',
            });

            return NextResponse.json({
                success: true,
                data: freshData,
                source: 'api',
                cacheAge: 0,
                cacheTTL: CACHE_TTL_MS,
            });
        } catch (apiError) {
            console.error('[API] External API error:', apiError);

            // API failed - try to return stale cache
            if (cached && isCacheUsable(cached)) {
                console.log(`[API] Returning stale cache (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
                return NextResponse.json({
                    success: true,
                    data: cached.data,
                    source: 'stale-cache',
                    cacheAge: Date.now() - cached.timestamp,
                    cacheTTL: CACHE_TTL_MS,
                    warning: 'Using stale data due to API error',
                });
            }

            // No usable cache - return error
            throw apiError;
        }
    } catch (error) {
        console.error('[API] Fatal error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            source: 'error',
        }, { status: 500 });
    }
}

// Enable edge caching with Next.js
export const revalidate = 60; // ISR: revalidate every 60 seconds
