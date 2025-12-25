// Phase 1: Configuration - Data & API Settings  
// 100% Free-tier friendly with optional paid features

// ===== CURATED CHAIN TOKENS =====
// These are the canonical HOME chains for each token
// CoinGecko IDs - tokens only appear as moons on their native chain
// Priority order: most important tokens first (HEX always first for ETH/PLS)
export const CHAIN_TOKENS: Record<string, string[]> = {
    // Bitcoin - Ordinals ecosystem (BRC-20)
    bitcoin: [
        "ordi",             // ORDI - first BRC-20
        "sats-ordinals",    // SATS - satoshi fractions
    ],
    
    // Ethereum - ETH-native DeFi, Memes, and Core tokens
    ethereum: [
        "hex",              // HEX - launched on ETH (0x2b591e99afe9f32eaa6214f7b7629768c40eeb39)
        "wise-token11",     // WISE (0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6)
        // Core DeFi
        "uniswap",          // UNI
        "aave",             // AAVE
        "lido-dao",         // LDO
        "maker",            // MKR
        "chainlink",        // LINK
        "frax-share",       // FXS (governance token, not FRAX stablecoin)
        // Meme tokens
        "shiba-inu",        // SHIB
        "pepe",             // PEPE
        "floki",            // FLOKI
        // Other notable ETH tokens
        "decentraland",     // MANA
        "chiliz",           // CHZ
        "gnosis",           // GNO
        "the-graph",        // GRT
        "ethereum-name-service", // ENS
        "pendle",           // PENDLE
        "curve-dao-token",  // CRV
        // Stablecoins & wrapped (toggleable)
        "tether",           // USDT
        "usd-coin",         // USDC
        "dai",              // DAI
        "frax",             // FRAX stablecoin
        "wrapped-bitcoin",  // WBTC
        "weth",             // WETH
    ],
    
    // Solana - SPL tokens native to Solana
    solana: [
        "jupiter-exchange-solana", // JUP
        "jito-staked-sol",  // JitoSOL (liquid staking)
        "bonk",             // BONK
        "dogwifcoin",       // WIF
        "popcat",           // POPCAT
        "raydium",          // RAY
        "jito-governance-token", // JTO
        "pyth-network",     // PYTH
        "render-token",     // RNDR (migrated to SOL)
        "helium",           // HNT
        "marinade",         // MNDE / mSOL
        "orca",             // ORCA
        "official-trump",   // TRUMP
        "book-of-meme",     // BOME
        "cat-in-a-dogs-world", // MEW
        // Stablecoins & wrapped (toggleable)
        "usd-coin",         // USDC (Solana)
        "tether",           // USDT (Solana)
    ],
    
    // BNB Chain (BSC) - BEP-20 tokens
    bnb: [
        "pancakeswap-token", // CAKE
        "trust-wallet-token", // TWT
        "floki",            // FLOKI (multi-chain but big on BSC)
        "baby-doge-coin",   // BABYDOGE
        "venus",            // XVS
        "bakerytoken",      // BAKE (BakerySwap)
        "alpaca-finance",   // ALPACA
        "biswap",           // BSW
        "coin98",           // C98
        // Stablecoins & wrapped (toggleable)
        "binance-usd",      // BUSD
        "tether",           // USDT (BSC)
        "usd-coin",         // USDC (BSC)
        "wbnb",             // WBNB
    ],
    
    // Base - Coinbase L2
    base: [
        "aerodrome-finance", // AERO
        "brett",            // BRETT (Base meme)
        "toshi",            // TOSHI (Base cat meme, rank #297)
        "degen-base",       // DEGEN
        "virtual-protocol", // VIRTUAL
        "extra-finance",    // EXTRA
        // Stablecoins & wrapped (toggleable)
        "usd-coin",         // USDC (Base)
        "dai",              // DAI bridge
        "weth",             // WETH on Base
        "coinbase-wrapped-staked-eth", // cbETH
    ],
    
    // Arbitrum - ARB ecosystem
    arbitrum: [
        "gmx",              // GMX
        "magic",            // MAGIC (Treasure DAO)
        "pendle",           // PENDLE (multi-chain, big on ARB)
        "gains-network",    // GNS
        "radiant-capital",  // RDNT
        "camelot-token",    // GRAIL
        "dopex",            // DPX
        // Stablecoins & wrapped (toggleable)
        "tether",           // USDT (Arbitrum)
        "usd-coin",         // USDC (Arbitrum)
        "dai",              // DAI (Arbitrum)
        "frax",             // FRAX (Arbitrum)
        "wrapped-bitcoin",  // WBTC (Arbitrum)
    ],
    
    // Avalanche - AVAX ecosystem
    avalanche: [
        "joe",              // JOE (Trader Joe)
        "benqi",            // QI
        "pangolin",         // PNG
        "platypus-finance", // PTP
        "vector-finance",   // VTX
        // Stablecoins & wrapped
        "tether",           // USDT (Avalanche)
        "usd-coin",         // USDC (Avalanche)
        "dai",              // DAI (Avalanche)
        "wrapped-bitcoin",  // WBTC (Avalanche)
    ],
    
    // Polygon - POL/MATIC ecosystem
    polygon: [
        "aave",             // AAVE (multi-chain but strong on Polygon)
        "uniswap",          // UNI (multi-chain)
        "the-sandbox",      // SAND
        "gains-network",    // GNS
        "aavegotchi",       // GHST
        "quickswap",        // QUICK
        "balancer",         // BAL
        "sushi",            // SUSHI
        // Stablecoins & wrapped (toggleable)
        "tether",           // USDT (Polygon)
        "usd-coin",         // USDC (Polygon)
        "dai",              // DAI (Polygon)
        "frax",             // FRAX (Polygon)
        "wrapped-bitcoin",  // WBTC (Polygon)
    ],
    
    // PulseChain - Richard Heart ecosystem
    pulsechain: [
        "hex-pulsechain",   // pHEX (separate from eHEX!)
        "pulsex",           // PLSX
        "pulsex-incentive-token", // INC
        "hedron",           // HDRN
        "phiat-protocol",   // PHIAT
        "liquid-loans",     // LOAN
        // Stablecoins & wrapped (bridged)
        "dai",              // DAI bridge
        "usd-coin",         // USDC bridge
        "tether",           // USDT bridge
        // PLSD (PulseDogecoin) not on CoinGecko - needs DexScreener
    ],
    
    // Cronos - CRO ecosystem  
    cronos: [
        "vvs-finance",      // VVS
        "tectonic",         // TONIC
        "ferro",            // FER
        "mmfinance",        // MMF (correct CoinGecko ID)
        // Stablecoins & wrapped
        "tether",           // USDT (Cronos)
        "usd-coin",         // USDC (Cronos)
        "wrapped-bitcoin",  // WBTC (Cronos)
    ],
    
    // Fantom - FTM ecosystem
    fantom: [
        "spookyswap",       // BOO
        "beets",            // BEETS (Beethoven-X)
        "beefy-finance",    // BIFI
        // spiritswap and geist-finance are delisted from CoinGecko
        // Stablecoins & wrapped
        "tether",           // USDT (Fantom)
        "usd-coin",         // USDC (Fantom)
        "dai",              // DAI (Fantom)
        "wrapped-bitcoin",  // WBTC (Fantom)
    ],
    
    // Optimism - OP ecosystem
    optimism: [
        "velodrome-finance", // VELO
        "synthetix-network-token", // SNX (big on OP)
        "thales",           // THALES
        "extra-finance",    // EXTRA
        // Stablecoins & wrapped
        "tether",           // USDT (Optimism)
        "usd-coin",         // USDC (Optimism)
        "dai",              // DAI (Optimism)
        "frax",             // FRAX (Optimism)
    ],
};

