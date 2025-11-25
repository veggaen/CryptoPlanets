// Phase 1: Configuration - Data & API Settings
// 100% Free-tier friendly with optional paid features

export const dataConfig = {
    // ===== Weight Modes =====
    defaultWeightMode: "TVL" as const,
    supportedWeightModes: [
        "TVL",           // Total Value Locked
        "MarketCap",     // Market Capitalization
        "Volume24h",     // 24-hour trading volume
        "Change24h",     // 24-hour price change percentage
        "Change7d",      // 7-day price change percentage
        "Change30d",     // 30-day price change percentage
    ] as const,

    // ===== Provider Assignments =====
    // Which API provides what data
    providers: {
        chains: "defillama" as const,      // Chain TVL & rankings (planets)
        tokens: "dexscreener" as const,    // Token prices & DEX data (moons)
        btcGlobal: "defillama" as const,   // BTC global stats (or "coingecko" if enabled)
        onChainEth: "etherscan" as const,  // Ethereum-only nerd mode on-chain stats
    },

    // ===== DefiLlama (Primary - 100% Free) =====
    defiLlama: {
        baseURL: "https://api.llama.fi",
        endpoints: {
            chains: "/v2/chains",              // All chains with TVL
            protocols: "/protocols",
            historicalTVL: "/v2/historicalChainTvl",
        },
        rateLimit: {
            requestsPerSecond: 10,             // Very generous free tier
            burstLimit: 100,
        },
    },

    // ===== DexScreener (Primary - 100% Free) =====
    dexScreener: {
        baseURL: "https://api.dexscreener.com",
        endpoints: {
            search: "/latest/dex/search",
            tokens: "/latest/dex/tokens",
            pairs: "/latest/dex/pairs",
        },
        rateLimit: {
            requestsPerSecond: 5,              // Free tier limit
            burstLimit: 20,
        },
    },

    // ===== GeckoTerminal (Alternative - 100% Free) =====
    // Can be used as fallback for DexScreener
    geckoTerminal: {
        baseURL: "https://api.geckoterminal.com/api/v2",
        endpoints: {
            networks: "/networks",
            trending: "/networks/trending_pools",
            tokens: "/networks/{network}/tokens",
        },
        enabled: false,                      // Disabled by default, use as fallback
    },

    // ===== CoinGecko (OPTIONAL - Requires API Key) =====
    // Only for BTC global stats + historical charts (future feature)
    coinGecko: {
        baseURL: "https://api.coingecko.com/api/v3",
        apiKeyEnvVar: "COINGECKO_API_KEY",   // Optional: read from .env
        endpoints: {
            bitcoin: "/coins/bitcoin",
            globalData: "/global",
            markets: "/coins/markets",
        },
        enabledByDefault: false,             // App MUST work without CoinGecko
        rateLimit: {
            requestsPerMinute: 30,             // Demo API free tier
            requestsPerMonth: 10000,
        },
    },

    // ===== Etherscan (OPTIONAL - For Ethereum Nerd Mode) =====
    // Only called on-demand for token detail panels, NOT in main loop
    etherscan: {
        baseURL: "https://api.etherscan.io/api",
        apiKeyEnvVar: "ETHERSCAN_API_KEY",   // Required: get free key from etherscan.io
        endpoints: {
            tokenInfo: "?module=token&action=tokeninfo",
            tokenHolders: "?module=token&action=tokenholderlist",
            tokenStats: "?module=stats&action=tokensupply",
        },
        rateLimit: {
            requestsPerSecond: 5,              // Free tier: 5/sec, 100k/day
            requestsPerDay: 100000,
        },
        onlyForEthereum: true,               // CRITICAL: Only use for Ethereum tokens
    },

    // ===== Refresh Intervals (Respect Rate Limits) =====
    // These prevent excessive API calls
    refreshIntervals: {
        btc: 30000,          // 30s - BTC stats refresh
        chains: 60000,       // 1min - Chain TVL refresh
        tokens: 120000,      // 2min - Token prices refresh
        globalStats: 300000, // 5min - Global market stats
    },

    // ===== Chain ID Mapping =====
    // Maps DefiLlama chain names → DexScreener/Etherscan chain IDs
    chainIdMap: {
        "Ethereum": "ethereum",
        "Solana": "solana",
        "BSC": "bsc",
        "Polygon": "polygon",
        "Arbitrum": "arbitrum",
        "Avalanche": "avalanche",
        "Optimism": "optimism",
        "Base": "base",
        "Fantom": "fantom",
        "Cronos": "cronos",
        "Pulsechain": "pulsechain",
    } as const,

    // ===== Data Limits =====
    maxChains: 10,                   // Max chains to fetch/display
    tokensPerChain: 20,              // Max tokens per chain
    minTVLThreshold: 1000000,        // Min TVL to include chain ($1M)
    minTokenLiquidity: 50000,        // Min liquidity to include token ($50k)

    // ===== Caching =====
    cache: {
        enabled: true,                 // Enable in-memory caching
        ttl: {
            btc: 30000,                  // 30s cache for BTC
            chains: 60000,               // 1min cache for chains
            tokens: 120000,              // 2min cache for tokens
            onChainStats: 600000,        // 10min cache for Etherscan data
        },
    },

    // ===== Fallback & Mock Data =====
    useMockDataOnError: true,        // Fall back to mock data if APIs fail
    mockDataDelay: 500,              // Simulated delay for mock data (ms)

    // ===== Rate Limiting =====
    apiCallDelay: 200,               // Min delay between API calls (ms)
    maxRetries: 3,                   // Max retry attempts on failure
    retryDelay: 1000,                // Delay between retries (ms)
    retryBackoff: 2,                 // Exponential backoff multiplier
} as const;

// Export types
export type WeightMode = typeof dataConfig.supportedWeightModes[number];
export type ChainId = keyof typeof dataConfig.chainIdMap;
export type DataProvider = "defillama" | "dexscreener" | "geckoterminal" | "coingecko" | "etherscan";
export type DataConfig = typeof dataConfig;
