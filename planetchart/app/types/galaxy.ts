// Phase 1: Core Type Definitions
// All TypeScript types for the galaxy visualization system

// Re-export WeightMode from config
export type { WeightMode } from "@/config/dataConfig";
import type { WeightMode } from "@/config/dataConfig";

// ===== Token Data =====
export type TokenData = {
    symbol: string;           // "UNI", "AAVE", etc.
    name: string;             // Full name
    address: string;          // Contract address
    price: number;            // Current price in USD
    change24h: number;        // 24h price change percentage
    volume24h: number;        // 24h trading volume in USD
    liquidity: number;        // Total liquidity in USD
    marketCap: number;        // Market capitalization in USD
    color: string;            // Visual color (hex or CSS)
    icon?: string;            // Icon URL from CoinGecko
};

// ===== Chain/Blockchain Data =====
export type ChainData = {
    id: string;               // "ethereum", "solana", etc.
    symbol: string;           // "ETH", "SOL", etc.
    name: string;             // "Ethereum", "Solana", etc.
    weight: number;           // Calculated based on current WeightMode
    tvl: number;              // Total Value Locked in USD
    marketCap?: number;       // Native token market cap in USD (from CoinGecko)
    price?: number;           // Native token price (if applicable)
    change24h: number;        // 24h TVL or price change %
    volume24h: number;        // 24h volume in USD
    dominance: number;        // % of total crypto market
    color: string;            // Visual theme color
    tokens: TokenData[];      // Top tokens on this chain
    geckoId?: string;         // CoinGecko ID for fetching native token price
    icon?: string;            // Icon URL from CoinGecko
};

// ===== Bitcoin (Sun) Data =====
export type BTCData = {
    price: number;            // BTC price in USD
    change24h: number;        // 24h price change %
    dominance: number;        // BTC dominance % of total market
    marketCap: number;        // BTC market cap in USD
    volume24h: number;        // 24h trading volume
    icon?: string;            // Icon URL from CoinGecko
};

// ===== Complete Galaxy Data =====
export type GalaxyData = {
    btc: BTCData;             // Central sun data
    chains: ChainData[];      // All chains/planets
    lastUpdated: Date;        // Timestamp of last data fetch
    totalMarketCap: number;   // Total crypto market cap
    metric: WeightMode;       // Current weight mode
};

// ===== Physics Simulation Node =====
export type GalaxyNode = {
    // Identification
    id: string;                    // Unique identifier
    type: "sun" | "planet" | "moon" | "meteorite"; // Node type: sun (BTC/largest), planet (chain), moon (liquid token), meteorite (illiquid token)
    parentId: string | null;       // null for sun, chainId for moons, moonId for meteorites

    // Position & Velocity
    x: number;                     // World X coordinate
    y: number;                     // World Y coordinate
    vx: number;                    // Velocity X
    vy: number;                    // Velocity Y

    // Visual Properties
    radius: number;                // Visual radius (px)
    color: string;                 // Color/gradient

    // Orbital Properties
    orbitRadius: number;           // Target distance from parent
    orbitAngle: number;            // Current angle in orbit (radians)
    angularVelocity: number;       // Rotation speed (radians/frame)
    targetOrbitRadius?: number;    // Smoothed target orbit radius (for easing)
    baseOrbitAngle?: number;       // Slot center angle before offsets
    targetOrbitAngle?: number;     // Desired orbit angle (decays toward this)
    angleOffset?: number;          // Temporary offset from slot center
    ringIndex?: number;            // Which moon ring this node belongs to
    slotIndex?: number;            // Index within the ring slots
    slotCount?: number;            // Total slots in this ring
    slotSpan?: number;             // Angular width reserved for this slot
    fieldInnerRadius?: number;     // Inner boundary of parent field band (px)
    fieldOuterRadius?: number;     // Outer boundary of parent field band (px)
    fieldMidRadius?: number;       // Midpoint of the band for relaxed settling
    freeOrbitTimer?: number;       // Frames remaining where node ignores rail and coasts
    freeOrbitDurationTotal?: number; // Total frames assigned when free flight started
    slotReleaseTimer?: number;     // Duration where slot clamping is relaxed
    freeOrbitAnchorRadius?: number; // Radius captured at collision start
    freeOrbitAnchorAngle?: number;  // Angle captured at collision start
    railBlendTimer?: number;        // Frames spent blending back onto rail

    // Physics Properties
    weight: number;                // Used for calculations (TVL, market cap, etc.)
    mass: number;                  // For gravity calculations
    orbitEccentricity?: number;    // Elliptical orbit eccentricity (0 = circle, higher = more elliptical)
    
    // Size comparison
    sizeRatio?: number;            // How many times larger than next entity (e.g., 4.98 means "4.98x larger")
    nextEntitySymbol?: string;     // Symbol of the next smaller entity for comparison
    sunMultiplier?: number;        // How many times this entity needs to grow to reach the sun's weight

    // Data Reference
    data: BTCData | ChainData | TokenData; // Original data

    // Interaction State
    isDragging: boolean;
    isSelected: boolean;
    isHovered: boolean;

    // Collision Visual Effects (soft, decaying)
    collisionGlow?: number;        // 0-1, brightness of collision glow effect
    radiusOffset?: number;         // Small radial wobble from collisions (px)
};

