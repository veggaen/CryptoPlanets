/**
 * Galaxy Data Loader - Client-Side
 * 
 * This module fetches galaxy data from our INTERNAL API endpoint (/api/galaxy)
 * which handles all caching and external API calls server-side.
 * 
 * IMPORTANT: This file should NEVER call external APIs (CoinGecko, DefiLlama, etc.) directly!
 * All external API calls are centralized in /api/galaxy/route.ts
 */

import { GalaxyData, WeightMode, TokenData, ChainData } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { STABLECOIN_SYMBOLS, WRAPPED_PATTERNS } from "@/config/dataConfig";
import type { PrimaryProvider } from "@/types/providers";

export type VolumeSource = 'dex' | 'spot';

// ===== CLIENT-SIDE CONFIGURATION =====
const API_TIMEOUT_MS = 15_000;    // Timeout for API requests

// ===== FILTER OPTIONS =====
export interface GalaxyFilterOptions {
    hideStables?: boolean;    // Hide stablecoins (default: true)
    hideWrapped?: boolean;    // Hide wrapped tokens (default: true)
}

// ===== CLIENT-SIDE CACHE =====
// Cache unfiltered data to allow instant filter switching
interface CachedGalaxyData {
    data: GalaxyData;
    timestamp: number;
}
const dataCache: Map<string, CachedGalaxyData> = new Map();
const CACHE_TTL_MS = 60_000; // 1 minute client-side cache

function getCacheKey(weightMode: WeightMode, volumeSource?: VolumeSource): string {
    // Back-compat helper (no provider dimension). Prefer the overload below.
    if (weightMode !== 'Volume24h') return weightMode;
    const normalized = volumeSource === 'spot' ? 'spot' : 'dex';
    return `${weightMode}:${normalized}`;
}

function getCacheKeyWithProvider(weightMode: WeightMode, volumeSource: VolumeSource | undefined, primaryProvider: PrimaryProvider): string {
    const provider = primaryProvider || 'auto';
    if (weightMode !== 'Volume24h') return `${weightMode}:${provider}`;
    const normalized = volumeSource === 'spot' ? 'spot' : 'dex';
    return `${weightMode}:${normalized}:${provider}`;
}

// ===== TOKEN FILTER FUNCTIONS =====
function isStablecoin(token: TokenData): boolean {
    return STABLECOIN_SYMBOLS.has(token.symbol.toUpperCase());
}

function isWrappedToken(token: TokenData): boolean {
    const upper = token.symbol.toUpperCase();
    return WRAPPED_PATTERNS.has(upper);
}

function filterTokens(tokens: TokenData[], hideStables: boolean, hideWrapped: boolean): TokenData[] {
    return tokens.filter(token => {
        if (hideStables && isStablecoin(token)) return false;
        if (hideWrapped && isWrappedToken(token)) return false;
        return true;
    });
}

function filterChains(chains: ChainData[], hideStables: boolean, hideWrapped: boolean): ChainData[] {
    return chains.map(chain => ({
        ...chain,
        tokens: filterTokens(chain.tokens, hideStables, hideWrapped)
    }));
}

// ===== MAIN DATA LOADER =====
export async function loadGalaxyData(
    weightMode: WeightMode, 
    filters: GalaxyFilterOptions = {},
    options: { volumeSource?: VolumeSource; primaryProvider?: PrimaryProvider } = {}
): Promise<GalaxyData> {
    // Apply defaults
    const hideStables = filters.hideStables !== false;
    const hideWrapped = filters.hideWrapped !== false;
    
    debugLog('data', `Loading galaxy data with weight mode: ${weightMode}, hideStables: ${hideStables}, hideWrapped: ${hideWrapped}`);

    try {
        // Check client-side cache first (for instant filter switching)
        const primaryProvider: PrimaryProvider = options.primaryProvider ?? 'auto';
        const cacheKey = getCacheKeyWithProvider(weightMode, options.volumeSource, primaryProvider);
        const cached = dataCache.get(cacheKey);
        const now = Date.now();
        
        let unfilteredData: GalaxyData;
        
        if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
            debugLog('data', 'Using client-side cached data for instant filter');
            unfilteredData = cached.data;
        } else {
            // Fetch UNFILTERED data from API (server will still filter but we also cache locally)
            unfilteredData = await fetchFromAPI(weightMode, false, false, options.volumeSource, primaryProvider);
            
            // Cache the unfiltered data for instant filter switching
            dataCache.set(cacheKey, { data: unfilteredData, timestamp: now });
        }
        
        // Apply client-side filtering (instant, no network)
        const filteredData: GalaxyData = {
            ...unfilteredData,
            chains: filterChains(unfilteredData.chains, hideStables, hideWrapped)
        };

        debugLog('data', `Loaded ${filteredData.chains.length} chains after filtering`);
        return filteredData;

    } catch (error) {
        console.error('[DATA ERROR]', error);
        
        // Return fallback data so the app doesn't crash
        return getFallbackData(weightMode);
    }
}

