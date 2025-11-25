// Phase 1: Service Layer - Type Definitions & Function Signatures
// All data fetching from external APIs with free-tier rate limit respect

import type { WeightMode } from "@/config/dataConfig";

// ===== Raw API Response Types =====

/** DefiLlama Chain Response (from /v2/chains) */
export type RawDefiLlamaChain = {
    name: string;
    chainId?: string;
    gecko_id?: string;
    cmcId?: string;
    tvl: number;
    tokenSymbol?: string;
    tvlPrevDay?: number;
    tvlPrevWeek?: number;
    tvlPrevMonth?: number;
};

/** DexScreener Token/Pair Response */
export type RawDexScreenerToken = {
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    baseToken: {
        address: string;
        name: string;
        symbol: string;
    };
    priceUsd: string;
    priceNative?: string;
    volume: {
        h24: number;
        h6?: number;
        h1?: number;
    };
    priceChange: {
        h24: number;
        h6?: number;
        h1?: number;
    };
    liquidity: {
        usd: number;
        base?: number;
        quote?: number;
    };
    fdv?: number;
    marketCap?: number;
};

/** CoinGecko Bitcoin Response (optional) */
export type RawCoinGeckoBitcoin = {
    id: string;
    symbol: string;
    name: string;
    market_data: {
        current_price: {
            usd: number;
        };
        market_cap: {
            usd: number;
        };
        total_volume: {
            usd: number;
        };
        price_change_percentage_24h: number;
        market_cap_percentage?: {
            btc: number;
        };
    };
};

/** Etherscan Token Holder Response (nerd mode) */
export type RawEtherscanTokenStats = {
    status: string;
    message: string;
    result: {
        holders?: string;
        totalSupply?: string;
        decimals?: string;
        name?: string;
        symbol?: string;
    } | string; // Can be array or string depending on endpoint
};

// ===== Processed Data Types =====

/** Processed BTC Global Stats */
export type BTCData = {
    price: number;
    change24h: number;
    dominance: number;
    marketCap: number;
    volume24h: number;
};

/** Ethereum Token On-Chain Stats (from Etherscan) */
export type EthTokenOnChainStats = {
    holders: number;
    totalTransfers: number;
    totalSupply?: string;
    verified: boolean;
    lastUpdated: Date;
};

// ===== Service Function Signatures =====

/**
 * Fetch all chains with TVL from DefiLlama
 * FREE TIER: No API key required, 10 req/s limit
 * 
 * @returns Array of raw DefiLlLama chain objects with TVL data
 * @throws Error if API request fails after retries
 */
export async function fetchChainsFromDefiLlama(): Promise<RawDefiLlamaChain[]> {
    throw new Error("Not implemented: Phase 2");
}

/**
 * Fetch top tokens for a specific chain from DexScreener
 * FREE TIER: No API key required, 5 req/s limit
 * 
 * @param chainId - Chain identifier (e.g., "ethereum", "solana")
 * @param limit - Maximum number of tokens to fetch (default: 20)
 * @returns Array of raw DexScreener token/pair objects
 * @throws Error if API request fails after retries
 */
export async function fetchTokensForChainFromDexScreener(
    chainId: string,
    limit: number
): Promise<RawDexScreenerToken[]> {
    throw new Error("Not implemented: Phase 2");
}

/**
 * Fetch Bitcoin global stats from DefiLlama or CoinGecko
 * Uses DefiLlama by default (100% free)
 * Falls back to CoinGecko if enabled via COINGECKO_API_KEY in .env
 * 
 * @returns Processed BTC data with price, dominance, market cap
 * @throws Error if both providers fail
 */
export async function fetchBTCStatsFromDefiLlamaOrCoinGecko(): Promise<BTCData> {
    throw new Error("Not implemented: Phase 2");
}

/**
 * Fetch on-chain stats for an Ethereum token from Etherscan
 * REQUIRES: ETHERSCAN_API_KEY in .env (free tier: 5 req/s, 100k/day)
 * 
 * CRITICAL: Only call this on-demand when user opens token detail panel
 * NEVER call this in physics loops or main galaxy rendering
 * 
 * @param tokenAddress - Ethereum ERC-20 token contract address
 * @returns On-chain statistics (holders, transfers, supply, etc.)
 * @throws Error if API key missing or request fails
 */
export async function fetchEthTokenOnChainStatsFromEtherscan(
    tokenAddress: string
): Promise<EthTokenOnChainStats> {
    throw new Error("Not implemented: Phase 2");
}

/**
 * HIGH-LEVEL ORCHESTRATOR
 * Load complete galaxy data from all sources
 * Respects rate limits via caching and batched requests
 * 
 * Flow:
 * 1. Fetch BTC stats (cached for 30s)
 * 2. Fetch top N chains from DefiLlama (cached for 1min)
 * 3. For each chain, fetch top M tokens from DexScreener (cached for 2min)
 * 4. Transform raw data into GalaxyData structure
 * 5. Calculate weights based on weightMode
 * 
 * @param weightMode - Metric to use for planet sizing/ordering
 * @returns Complete GalaxyData ready for physics simulation
 * @throws Error with fallback to mock data if all providers fail
 */
export async function loadGalaxyData(weightMode: WeightMode): Promise<import("@/types/galaxy").GalaxyData> {
    throw new Error("Not implemented: Phase 2");
}

// ===== Helper Types for Caching =====

export type CacheEntry<T> = {
    data: T;
    timestamp: number;
    expiresAt: number;
};

export type ApiCache = {
    btc?: CacheEntry<BTCData>;
    chains?: CacheEntry<RawDefiLlamaChain[]>;
    tokens?: Map<string, CacheEntry<RawDexScreenerToken[]>>;
    ethStats?: Map<string, CacheEntry<EthTokenOnChainStats>>;
};