// ===== DEXSCREENER TOKENS BY CHAIN =====
// Tokens fetched from DexScreener (not on CoinGecko or need better data)
// Format: { symbol, name, address (contract address) }
export const DEXSCREENER_TOKENS: Record<string, { symbol: string, name: string, address: string }[]> = {
    ethereum: [
        // Provide DEX liquidity/TVL + contract-address search for key ETH tokens.
        { symbol: "WISE", name: "Wise", address: "0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6" },
        { symbol: "PEPE", name: "Pepe", address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933" },
    ],
    pulsechain: [
        // PulseChain native tokens not on CoinGecko
        { symbol: "TEDDY", name: "Teddy Bear", address: "0xd6c31bA0754C4383A41c0e9DF042C62b5e918f6d" },
        { symbol: "PLSD", name: "PulseDogecoin", address: "0x34F0915a5f15a66Eba86F6a58bE1A471Fb7836A7" },
        { symbol: "PCOCK", name: "PulseChain Peacock", address: "0xc10A4Ed9b4042222d69ff0B374eddd47ed90fC1F" },
        { symbol: "pTGC", name: "The Grays Currency", address: "0x94534EeEe131840b1c0F61847c572228bdfDDE93" },
        { symbol: "UFO", name: "UFO", address: "0x456548A9B56eFBbD89Ca0309edd17a9E20b04018" },
        { symbol: "ANON", name: "PulseChain Anonymous", address: "0x2a27453e460aAa2f19BFBA356547c2CeaB123A1e" },
        { symbol: "PHEN", name: "PulseChain Peahen", address: "0xFDe3255Fb043eA55F9D8635C5e7FF18770A6a810" },
        { symbol: "PTIGER", name: "PulseChain Tiger", address: "0xC2ACde27428d292C4E8e5A4A38148d6b7A2215f5" },
        { symbol: "9MM", name: "9MM", address: "0x7b39712Ef45F7dcED2bBDF11F3D5046bA61dA719" },
        { symbol: "JOY", name: "The Joy of PulseChain", address: "0xD26Ac11FE213cb0916c63A70293f7b0Df91a2de4" },
        { symbol: "MOST", name: "MostWanted", address: "0xe33a5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC" },
    ],
    fantom: [
        // Fantom tokens delisted from CoinGecko
        { symbol: "SPIRIT", name: "SpiritSwap", address: "0x5Cc61A78F164885776AA610fb0FE1257df78E59B" },
        { symbol: "GEIST", name: "Geist Finance", address: "0xd8321AA83Fb0a4ECd6348D4577431310A6E0814d" },
    ],
    // Can add other chains supported by DexScreener:
    // sui: [...],
    // ton: [...],
    // xrp: [...], - Note: XRP Ledger may need different API
    // cardano: [...], - Note: Cardano may need different API
};

// Symbols that should NEVER be moons (they are planets/L1s)
export const CHAIN_NATIVE_SYMBOLS = new Set([
    "BTC", "ETH", "BNB", "SOL", "AVAX", "MATIC", "POL", "FTM", 
    "CRO", "PLS", "TRX", "XRP", "ADA", "DOT", "ATOM", "NEAR",
    "APT", "SUI", "TON", "XLM", "ALGO", "HBAR", "ICP", "FIL",
    "ETC", "BCH", "LTC", "XMR", "DOGE", "ARB", "OP"
]);

// Stablecoin symbols - filterable via UI toggle
export const STABLECOIN_SYMBOLS = new Set([
    "USDT", "USDC", "DAI", "TUSD", "FRAX", "LUSD", "USDD", "USDN", 
    "GUSD", "BUSD", "USDS", "USDL", "USDP", "PYUSD", "FDUSD", "CRVUSD",
    "SUSD", "MIM", "DOLA", "EUSD", "CUSD", "UST", "HUSD", "SUSDE", "USDE",
    "RAI", "USDJ", "FLEXUSD", "EURS", "EURT", "FUSD", "USDD", "USDX",
    "XUSD", "MUSD", "HAY", "FRAX", "ALUSD", "GHO", "CRVUSD"
]);

// Wrapped/derivative token patterns - filterable via UI toggle
export const WRAPPED_PATTERNS = new Set([
    // Wrapped native tokens
    "WETH", "WBTC", "WBNB", "WMATIC", "WAVAX", "WFTM", "WSOL", "WPLS",
    // ETH liquid staking derivatives  
    "STETH", "WSTETH", "CBETH", "RETH", "FRXETH", "SFRXETH", "METH", "SWETH",
    "WBETH", "ANKRBNB", "SBNB", "BETH", "WEETH", "EZETH", "RSETH", "OSETH",
    // BTC wrapped variants
    "BTCB", "RENBTC", "SBTC", "TBTC", "HBTC", "CBBTC", "SOLVBTC", "PBTC",
    // Solana liquid staking (keep JITOSOL and MSOL as exceptions - they're important)
    "BSOL", "SCNSOL", "JSOL", "STSOL", "LSOL",
    // Other wrapped
    "WPOL", "WCRO", "WFTM", "WONE", "WKCS", "WMOVR", "WGLMR"
]);

// ===== FILTER DEFAULTS =====
// These control whether stablecoins and wrapped tokens are shown
// Users can toggle these in the UI
export const DEFAULT_FILTERS = {
    hideStablecoins: true,      // Hide stablecoins by default
    hideWrappedTokens: true,    // Hide wrapped tokens by default
    // Exception list - always show these even if they match wrapped patterns
    wrappedExceptions: ["JITOSOL", "MSOL", "STETH"],  // Popular liquid staking shown
};

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
        "PulseChain": "pulsechain",
        "Pulsechain": "pulsechain",
        // Additional DefiLlama chains (un-curated moons by default)
        "Tron": "tron",
        "Sui": "sui",
        "TON": "ton",
        "Near": "near",
        "Starknet": "starknet",
    } as const,

    // ===== Data Limits =====
    maxChains: 16,                           // Display up to 16 chains (planets)
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
