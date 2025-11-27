// Phase 1: Runtime Validation with Zod
// Schema validation for external API responses and data integrity

import { z, ZodError } from "zod";
import type {
    GalaxyData,
    BTCData,
    ChainData,
    TokenData,
    DefiLlamaChain,
    DexScreenerToken,
    CoinGeckoMarket
} from "@/types/galaxy";
import { debugLog } from "./debug";

// ===== Token Data Schema =====
export const tokenDataSchema = z.object({
    symbol: z.string().min(1).max(20), // Allow longer symbols (some tokens have longer names)
    name: z.string().min(1),
    address: z.string().min(1),
    price: z.number().nonnegative(),
    change24h: z.number(),
    volume24h: z.number().nonnegative(),
    liquidity: z.number().nonnegative(),
    marketCap: z.number().nonnegative(),
    color: z.string(),
    icon: z.string().optional(), // Token icon URL
});

// ===== Chain Data Schema =====
export const chainDataSchema = z.object({
    id: z.string().min(1),
    symbol: z.string().min(1).max(10),
    name: z.string().min(1),
    weight: z.number().nonnegative(),
    tvl: z.number().nonnegative(),
    price: z.number().nonnegative().optional(),
    change24h: z.number(),
    volume24h: z.number().nonnegative(),
    dominance: z.number().min(0).max(100),
    color: z.string(),
    tokens: z.array(tokenDataSchema), // Allow empty array - chains can have 0 tokens
    icon: z.string().optional(), // Chain icon URL
    geckoId: z.string().optional(), // CoinGecko ID for price fetching
});

// ===== BTC Data Schema =====
export const btcDataSchema = z.object({
    price: z.number().positive(),
    change24h: z.number(),
    dominance: z.number().min(0).max(100),
    marketCap: z.number().positive(),
    volume24h: z.number().nonnegative(),
    icon: z.string().optional(), // BTC icon URL
});

// ===== Galaxy Data Schema =====
export const galaxyDataSchema = z.object({
    btc: btcDataSchema,
    chains: z.array(chainDataSchema).min(1),
    lastUpdated: z.date(),
    totalMarketCap: z.number().positive(),
    metric: z.enum(["TVL", "MarketCap", "Volume24h", "Change24h", "Change7d", "Change30d"]),
});

// ===== API Response Schemas =====

// DefiLlama Chain Response
export const defiLlamaChainSchema = z.object({
    name: z.string(),
    chainId: z.coerce.string().nullable().optional(), // Coerce numbers to strings
    tvl: z.number().nonnegative(),
    tokenSymbol: z.string().nullable().optional(),
    cmcId: z.coerce.string().nullable().optional(), // Coerce numbers to strings
    gecko_id: z.string().nullable().optional(),
});

// DexScreener Token Response
export const dexScreenerTokenSchema = z.object({
    chainId: z.string(),
    dexId: z.string(),
    url: z.string(),
    pairAddress: z.string(),
    baseToken: z.object({
        address: z.string(),
        name: z.string(),
        symbol: z.string(),
    }),
    priceUsd: z.string().optional(),
    volume: z.object({
        h24: z.number(),
    }).optional(),
    priceChange: z.object({
        h24: z.number(),
    }).optional(),
    liquidity: z.object({
        usd: z.number(),
    }).optional(),
    fdv: z.number().optional(),
    marketCap: z.number().optional(),
});

// CoinGecko Market Response
export const coinGeckoMarketSchema = z.object({
    id: z.string(),
    symbol: z.string(),
    name: z.string(),
    current_price: z.number(),
    market_cap: z.number(),
    market_cap_rank: z.number().optional(),
    total_volume: z.number(),
    price_change_percentage_24h: z.number(),
    circulating_supply: z.number().optional(),
});

// ===== Validation Functions =====

/**
 * Validate GalaxyData structure
 */
export function validateGalaxyData(data: unknown): asserts data is GalaxyData {
    try {
        galaxyDataSchema.parse(data);
        debugLog('data', '✅ GalaxyData validation passed');
    } catch (error) {
        if (error instanceof ZodError) {
            const issues = error.issues || [];
            const errorMessages = issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
            console.error('[VALIDATION ERROR] GalaxyData failed validation:', errorMessages);
            throw new Error(`GalaxyData validation failed: ${errorMessages || 'Unknown validation error'}`);
        }
        throw error;
    }
}

