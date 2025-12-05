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

// ===== FILTER OPTIONS TYPE =====
interface FilterOptions {
    hideStables: boolean;
    hideWrapped: boolean;
}

// ===== CORE DATA FETCHING (calls external APIs) =====
async function fetchGalaxyDataFromAPIs(weightMode: WeightMode, filters: FilterOptions): Promise<GalaxyData> {
    // Import services dynamically to avoid circular dependencies
    const { fetchChainsTVL } = await import('@/services/defiLlama');
    const { fetchHEXData, fetchDexScreenerTokensByAddress } = await import('@/services/dexScreener');
    const { fetchBTCStats, fetchSpecificTokens, fetchCoinsPrices, fetchCoinIcons, fetchCoinMarketCaps } = await import('@/services/coinGecko');
    const { getPulseChainData } = await import('@/services/pulseChain');
    const { dataConfig, CHAIN_TOKENS, DEXSCREENER_TOKENS, STABLECOIN_SYMBOLS, WRAPPED_PATTERNS, CHAIN_NATIVE_SYMBOLS, DEFAULT_FILTERS } = await import('@/config/dataConfig');

    // Helper functions (respect filter settings)
    const isStable = (symbol: string): boolean => STABLECOIN_SYMBOLS.has(symbol.toUpperCase());
    const isWrapped = (symbol: string): boolean => {
        const upperSymbol = symbol.toUpperCase();
        // Check exceptions first (always show these liquid staking tokens)
        if (DEFAULT_FILTERS.wrappedExceptions.includes(upperSymbol)) return false;
        return WRAPPED_PATTERNS.has(upperSymbol);
    };
    const isChainNative = (symbol: string): boolean => CHAIN_NATIVE_SYMBOLS.has(symbol.toUpperCase());

    const calculateWeight = (chain: ChainData, mode: WeightMode): number => {
        switch (mode) {
            case 'TVL': return chain.tvl;
            case 'MarketCap': return chain.marketCap || chain.tvl; // Use marketCap if available, fallback to TVL
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

    // 3. Fetch Prices, Market Caps, and Icons (Batch - single API call for all chains)
    const geckoIds = weightedChains
        .map(c => c.geckoId)
        .filter((id): id is string => id !== undefined && id !== null);

    console.log(`[API] Fetching prices/icons/marketcaps for ${geckoIds.length} chains in single batch`);
    const [chainPrices, chainIcons, chainMarketCaps] = await Promise.all([
        fetchCoinsPrices(geckoIds),
        fetchCoinIcons(geckoIds),
        fetchCoinMarketCaps(geckoIds)
    ]);

    // Apply chain prices, icons, and MARKET CAPS
    weightedChains.forEach(chain => {
        if (chain.geckoId) {
            if (chainPrices[chain.geckoId]) chain.price = chainPrices[chain.geckoId];
            if (chainIcons[chain.geckoId]) chain.icon = chainIcons[chain.geckoId];
            if (chainMarketCaps[chain.geckoId]) chain.marketCap = chainMarketCaps[chain.geckoId];
        }
    });
    
    // RECALCULATE weights now that we have market caps
    // This ensures MarketCap mode uses actual market caps, not just TVL
    weightedChains.forEach(chain => {
        chain.weight = calculateWeight(chain, weightMode);
    });
    // Re-sort after recalculation
    weightedChains.sort((a, b) => b.weight - a.weight);

    // Calculate total value based on mode
    // For MarketCap mode, use actual market caps; for TVL mode, use TVL
    const totalVal = weightMode === 'MarketCap' 
        ? btcData.marketCap + weightedChains.reduce((sum, c) => sum + (c.marketCap || c.tvl), 0)
        : btcData.marketCap + allChains.reduce((sum, c) => sum + c.tvl, 0);

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
        
        // Log which tokens were not found
        const foundIds = new Set(allTokens.map(t => t.address));
        const missingIds = uniqueTokenIds.filter(id => !foundIds.has(id));
        if (missingIds.length > 0) {
            console.log(`[API] ⚠️ Missing tokens (wrong CoinGecko ID?): ${missingIds.join(', ')}`);
        }
    }

    // Create lookup map for tokens
    const tokenLookup = new Map(allTokens.map(t => [t.address, t])); // address = coingecko ID

    // 5. Pre-fetch DexScreener tokens for all chains that need them
    const dexTokensMap: Map<string, any[]> = new Map();
    const dexChainIdMap: Record<string, string> = {
        'pulsechain': 'pulsechain',
        'fantom': 'fantom',
        'ethereum': 'ethereum',
        'bsc': 'bsc',
        'arbitrum': 'arbitrum',
        'polygon': 'polygon',
        'base': 'base',
        'avalanche': 'avalanche',
        'solana': 'solana',
        'sui': 'sui',
        'ton': 'ton',
    };

    // Fetch DexScreener tokens in parallel for all chains that need them
    const dexFetchPromises = weightedChains
        .filter(chain => DEXSCREENER_TOKENS[chain.id] && DEXSCREENER_TOKENS[chain.id].length > 0)
        .map(async (chain) => {
            const dexChainId = dexChainIdMap[chain.id] || chain.id;
            const dexTokenConfigs = DEXSCREENER_TOKENS[chain.id];
            try {
                const tokens = await fetchDexScreenerTokensByAddress(dexChainId, dexTokenConfigs);
                return { chainId: chain.id, tokens };
            } catch (error) {
                console.warn(`[API] Failed to fetch DexScreener tokens for ${chain.id}:`, error);
                return { chainId: chain.id, tokens: [] };
            }
        });

    const dexResults = await Promise.all(dexFetchPromises);
    for (const result of dexResults) {
        dexTokensMap.set(result.chainId, result.tokens);
    }

    // 6. Assign tokens to chains
    const chainsWithTokens = weightedChains.map(chain => {
        const chainTokenIds = chainTokenMap.get(chain.id) || [];
        
        let tokens = chainTokenIds
            .map(id => tokenLookup.get(id))
            .filter((t): t is any => t !== undefined);

        // Apply safety filters based on filter options
        tokens = tokens.filter(t => {
            const symbol = (t.symbol || "").toUpperCase();
            if (!symbol) return false;
            // Always filter chain natives (they are planets, not moons)
            if (isChainNative(symbol)) return false;
            // Optionally filter stablecoins
            if (filters.hideStables && isStable(symbol)) return false;
            // Optionally filter wrapped tokens
            if (filters.hideWrapped && isWrapped(symbol)) return false;
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

        // Add pre-fetched DexScreener tokens for this chain
        const dexTokens = dexTokensMap.get(chain.id) || [];
        if (dexTokens.length > 0) {
            // Filter DexScreener tokens by the same rules
            const filteredDexTokens = dexTokens.filter(t => {
                const symbol = (t.symbol || "").toUpperCase();
                if (!symbol) return false;
                if (isChainNative(symbol)) return false;
                if (filters.hideStables && isStable(symbol)) return false;
                if (filters.hideWrapped && isWrapped(symbol)) return false;
                return true;
            });
            
            // Add DexScreener tokens that aren't already in the list
            const existingSymbols = new Set(tokens.map(t => (t.symbol || '').toUpperCase()));
            for (const dexToken of filteredDexTokens) {
                if (!existingSymbols.has((dexToken.symbol || '').toUpperCase())) {
                    tokens.push(dexToken);
                    existingSymbols.add((dexToken.symbol || '').toUpperCase());
                }
            }
            
            if (filteredDexTokens.length > 0) {
                console.log(`[API] ${chain.id}: Added ${filteredDexTokens.length} DexScreener tokens (${filteredDexTokens.map(t => t.symbol).join(', ')})`);
            }
        }

        // Log token count per chain
        console.log(`[API] ${chain.id}: ${tokens.length} tokens (${tokens.map(t => t.symbol).join(', ')})`);

        return { ...chain, tokens };
    });

    // 7. Calculate Dominance
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
    
    // Filter params (default: hide stablecoins and wrapped tokens)
    const hideStables = searchParams.get('hideStables') !== 'false';
    const hideWrapped = searchParams.get('hideWrapped') !== 'false';
    
    // Create cache key that includes filter state
    const cacheKey = `galaxy-${weightMode}-stables:${hideStables}-wrapped:${hideWrapped}`;
    const filters: FilterOptions = { hideStables, hideWrapped };

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
            fetchInProgress = fetchGalaxyDataFromAPIs(weightMode, filters)
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