// ===== Galaxy Physics State =====
export type GalaxyState = {
    nodes: GalaxyNode[];           // All simulation nodes
    sunNode: GalaxyNode;           // Reference to BTC sun
    planetNodes: GalaxyNode[];     // All chain planets
    moonNodes: GalaxyNode[];       // All token moons
    meteoriteNodes: GalaxyNode[];  // All illiquid token meteorites
    timestamp: number;             // Last update timestamp
};

// ===== Camera State =====
export type CameraState = {
    x: number;                     // Camera X offset
    y: number;                     // Camera Y offset
    zoom: number;                  // Zoom level (0.3 - 3.0)
    vx: number;                    // Pan velocity X
    vy: number;                    // Pan velocity Y
    targetZoom?: number;           // Target zoom for smooth interpolation
    followNodeId?: string | null;  // ID of node to follow (if any)
};

// ===== Camera Input Events =====
export type CameraInput = {
    type: "scroll" | "drag" | "click" | "none";
    deltaZoom?: number;            // Scroll delta
    deltaX?: number;               // Drag delta X
    deltaY?: number;               // Drag delta Y
    clickX?: number;               // Click position X
    clickY?: number;               // Click position Y
    target?: string;               // Target node ID for clicks
};

// ===== UI Filter State =====
export type FilterState = {
    weightMode: WeightMode;        // Current metric for sizing/positioning
    chainCount: number;            // Number of chains to display
    tokensPerChain: number;        // Tokens per chain to display
    showOrbits: boolean;           // Show orbital trails
    showLabels: boolean;           // Show text labels
};

// ===== API Response Types (for validation) =====
export type DefiLlamaChain = {
    name: string;
    chainId: string;
    tvl: number;
    tokenSymbol?: string;
    cmcId?: string;
    gecko_id?: string;
};

export type DexScreenerToken = {
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
    volume: {
        h24: number;
    };
    priceChange: {
        h24: number;
    };
    liquidity: {
        usd: number;
    };
};

export type CoinGeckoMarket = {
    id: string;
    symbol: string;
    name: string;
    current_price: number;
    market_cap: number;
    market_cap_rank: number;
    total_volume: number;
    price_change_percentage_24h: number;
    circulating_supply: number;
};

// ===== Utility Types =====
export type Vector2D = {
    x: number;
    y: number;
};

export type BoundingBox = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

// ===== Error Types =====
export type DataError = {
    source: "defiLlama" | "dexScreener" | "coinGecko" | "unknown";
    message: string;
    timestamp: Date;
    retryable: boolean;
};
