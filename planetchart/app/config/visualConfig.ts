// Phase 1: Configuration - Visual Themes & Colors
// Chain-specific theming, color palettes, and special effects

export const visualConfig = {
    // ===== Chain-Specific Themes =====
    chainThemes: {
        bitcoin: {
            name: "Bitcoin",
            color: "from-yellow-400 via-orange-500 to-orange-600",
            glow: "#f59e0b",
            glowIntensity: 0.8,
            special: "corona" as const,
            icon: "₿",
        },
        ethereum: {
            name: "Ethereum",
            color: "from-blue-400 via-indigo-500 to-purple-600",
            glow: "#6366f1",
            glowIntensity: 0.6,
            special: "logo-watermark" as const,
            icon: "Ξ",
        },
        solana: {
            name: "Solana",
            color: "from-purple-400 via-purple-500 to-green-500",
            glow: "#8b5cf6",
            glowIntensity: 0.7,
            special: "fast-spin" as const,
            icon: "◎",
        },
        bsc: {
            name: "BNB Chain",
            color: "from-yellow-400 via-yellow-500 to-yellow-600",
            glow: "#eab308",
            glowIntensity: 0.5,
            special: "binance-pattern" as const,
            icon: "⬡",
        },
        polygon: {
            name: "Polygon",
            color: "from-purple-500 via-purple-600 to-purple-700",
            glow: "#a855f7",
            glowIntensity: 0.6,
            special: "hexagon" as const,
            icon: "⬢",
        },
        avalanche: {
            name: "Avalanche",
            color: "from-red-400 via-red-500 to-red-600",
            glow: "#ef4444",
            glowIntensity: 0.5,
            special: "snow-texture" as const,
            icon: "▲",
        },
        arbitrum: {
            name: "Arbitrum",
            color: "from-blue-400 via-blue-500 to-cyan-600",
            glow: "#3b82f6",
            glowIntensity: 0.5,
            special: "none" as const,
            icon: "◆",
        },
        optimism: {
            name: "Optimism",
            color: "from-red-500 via-red-600 to-red-700",
            glow: "#dc2626",
            glowIntensity: 0.5,
            special: "none" as const,
            icon: "○",
        },
        base: {
            name: "Base",
            color: "from-blue-500 via-blue-600 to-blue-700",
            glow: "#2563eb",
            glowIntensity: 0.5,
            special: "coinbase-pattern" as const,
            icon: "●",
        },
        fantom: {
            name: "Fantom",
            color: "from-blue-400 via-indigo-500 to-blue-600",
            glow: "#4f46e5",
            glowIntensity: 0.5,
            special: "none" as const,
            icon: "♦",
        },
        pulsechain: {
            name: "PulseChain",
            color: "from-pink-500 via-purple-500 to-blue-600",
            glow: "#ec4899",
            glowIntensity: 0.6,
            special: "pulse-effect" as const,
            icon: "♥",
        },
    },

    // ===== Default Fallback Theme =====
    defaultTheme: {
        color: "from-gray-400 via-gray-500 to-gray-600",
        glow: "#9ca3af",
        glowIntensity: 0.4,
        special: "none" as const,
        icon: "●",
    },

    // ===== Token/Moon Appearance =====
    tokenColors: {
        default: "#94a3b8",           // Neutral gray-blue
        positive: "#10b981",          // Green for positive price change
        negative: "#ef4444",          // Red for negative price change
        highVolume: "#f59e0b",        // Amber for high volume
        lowLiquidity: "#64748b",      // Muted for low liquidity
    },

    // ===== Special Effects Configuration =====
    specialEffects: {
        corona: {
            enabled: true,
            layerCount: 3,
            pulseSpeed: 0.8,
            colorShift: 0.1,
        },
        "fast-spin": {
            enabled: true,
            rotationSpeed: 1.5,
            trailEffect: true,
        },
        "pulse-effect": {
            enabled: true,
            pulseInterval: 2000,
            pulseIntensity: 0.3,
        },
    },

    // ===== Glow & Shadow Settings =====
    glowConfig: {
        sunBlur: 40,                  // BTC glow blur radius (px)
        planetBlur: 20,               // Planet glow blur radius (px)
        tokenBlur: 8,                 // Token glow blur radius (px)
        glowOpacity: 0.6,             // Base glow opacity
    },

    // ===== Orbital Trail Colors =====
    trailColors: {
        default: "rgba(255, 255, 255, 0.1)",
        active: "rgba(255, 255, 255, 0.3)",
        selected: "rgba(96, 165, 250, 0.4)",
    },

    // ===== Text & Label Styling =====
    textStyle: {
        sunColor: "#fbbf24",          // Gold for BTC
        planetColor: "#ffffff",       // White for planets
        tokenColor: "#cbd5e1",        // Light gray for tokens
        dataColor: "rgba(255, 255, 255, 0.7)", // Semi-transparent for secondary info
    },

    // ===== Background Elements =====
    background: {
        starCount: 200,               // Number of background stars
        starOpacity: 0.6,             // Star opacity
        nebulaeCount: 3,              // Number of nebula effects
        gridEnabled: false,           // Show coordinate grid
    },

    // ===== Holo Style Constants =====
    holoStyle: {
        shadow: 'shadow-lg shadow-cyan-500/50',
        opacity: 'opacity-80',
        border: 'border border-cyan-300/50',
    },
} as const;

// Export types
export type ChainTheme = typeof visualConfig.chainThemes;
export type ChainThemeKey = keyof typeof visualConfig.chainThemes;
export type SpecialEffect = keyof typeof visualConfig.specialEffects;
export type VisualConfig = typeof visualConfig;