/**
 * Validate BTCData
 */
export function validateBTCData(data: unknown): asserts data is BTCData {
    try {
        btcDataSchema.parse(data);
        debugLog('data', '✅ BTCData validation passed');
    } catch (error) {
        if (error instanceof ZodError) {
            const zError = error as any;
            console.error('[VALIDATION ERROR] BTCData failed:', zError.errors);
            throw new Error(`BTCData validation failed: ${zError.errors[0].message}`);
        }
        throw error;
    }
}

/**
 * Validate ChainData
 */
export function validateChainData(data: unknown): asserts data is ChainData {
    try {
        chainDataSchema.parse(data);
        debugLog('data', '✅ ChainData validation passed');
    } catch (error) {
        if (error instanceof ZodError) {
            const zError = error as any;
            console.error('[VALIDATION ERROR] ChainData failed:', zError.errors);
            throw new Error(`ChainData validation failed: ${zError.errors[0].message}`);
        }
        throw error;
    }
}

/**
 * Validate array of TokenData
 */
export function validateTokens(data: unknown): asserts data is TokenData[] {
    try {
        z.array(tokenDataSchema).parse(data);
        debugLog('data', `✅ Validated ${(data as any[]).length} tokens`);
    } catch (error) {
        if (error instanceof ZodError) {
            const zError = error as any;
            console.error('[VALIDATION ERROR] TokenData[] failed:', zError.errors);
            throw new Error(`TokenData validation failed: ${zError.errors[0].message}`);
        }
        throw error;
    }
}

/**
 * Validate DefiLlama API response
 */
export function validateDefiLlamaChains(data: unknown): asserts data is DefiLlamaChain[] {
    const result = z.array(defiLlamaChainSchema).safeParse(data);
    if (!result.success) {
        const zError = result.error as any;
        console.error('[VALIDATION ERROR] DefiLlama response failed:', JSON.stringify(zError.format(), null, 2));
        throw new Error(`DefiLlama validation failed: ${zError.errors[0]?.message || 'Unknown error'}`);
    }
    debugLog('data', `✅ Validated ${(data as any[]).length} DefiLlama chains`);
}

/**
 * Validate DexScreener API response
 */
export function validateDexScreenerTokens(data: unknown): asserts data is DexScreenerToken[] {
    try {
        z.array(dexScreenerTokenSchema).parse(data);
        debugLog('data', `✅ Validated ${(data as any[]).length} DexScreener tokens`);
    } catch (error) {
        if (error instanceof ZodError) {
            const zError = error as any;
            console.error('[VALIDATION ERROR] DexScreener response failed:', zError.errors);
            throw new Error(`DexScreener validation failed: ${zError.errors[0].message}`);
        }
        throw error;
    }
}

/**
 * Validate CoinGecko API response
 */
export function validateCoinGeckoMarkets(data: unknown): asserts data is CoinGeckoMarket[] {
    try {
        z.array(coinGeckoMarketSchema).parse(data);
        debugLog('data', `✅ Validated ${(data as any[]).length} CoinGecko markets`);
    } catch (error) {
        if (error instanceof ZodError) {
            const zError = error as any;
            console.error('[VALIDATION ERROR] CoinGecko response failed:', zError.errors);
            throw new Error(`CoinGecko validation failed: ${zError.errors[0].message}`);
        }
        throw error;
    }
}

// ===== Safe Parsing (returns error instead of throwing) =====

export function safeParseGalaxyData(data: unknown) {
    return galaxyDataSchema.safeParse(data);
}

export function safeParseChainData(data: unknown) {
    return chainDataSchema.safeParse(data);
}

export function safeParseTokens(data: unknown) {
    return z.array(tokenDataSchema).safeParse(data);
}

// ===== Sanitization Helpers =====

export function sanitizeString(str: unknown): string {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, 100); // Limit length
}

export function sanitizeNumber(num: unknown): number {
    if (typeof num === 'number' && Number.isFinite(num)) {
        return num;
    }
    if (typeof num === 'string') {
        const parsed = parseFloat(num);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

export function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
