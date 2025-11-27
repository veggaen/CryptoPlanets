/**
 * Galaxy Data Loader - Client-Side
 * 
 * This module fetches galaxy data from our INTERNAL API endpoint (/api/galaxy)
 * which handles all caching and external API calls server-side.
 * 
 * IMPORTANT: This file should NEVER call external APIs (CoinGecko, DefiLlama, etc.) directly!
 * All external API calls are centralized in /api/galaxy/route.ts
 */

import { GalaxyData, WeightMode } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";

// ===== CLIENT-SIDE CONFIGURATION =====
const API_TIMEOUT_MS = 15_000;    // Timeout for API requests

// ===== FILTER OPTIONS =====
export interface GalaxyFilterOptions {
    hideStables?: boolean;    // Hide stablecoins (default: true)
    hideWrapped?: boolean;    // Hide wrapped tokens (default: true)
}

// ===== MAIN DATA LOADER =====
export async function loadGalaxyData(
    weightMode: WeightMode, 
    filters: GalaxyFilterOptions = {}
): Promise<GalaxyData> {
    // Apply defaults
    const hideStables = filters.hideStables !== false;
    const hideWrapped = filters.hideWrapped !== false;
    
    debugLog('data', `Loading galaxy data with weight mode: ${weightMode}, hideStables: ${hideStables}, hideWrapped: ${hideWrapped}`);

    try {
        // Determine the API URL (works both client and server side)
        const baseUrl = typeof window !== 'undefined' 
            ? '' // Client-side: relative URL
            : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'); // Server-side
        
        const url = `${baseUrl}/api/galaxy?mode=${encodeURIComponent(weightMode)}&hideStables=${hideStables}&hideWrapped=${hideWrapped}`;
        
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

        debugLog('data', `Loaded ${galaxyData.chains.length} chains`);
        return galaxyData;

    } catch (error) {
        console.error('[DATA ERROR]', error);
        
        // Return fallback data so the app doesn't crash
        return getFallbackData(weightMode);
    }
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