// ===== PREFETCH ALL WEIGHT MODES =====
// Call this on initial load to prefetch data for all modes
export async function prefetchAllModes(): Promise<void> {
    const modes: WeightMode[] = ['MarketCap', 'TVL', 'Volume24h', 'Change24h'];
    
    debugLog('data', 'Prefetching all weight modes in background...');
    
    // Fetch in parallel but don't block
    await Promise.allSettled(
        modes.map(mode => 
            fetchFromAPI(mode, false, false, mode === 'Volume24h' ? 'dex' : undefined, 'auto')
                .then(data => {
                    dataCache.set(getCacheKeyWithProvider(mode, mode === 'Volume24h' ? 'dex' : undefined, 'auto'), { data, timestamp: Date.now() });
                    debugLog('data', `Prefetched ${mode} mode`);
                })
                .catch(err => {
                    debugLog('data', `Failed to prefetch ${mode}: ${err.message}`);
                })
        )
    );
}

// ===== FETCH FROM API =====
async function fetchFromAPI(
    weightMode: WeightMode,
    hideStables: boolean,
    hideWrapped: boolean,
    volumeSource?: VolumeSource,
    primaryProvider: PrimaryProvider = 'auto'
): Promise<GalaxyData> {
    // Always use an absolute URL so Node/Undici fetch works (Vitest/JSDOM included).
    const origin = (typeof window !== 'undefined' && typeof window.location?.origin === 'string')
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');

    // Always fetch unfiltered data so we can filter client-side
    const params = new URLSearchParams({
        mode: weightMode,
        hideStables: 'false',
        hideWrapped: 'false',
    });

    params.set('primaryProvider', primaryProvider);

    if (weightMode === 'Volume24h' && (volumeSource === 'dex' || volumeSource === 'spot')) {
        params.set('volumeSource', volumeSource);
    }

    const path = `/api/galaxy?${params.toString()}`;
    const url = new URL(path, origin).toString();
    
    debugLog('data', `Fetching from internal API: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
        signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.error || 'Unknown API error');
    }

    // Log cache status for debugging
    if (result.source === 'cache') {
        debugLog('data', `Using cached data (age: ${Math.round(result.cacheAge / 1000)}s)`);
    } else if (result.source === 'stale-cache') {
        debugLog('data', `Using STALE cached data (age: ${Math.round(result.cacheAge / 1000)}s) - API had error`);
        console.warn('[DATA] Using stale cache:', result.warning);
    } else {
        debugLog('data', 'Got fresh data from API');
    }

    // Convert lastUpdated string back to Date
    const galaxyData: GalaxyData = {
        ...result.data,
        lastUpdated: new Date(result.data.lastUpdated),
    };

    return galaxyData;
}

// ===== FALLBACK DATA =====
function getFallbackData(weightMode: WeightMode): GalaxyData {
    console.warn('[DATA] Using fallback data - API unavailable');
    return {
        btc: { 
            price: 91000, 
            change24h: 0, 
            dominance: 50, 
            marketCap: 1800000000000, 
            volume24h: 30000000000 
        },
        chains: [],
        lastUpdated: new Date(),
        totalMarketCap: 3500000000000,
        metric: weightMode,
    };
}
