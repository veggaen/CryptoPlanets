// Phase 1: Configuration - Data & API Settings  
// 100% Free-tier friendly with optional paid features

// ===== CURATED CHAIN TOKENS =====
// These are the canonical HOME chains for each token
// CoinGecko IDs - tokens only appear as moons on their native chain
export const CHAIN_TOKENS: Record<string, string[]> = {
    // Ethereum - ETH-native DeFi and meme tokens
    ethereum: [
        "hex",              // HEX - launched on ETH (CoinGecko has broken MC, we use DexScreener)
        "uniswap",          // UNI
        "chainlink",        // LINK
        "aave",             // AAVE
        "lido-dao",         // LDO
        "maker",            // MKR
        "shiba-inu",        // SHIB
        "pepe",             // PEPE
        "the-graph",        // GRT
        "ens",              // ENS
        "pendle",           // PENDLE
        "curve-dao-token",  // CRV
        "1inch",            // 1INCH
        "synthetix-network-token", // SNX
        "compound-governance-token", // COMP
    ],
    
    // Solana - SPL tokens native to Solana
    solana: [
        "jupiter-exchange-solana", // JUP
        "raydium",          // RAY
        "bonk",             // BONK
        "dogwifcoin",       // WIF
        "jito-governance-token", // JTO
        "pyth-network",     // PYTH
        "render-token",     // RNDR (was ETH, migrated to SOL)
        "helium",           // HNT
        "marinade",         // MNDE
        "orca",             // ORCA
        "official-trump",   // TRUMP
        "book-of-meme",     // BOME
        "popcat",           // POPCAT
        "cat-in-a-dogs-world", // MEW
    ],
    
    // BNB Chain (BSC) - BEP-20 tokens native to BSC
    bnb: [
        "pancakeswap-token", // CAKE
        "trust-wallet-token", // TWT
        "venus",            // XVS
        "baby-doge-coin",   // BABYDOGE
        "safemoon-2",       // SAFEMOON
        "floki",            // FLOKI
        "bake",             // BAKE
        "alpaca-finance",   // ALPACA
        "biswap",           // BSW
        "coin98",           // C98
    ],
    
    // Polygon - MATIC ecosystem tokens
    polygon: [
        "quickswap",        // QUICK
        "gains-network",    // GNS
        "polymath",         // POLY
        "balancer",         // BAL (multi-chain but strong on Polygon)
        "ocean-protocol",   // OCEAN
        "tellor",           // TRB
        "mask-network",     // MASK
        "sushi",            // SUSHI (multi-chain)
    ],
    
    // Avalanche - AVAX ecosystem
    avalanche: [
        "joe",              // JOE (Trader Joe)
        "benqi",            // QI
        "pangolin",         // PNG
        "platypus-finance", // PTP
        "vector-finance",   // VTX
        "gmx",              // GMX (also on Arbitrum)
    ],
    
    // Arbitrum - ARB ecosystem
    arbitrum: [
        "arbitrum",         // ARB (the chain token itself, shown as moon?)
        "gmx",              // GMX
        "magic",            // MAGIC (Treasure DAO)
        "radiant-capital",  // RDNT
        "camelot-token",    // GRAIL
        "pendle",           // PENDLE (multi-chain, big on ARB)
        "dopex",            // DPX
    ],
    
    // Base - Coinbase L2
    base: [
        "aerodrome-finance", // AERO
        "degen-base",       // DEGEN
        "brett",            // BRETT (Base meme)
        "toshi-base",       // TOSHI
        "friend-tech",      // FRIEND
        "virtual-protocol", // VIRTUAL
        "extra-finance",    // EXTRA
    ],
    
    // Optimism - OP ecosystem
    optimism: [
        "optimism",         // OP
        "velodrome-finance", // VELO
        "synthetix-network-token", // SNX (big on OP)
        "thales",           // THALES
        "extra-finance",    // EXTRA
    ],
    
    // PulseChain - Richard Heart ecosystem
    pulsechain: [
        "hex-pulsechain",   // pHEX (separate from eHEX!)
        "pulsex",           // PLSX
        "hedron",           // HDRN
        "incentive",        // INC
        "phiat",            // PHIAT
        "liquid-loans",     // LOAN
        "pulsedogecoin",    // PLSD
    ],
    
    // Fantom - FTM ecosystem
    fantom: [
        "spookyswap",       // BOO
        "spiritswap",       // SPIRIT
        "beefy-finance",    // BIFI
        "geist-finance",    // GEIST
        "tomb",             // TOMB
        "fantom-usd",       // FUSD (exception: native stable)
    ],
    
    // Cronos - CRO ecosystem  
    cronos: [
        "vvs-finance",      // VVS
        "ferro",            // FER
        "tectonic",         // TONIC
        "single-finance",   // SINGLE
    ],
};

// Symbols that should NEVER be moons (they are planets/L1s)
export const CHAIN_NATIVE_SYMBOLS = new Set([
    "BTC", "ETH", "BNB", "SOL", "AVAX", "MATIC", "POL", "FTM", 
    "CRO", "PLS", "TRX", "XRP", "ADA", "DOT", "ATOM", "NEAR",
    "APT", "SUI", "TON", "XLM", "ALGO", "HBAR", "ICP", "FIL",
    "ETC", "BCH", "LTC", "XMR", "DOGE"
]);

// Stablecoin symbols - filter these out
export const STABLECOIN_SYMBOLS = new Set([
    "USDT", "USDC", "DAI", "TUSD", "FRAX", "LUSD", "USDD", "USDN", 
    "GUSD", "BUSD", "USDS", "USDL", "USDP", "PYUSD", "FDUSD", "CRVUSD",
    "SUSD", "MIM", "DOLA", "EUSD", "CUSD", "UST", "HUSD", "SUSDE", "USDE",
    "RAI", "USDJ", "FLEXUSD", "EURS", "EURT", "FUSD"
]);

// Wrapped/derivative token patterns - filter these out
export const WRAPPED_PATTERNS = new Set([
    "WETH", "WBTC", "WBNB", "WMATIC", "WAVAX", "WFTM", "WSOL", "WPLS",
    "STETH", "WSTETH", "CBETH", "RETH", "FRXETH", "SFRXETH", "METH", "SWETH",
    "WBETH", "ANKRBNB", "SBNB", "BETH", "WEETH", "EZETH", "RSETH",
    "BTCB", "RENBTC", "SBTC", "TBTC", "HBTC", "CBBTC", "SOLVBTC",
    "MSOL", "JITOSOL", "BSOL", // Solana liquid staking
]);

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
    // NOTE: CoinGecko IDs - eHEX (Ethereum) = "hex", pHEX (PulseChain) = "hex-pulsechain"
    priorityTokens: {
        ethereum: ["uniswap", "chainlink", "shiba-inu", "pepe", "hex", "aave", "lido-dao", "matic-network", "the-graph", "maker"],
        solana: ["jupiter-exchange-solana", "raydium", "bonk", "render-token", "helium", "pyth-network", "jito-governance-token"],
        pulsechain: ["pulsex", "hex-pulsechain", "incentive", "hedron", "phiat", "plsx"],
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
