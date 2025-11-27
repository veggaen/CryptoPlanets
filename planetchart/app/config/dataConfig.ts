// Phase 1: Configuration - Data & API Settings  
// 100% Free-tier friendly with optional paid features

export const dataConfig = {
    // ===== Weight Modes =====
    defaultWeightMode: "MarketCap" as const,
    supportedWeightModes: [
        "TVL",           // Total Value Locked
        "MarketCap",     // Market Capitalization
        "Volume24h",     // 24-hour trading volume
        "Change24h",     // 24-hour price change percentage
        "Change7d",      // 7-day price change percentage
        "Change30d",     // 30-day price change percentage
    ] as const,

    // ===== Priority Tokens (Moons) =====
    // Specific top tokens to display for major chains
    priorityTokens: {
        ethereum: ["tether", "usd-coin", "uniswap", "chainlink", "shiba-inu", "wrapped-bitcoin", "pepe"],
        solana: ["usd-coin", "jupiter-exchange-solana", "raydium", "bonk", "serum", "render-token"],
        pulsechain: ["pulsex", "dai", "weth", "hex", "incentive", "shiba-inu", "pepe"], // Common bridged/native
    } as Record<string, string[]>,

    // ===== Chain → CoinGecko Ecosystem Category Mapping =====
    // Maps internal chain IDs to CoinGecko's ecosystem categories
    // Used to fetch REAL ecosystem tokens for each chain (moons)
    chainEcosystemCategory: {
        ethereum: "ethereum-ecosystem",
        solana: "solana-ecosystem",
        bnb: "binance-smart-chain",
        polygon: "polygon-ecosystem",
        avalanche: "avalanche-ecosystem",
        arbitrum: "arbitrum-ecosystem",
        optimism: "optimism-ecosystem",
        base: "base-ecosystem",
    } as Record<string, string>,

    // ===== Provider Assignments =====
    // Which API provides what data
    providers: {
        chains: "defillama" as const,      // Chain TVL & rankings (planets)
        tokens: "coingecko" as const,      // Ecosystem tokens via CoinGecko categories
        btcGlobal: "coingecko" as const,   // BTC global stats
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

    // ===== DexScreener (Fallback - 100% Free) =====
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

    // ===== CoinGecko (Primary for Tokens - Requires API Key) =====
    // Used for ecosystem tokens (moons) + BTC global stats
    coinGecko: {
        baseURL: "https://api.coingecko.com/api/v3",
        apiKeyEnvVar: "COINGECKO_API_KEY",   // Optional: read from .env
        endpoints: {
            bitcoin: "/coins/bitcoin",
            globalData: "/global",
            markets: "/coins/markets",
            ecosystemTokens: "/coins/markets", // Fetch ecosystem tokens by category
        },
        enabledByDefault: true,              // Enable for ecosystem token fetching
        rateLimit: {
            requestsPerMinute: 30,           // Demo API free tier
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

    // ===== Chain ID Mapping =====
    // Maps DefiLlama chain names → internal/DexScreener chain IDs
    chainIdMap: {
        "Ethereum": "ethereum",
        "Solana": "solana",
        "BSC": "bnb",
        "BNB Chain": "bnb",
        "Polygon": "polygon",
        "Arbitrum": "arbitrum",
        "Avalanche": "avalanche",
        "Optimism": "optimism",
        "Base": "base",
        "Fantom": "fantom",
        "Cronos": "cronos",
        "Pulsechain": "pulse chain",
    } as const,

    // ===== Data Limits =====
    maxChains: 12,                           // Display up to 12 chains (planets)
    tokensPerChain: 24,                     // Tokens (moons) per chain - matches ring system
    minTVLThreshold: 1000000,        // Min TVL to include chain ($1M)
    minTokenLiquidity: 50000,        // Min liquidity to include token ($50k)

    // ===== Caching =====
    cache: {
        enabled: true,                 // Enable in-memory caching
        ttl: {
            btc: 300000,                 // 5 minutes for BTC
            chains: 600000,              // 10 minutes for chains
            tokens: 600000,              // 10 minutes for tokens (CoinGecko rate limit)
            onChainStats: 600000,        // 10min cache for Etherscan data
        },
        rateLimitCooldown: 60000,      // 1 minute cooldown after 429 rate limit
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
export type DataProvider = "defillama" | "dexscreener" | "coingecko" | "etherscan";
export type DataConfig = typeof dataConfig;
