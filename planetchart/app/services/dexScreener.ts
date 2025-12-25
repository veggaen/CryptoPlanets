import { dataConfig, STABLECOIN_SYMBOLS } from "@/config/dataConfig";
import { TokenData } from "@/types/galaxy";
import { debugLog } from "@/utils/debug";
import { validateDexScreenerTokens } from "@/utils/validation";

// Cache
const tokensCache: Record<string, { data: TokenData[], timestamp: number }> = {};

// HEX contract address (same on Ethereum and PulseChain due to fork)
const HEX_CONTRACT = "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39";

function normalizeAddress(input: unknown): string {
    if (typeof input !== 'string') return '';
    const trimmed = input.trim();
    if (!trimmed) return '';
    // EVM addresses are case-insensitive; normalize to lowercase.
    if (/^0x[a-fA-F0-9]{6,}$/.test(trimmed)) return trimmed.toLowerCase();
    // Non-EVM addresses (e.g. Solana base58) are case-sensitive.
    return trimmed;
}

function parsePositiveNumber(input: unknown): number {
    const n = typeof input === 'number' ? input : parseFloat(String(input ?? ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

type DexPair = any;

function isStableSymbol(symbol: unknown): boolean {
    const s = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
    return s.length > 0 && STABLECOIN_SYMBOLS.has(s);
}

function isPreferredHexCounterSymbol(symbol: unknown): boolean {
    const s = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
    if (s.length === 0) return false;
    if (isStableSymbol(s)) return true;
    // Accept major wrapped/native counterparts as a fallback when no stable pair exists.
    return s === 'WETH' || s === 'ETH' || s === 'WPLS' || s === 'PLS';
}

function isSameAddress(a: unknown, b: unknown): boolean {
    const na = normalizeAddress(a);
    const nb = normalizeAddress(b);
    return na.length > 0 && na === nb;
}

function extractTokenPriceUsdFromPair(pair: DexPair, tokenAddress: string): { priceUsd: number; isDirect: boolean } {
    const target = normalizeAddress(tokenAddress);
    const baseAddr = normalizeAddress(pair?.baseToken?.address);
    const quoteAddr = normalizeAddress(pair?.quoteToken?.address);

    const basePriceUsd = parsePositiveNumber(pair?.priceUsd);

    // DexScreener's priceUsd is the BASE token's USD price.
    if (baseAddr === target) {
        return { priceUsd: basePriceUsd, isDirect: true };
    }

    // If target is the quote token, infer target USD price by inverting the base/quote ratio.
    // priceNative is the price of 1 base token in units of the quote token.
    if (quoteAddr === target) {
        const baseInQuote = parsePositiveNumber(pair?.priceNative);
        if (basePriceUsd > 0 && baseInQuote > 0) {
            return { priceUsd: basePriceUsd / baseInQuote, isDirect: false };
        }
    }

    return { priceUsd: 0, isDirect: false };
}

function pickBestPairForToken(pairs: DexPair[], chainId: string, tokenAddress: string): DexPair | null {
    const target = normalizeAddress(tokenAddress);
    const chainPairs = pairs.filter((p: any) => p && p.chainId === chainId);
    if (chainPairs.length === 0) return null;

    const baseMatches = chainPairs.filter((p: any) => normalizeAddress(p?.baseToken?.address) === target);
    const pool = baseMatches.length > 0
        ? baseMatches
        : chainPairs.filter((p: any) => normalizeAddress(p?.quoteToken?.address) === target);
    if (pool.length === 0) return null;

    return pool
        .slice()
        .sort((a: any, b: any) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0))[0] ?? null;
}

function pickBestStableCounterPairForToken(pairs: DexPair[], chainId: string, tokenAddress: string): DexPair | null {
    const target = normalizeAddress(tokenAddress);
    const chainPairs = pairs.filter((p: any) => p && p.chainId === chainId);
    if (chainPairs.length === 0) return null;

    const stableCandidates = chainPairs.filter((p: any) => {
        const baseAddr = normalizeAddress(p?.baseToken?.address);
        const quoteAddr = normalizeAddress(p?.quoteToken?.address);

        // Determine the counter asset symbol relative to the requested token.
        const counterSymbol = baseAddr === target
            ? p?.quoteToken?.symbol
            : (quoteAddr === target ? p?.baseToken?.symbol : null);

        return isStableSymbol(counterSymbol);
    });

    if (stableCandidates.length === 0) return null;

    return stableCandidates
        .slice()
        .sort((a: any, b: any) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0))[0] ?? null;
}

function aggregateTopPools(pairs: DexPair[], topN: number): { liquidity: number; volume24h: number; poolCount: number } {
    const sorted = pairs
        .slice()
        .sort((a: any, b: any) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));

    const selected = sorted.slice(0, Math.max(1, topN));
    const liquidity = selected.reduce((sum, p: any) => sum + parsePositiveNumber(p?.liquidity?.usd), 0);
    const volume24h = selected.reduce((sum, p: any) => sum + parsePositiveNumber(p?.volume?.h24), 0);
    return { liquidity, volume24h, poolCount: selected.length };
}

function pickBestHexPair(pairs: DexPair[], chainId: string): DexPair | null {
    const target = normalizeAddress(HEX_CONTRACT);
    const chainPairs = pairs.filter((p: any) => p && p.chainId === chainId);
    if (chainPairs.length === 0) return null;

    // Consider any pair where HEX is either base or quote.
    const candidates = chainPairs.filter((p: any) =>
        normalizeAddress(p?.baseToken?.address) === target || normalizeAddress(p?.quoteToken?.address) === target
    );
    if (candidates.length === 0) return null;

    // Prefer stablecoin-quoted pairs (most reliable USD pricing), otherwise fall back to WETH/WPLS.
    const stablePairs = candidates.filter((p: any) => {
        const baseAddr = normalizeAddress(p?.baseToken?.address);
        const counterSymbol = baseAddr === target ? p?.quoteToken?.symbol : p?.baseToken?.symbol;
        return isStableSymbol(counterSymbol);
    });

    const preferredPairs = (stablePairs.length > 0 ? stablePairs : candidates.filter((p: any) => {
        const baseAddr = normalizeAddress(p?.baseToken?.address);
        const counterSymbol = baseAddr === target ? p?.quoteToken?.symbol : p?.baseToken?.symbol;
        return isPreferredHexCounterSymbol(counterSymbol);
    }));

    // If we can't find a pair with a trustworthy counter-asset, return null rather than risk false prices.
    if (preferredPairs.length === 0) return null;

    // Prefer pairs where HEX is the BASE token, but only within the trustworthy pool.
    const directPreferred = preferredPairs.filter((p: any) => normalizeAddress(p?.baseToken?.address) === target);
    const orientationPool = directPreferred.length > 0 ? directPreferred : preferredPairs;

    const usablePairs = orientationPool.filter((p: any) => extractHexPriceUsd(p).priceUsd > 0);
    if (usablePairs.length === 0) return null;

    return usablePairs
        .slice()
        .sort((a: any, b: any) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0))[0] ?? null;
}

function extractHexPriceUsd(pair: DexPair): { priceUsd: number; isDirect: boolean } {
    return extractTokenPriceUsdFromPair(pair, HEX_CONTRACT);
}

// Cache for HEX data
const HEX_CACHE_VERSION = 3;
let hexCache: { data: { eHEX: TokenData | null, pHEX: TokenData | null }, timestamp: number, version: number } | null = null;

/**
 * Get gradient color based on 24h price change
 */
function getTokenColor(change24h: number): string {
    if (change24h > 10) return "from-green-400 to-emerald-600";
    if (change24h > 0) return "from-green-300 to-green-500";
    if (change24h < -10) return "from-red-400 to-rose-600";
    if (change24h < 0) return "from-red-300 to-red-500";
    return "from-slate-400 to-slate-600";
}

/**
 * Fetch HEX token data from DexScreener
 * CoinGecko has broken market cap data for HEX (shows 0 due to OA controversy)
 * DexScreener provides accurate circulating market cap excluding OA
 * 
 * Returns both eHEX (Ethereum) and pHEX (PulseChain) data
 */
export async function fetchHEXData(): Promise<{ eHEX: TokenData | null, pHEX: TokenData | null }> {
    const now = Date.now();

    // Return cache if valid (10 min TTL)
    if (hexCache && hexCache.version === HEX_CACHE_VERSION && (now - hexCache.timestamp < dataConfig.cache.ttl.tokens)) {
        debugLog('data', 'Using cached HEX data from DexScreener');
        return hexCache.data;
    }

    try {
        debugLog('data', 'Fetching HEX data from DexScreener (better market cap than CoinGecko)...');

        const url = `${dataConfig.dexScreener.baseURL}/latest/dex/tokens/${HEX_CONTRACT}`;
        console.log('[HEX] Fetching from:', url);
        const response = await fetch(url);

        if (!response.ok) {
            console.error('[HEX] DexScreener error:', response.status);
            throw new Error(`DexScreener API error: ${response.status}`);
        }

        const rawData = await response.json();
        console.log('[HEX] Raw pairs count:', rawData.pairs?.length || 0);

        if (!rawData.pairs || !Array.isArray(rawData.pairs)) {
            console.error('[HEX] No pairs in response');
            return { eHEX: null, pHEX: null };
        }

        // Pick best pair for each chain, preferring pairs where HEX is the base token.
        const bestEthPair = pickBestHexPair(rawData.pairs, 'ethereum');
        const bestPlsPair = pickBestHexPair(rawData.pairs, 'pulsechain');
        const ethCount = rawData.pairs.filter((p: any) => p.chainId === 'ethereum').length;
        const plsCount = rawData.pairs.filter((p: any) => p.chainId === 'pulsechain').length;
        console.log('[HEX] Ethereum pairs:', ethCount, 'PulseChain pairs:', plsCount);

        let eHEX: TokenData | null = null;
        let pHEX: TokenData | null = null;

        if (bestEthPair) {
            const change24h = bestEthPair.priceChange?.h24 || 0;
            const { priceUsd, isDirect } = extractHexPriceUsd(bestEthPair);

            // Only trust DexScreener marketCap/fdv when HEX is the base token; otherwise it refers to the base token.
            const marketCapRaw = isDirect && typeof bestEthPair.marketCap === 'number' ? bestEthPair.marketCap : 0;
            const fdv = isDirect && typeof bestEthPair.fdv === 'number' ? bestEthPair.fdv : undefined;
            const marketCapKind: TokenData["marketCapKind"] = marketCapRaw > 0 ? 'market_cap' : (fdv ? 'fdv' : 'unknown');
            const marketCap = marketCapRaw > 0 ? marketCapRaw : (fdv ?? 0);
            eHEX = {
                symbol: "HEX",
                name: "HEX",
                address: "hex", // Use CoinGecko ID for consistency
                contractAddress: HEX_CONTRACT,
                price: priceUsd,
                change24h,
                volume24h: bestEthPair.volume?.h24 || 0,
                liquidity: bestEthPair.liquidity?.usd || 0,
                marketCap,
                fdv,
                marketCapKind,
                color: getTokenColor(change24h),
                icon: bestEthPair.info?.imageUrl || "https://coin-images.coingecko.com/coins/images/10103/large/HEX-logo.png",
                dexScreenerUrl: typeof bestEthPair?.url === 'string' ? bestEthPair.url : undefined,
                dexPairAddress: typeof bestEthPair?.pairAddress === 'string' ? bestEthPair.pairAddress : undefined,
                dexScreenerDexId: typeof bestEthPair?.dexId === 'string' ? bestEthPair.dexId : undefined,
                dexScreenerBaseSymbol: typeof bestEthPair?.baseToken?.symbol === 'string' ? bestEthPair.baseToken.symbol : undefined,
                dexScreenerQuoteSymbol: typeof bestEthPair?.quoteToken?.symbol === 'string' ? bestEthPair.quoteToken.symbol : undefined,
            };
            console.log('[HEX] OK: Created eHEX:', { price: eHEX.price, mc: eHEX.marketCap });
        } else {
            console.log('[HEX] ERROR: No Ethereum pairs found!');
        }

        if (bestPlsPair) {
            const change24h = bestPlsPair.priceChange?.h24 || 0;
            const { priceUsd, isDirect } = extractHexPriceUsd(bestPlsPair);

            const marketCapRaw = isDirect && typeof bestPlsPair.marketCap === 'number' ? bestPlsPair.marketCap : 0;
            const fdv = isDirect && typeof bestPlsPair.fdv === 'number' ? bestPlsPair.fdv : undefined;
            const marketCapKind: TokenData["marketCapKind"] = marketCapRaw > 0 ? 'market_cap' : (fdv ? 'fdv' : 'unknown');
            const marketCap = marketCapRaw > 0 ? marketCapRaw : (fdv ?? 0);
            pHEX = {
                symbol: "HEX", // Will display as HEX, but on PulseChain
                name: "HEX (PulseChain)",
                address: "hex-pulsechain", // Use CoinGecko ID for consistency
                contractAddress: HEX_CONTRACT,
                price: priceUsd,
                change24h,
                volume24h: bestPlsPair.volume?.h24 || 0,
                liquidity: bestPlsPair.liquidity?.usd || 0,
                marketCap,
                fdv,
                marketCapKind,
                color: getTokenColor(change24h),
                icon: bestPlsPair.info?.imageUrl || "https://coin-images.coingecko.com/coins/images/10103/large/HEX-logo.png",
                dexScreenerUrl: typeof bestPlsPair?.url === 'string' ? bestPlsPair.url : undefined,
                dexPairAddress: typeof bestPlsPair?.pairAddress === 'string' ? bestPlsPair.pairAddress : undefined,
                dexScreenerDexId: typeof bestPlsPair?.dexId === 'string' ? bestPlsPair.dexId : undefined,
                dexScreenerBaseSymbol: typeof bestPlsPair?.baseToken?.symbol === 'string' ? bestPlsPair.baseToken.symbol : undefined,
                dexScreenerQuoteSymbol: typeof bestPlsPair?.quoteToken?.symbol === 'string' ? bestPlsPair.quoteToken.symbol : undefined,
            };
            console.log('[HEX] OK: Created pHEX:', { price: pHEX.price, mc: pHEX.marketCap });
        }

        // Update cache
        hexCache = { data: { eHEX, pHEX }, timestamp: now, version: HEX_CACHE_VERSION };

        debugLog('data', 'OK: Fetched HEX data from DexScreener (accurate market cap)');
        return { eHEX, pHEX };

    } catch (error) {
        debugLog('data', `Error fetching HEX from DexScreener: ${error}`);
        return { eHEX: null, pHEX: null };
    }
}

export async function fetchTokensForChain(chainId: string, limit: number = 20): Promise<TokenData[]> {
    const now = Date.now();

    // Return cache if valid
    if (tokensCache[chainId] && (now - tokensCache[chainId].timestamp < dataConfig.cache.ttl.tokens)) {
        debugLog('data', `Using cached tokens for ${chainId}`);
        return tokensCache[chainId].data;
    }

    try {
        debugLog('data', `Fetching tokens for ${chainId} from DexScreener...`);

        // DexScreener search endpoint
        const searchUrl = `${dataConfig.dexScreener.baseURL}${dataConfig.dexScreener.endpoints.search}?q=${chainId}`;
        const response = await fetch(searchUrl);

        if (!response.ok) {
            throw new Error(`DexScreener API error: ${response.status}`);
        }

        const rawData = await response.json();

        // The search returns pairs. We need to extract unique base tokens from these pairs.
        if (!rawData.pairs || !Array.isArray(rawData.pairs)) {
            return [];
        }

        // Filter for the correct chainId (DexScreener uses specific chain IDs)
        // We need to map our internal ID to DexScreener's if they differ.
        // dataConfig.chainIdMap handles this.
        const targetChainId = dataConfig.chainIdMap[chainId as keyof typeof dataConfig.chainIdMap] || chainId;

        const relevantPairs = rawData.pairs.filter((p: any) => p.chainId === targetChainId);

        // Extract unique tokens
        const uniqueTokens = new Map<string, TokenData>();

        for (const pair of relevantPairs) {
            if (uniqueTokens.size >= limit) break;

            const token = pair.baseToken;
            if (uniqueTokens.has(token.address)) continue;

            uniqueTokens.set(token.address, {
                symbol: token.symbol,
                name: token.name,
                address: token.address,
                price: parseFloat(pair.priceUsd || "0"),
                change24h: pair.priceChange?.h24 || 0,
                volume24h: pair.volume?.h24 || 0,
                liquidity: pair.liquidity?.usd || 0,
                marketCap: (pair.marketCap || pair.fdv || 0),
                fdv: typeof pair.fdv === 'number' ? pair.fdv : undefined,
                marketCapKind: typeof pair.marketCap === 'number' && pair.marketCap > 0 ? 'market_cap' : (typeof pair.fdv === 'number' && pair.fdv > 0 ? 'fdv' : 'unknown'),
                color: "from-slate-400 to-slate-600", // Default, will be themed
                dexScreenerUrl: typeof pair?.url === 'string' ? pair.url : undefined,
                dexPairAddress: typeof pair?.pairAddress === 'string' ? pair.pairAddress : undefined,
                dexScreenerDexId: typeof pair?.dexId === 'string' ? pair.dexId : undefined,
                dexScreenerBaseSymbol: typeof pair?.baseToken?.symbol === 'string' ? pair.baseToken.symbol : undefined,
                dexScreenerQuoteSymbol: typeof pair?.quoteToken?.symbol === 'string' ? pair.quoteToken.symbol : undefined,
            });
        }

        const tokens = Array.from(uniqueTokens.values());

        // Update cache
        tokensCache[chainId] = { data: tokens, timestamp: now };

        return tokens;
    } catch (error) {
        console.error(`Failed to fetch tokens for ${chainId}:`, error);
        if (dataConfig.useMockDataOnError) {
            return getMockTokens(chainId);
        }
        return [];
    }
}

function getMockTokens(chainId: string): TokenData[] {
    // Return some dummy tokens based on chain
    const suffix = chainId.substring(0, 3).toUpperCase();
    return Array.from({ length: 5 }).map((_, i) => ({
        symbol: `TKN${i}-${suffix}`,
        name: `Token ${i} ${suffix}`,
        address: `0x${i}${i}${i}`,
        price: Math.random() * 100,
        change24h: (Math.random() * 20) - 10,
        volume24h: Math.random() * 1000000,
        liquidity: Math.random() * 500000,
        marketCap: Math.random() * 10000000,
        color: "from-blue-400 to-blue-600"
    }));
}

// Cache for DexScreener tokens fetched by address
const dexTokensCache: { [key: string]: { data: TokenData[]; timestamp: number } } = {};

function hashStringDjb2(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    }
    // Keep it short + stable
    return (hash >>> 0).toString(16);
}

/**
 * Fetch specific tokens by their contract addresses from DexScreener.
 * This is used for tokens that are not on CoinGecko.
 * 
 * @param dexChainId - DexScreener chain ID (e.g., 'pulsechain', 'fantom', 'solana')
 * @param tokenConfigs - Array of token configs with address, symbol, name
 * @returns Array of TokenData for the requested tokens
 */
export async function fetchDexScreenerTokensByAddress(
    dexChainId: string,
    tokenConfigs: Array<{ address: string; symbol: string; name: string }>
): Promise<TokenData[]> {
    const normalizedAddresses = tokenConfigs
        .map((t) => normalizeAddress(t.address))
        .filter((a) => a.length > 0)
        .sort();
    const cacheKey = `${dexChainId}-addresses-${hashStringDjb2(normalizedAddresses.join(','))}`;
    const now = Date.now();

    // Return cache if valid
    if (dexTokensCache[cacheKey] && (now - dexTokensCache[cacheKey].timestamp < dataConfig.cache.ttl.tokens)) {
        debugLog('data', `Using cached DexScreener tokens for ${dexChainId}`);
        return dexTokensCache[cacheKey].data;
    }

    const tokens: TokenData[] = [];

    try {
        debugLog('data', `Fetching ${tokenConfigs.length} tokens from DexScreener for ${dexChainId}...`);

        // DexScreener returns max ~30 pairs per request. Some tokens can have MANY pairs,
        // so we batch a few at a time, then retry missing tokens individually.
        const BATCH_SIZE = 5;
        const batches: typeof tokenConfigs[] = [];
        
        for (let i = 0; i < tokenConfigs.length; i += BATCH_SIZE) {
            batches.push(tokenConfigs.slice(i, i + BATCH_SIZE));
        }

        const retryIndividually: typeof tokenConfigs = [];
        const seenAddresses = new Set<string>();

        for (const batch of batches) {
            const requested = new Set(batch.map((t) => normalizeAddress(t.address)));
            const addresses = batch.map(t => t.address).join(',');
            // DexScreener tokens endpoint doesn't need chain ID - it auto-detects from address
            const url = `${dataConfig.dexScreener.baseURL}${dataConfig.dexScreener.endpoints.tokens}/${addresses}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                console.warn(`[DexScreener] API error for ${dexChainId}: ${response.status}`);
                continue;
            }

            const data = await response.json();
            
            if (!data.pairs || !Array.isArray(data.pairs)) {
                console.warn(`No pairs found in DexScreener response for ${dexChainId}`);
                continue;
            }

            // Filter pairs by chainId and group by requested token address.
            // IMPORTANT: the requested token can be either base OR quote.
            const tokenPairs: { [address: string]: any[] } = {};
            
            for (const pair of data.pairs) {
                // Filter to only include pairs on the requested chain
                if (pair.chainId !== dexChainId) continue;

                const baseAddr = normalizeAddress(pair?.baseToken?.address);
                const quoteAddr = normalizeAddress(pair?.quoteToken?.address);
                if (baseAddr && requested.has(baseAddr)) {
                    (tokenPairs[baseAddr] ||= []).push(pair);
                }
                if (quoteAddr && requested.has(quoteAddr)) {
                    (tokenPairs[quoteAddr] ||= []).push(pair);
                }
            }

            // Process each token config and find best pair
            for (const config of batch) {
                const addr = normalizeAddress(config.address);
                const pairs = tokenPairs[addr];
                
                if (!pairs || pairs.length === 0) {
                    debugLog('data', `No pairs found for ${config.symbol} on ${dexChainId}`);
                    retryIndividually.push(config);
                    continue;
                }

                // Pick best pair for this token, preferring pairs where the token is base.
                // Prefer stable-quoted pairs for pricing when available; fallback to highest-liquidity pair.
                // But for chart/deep-links we want the most liquid pool (often the native pair, e.g. MEW/SOL).
                const pricingPair = pickBestStableCounterPairForToken(pairs, dexChainId, config.address)
                    ?? pickBestPairForToken(pairs, dexChainId, config.address);
                const linkPair = pickBestPairForToken(pairs, dexChainId, config.address) ?? pricingPair;
                const bestPair = pricingPair ?? linkPair;
                if (!bestPair) continue;

                // Aggregate liquidity/volume across the biggest pools for a more realistic token-level metric.
                const aggregated = aggregateTopPools(pairs, 3);

                const change24h = bestPair.priceChange?.h24 || 0;
                const { priceUsd, isDirect } = extractTokenPriceUsdFromPair(bestPair, config.address);

                // Only trust marketCap/fdv when the requested token is the base token.
                const marketCapRaw = isDirect && typeof bestPair.marketCap === 'number' ? bestPair.marketCap : 0;
                const fdv = isDirect && typeof bestPair.fdv === 'number' ? bestPair.fdv : undefined;
                const marketCapKind: TokenData['marketCapKind'] = marketCapRaw > 0 ? 'market_cap' : (fdv ? 'fdv' : 'unknown');
                const marketCap = marketCapRaw > 0 ? marketCapRaw : (fdv ?? 0);

                const normalized = normalizeAddress(config.address);
                if (normalized.length > 0 && seenAddresses.has(normalized)) {
                    continue;
                }
                if (normalized.length > 0) seenAddresses.add(normalized);

                tokens.push({
                    symbol: config.symbol,
                    name: config.name,
                    address: config.address,
                    contractAddress: config.address,
                    price: priceUsd,
                    change24h,
                    volume24h: aggregated.volume24h || (bestPair.volume?.h24 || 0),
                    liquidity: aggregated.liquidity || (bestPair.liquidity?.usd || 0),
                    marketCap,
                    fdv,
                    marketCapKind,
                    color: getTokenColor(change24h),
                    icon: bestPair.info?.imageUrl,
                    dexScreenerUrl: typeof linkPair?.url === 'string' ? linkPair.url : (typeof bestPair?.url === 'string' ? bestPair.url : undefined),
                    dexPairAddress: typeof linkPair?.pairAddress === 'string' ? linkPair.pairAddress : (typeof bestPair?.pairAddress === 'string' ? bestPair.pairAddress : undefined),
                    dexScreenerDexId: typeof linkPair?.dexId === 'string' ? linkPair.dexId : undefined,
                    dexScreenerBaseSymbol: typeof linkPair?.baseToken?.symbol === 'string' ? linkPair.baseToken.symbol : undefined,
                    dexScreenerQuoteSymbol: typeof linkPair?.quoteToken?.symbol === 'string' ? linkPair.quoteToken.symbol : undefined,
                });
                
                debugLog('data', `DexScreener: Found ${config.symbol} - MC: $${marketCap.toLocaleString()}`);
            }
        }

        // Retry tokens that looked missing in a batch (common when a batched response truncates pairs).
        for (const config of retryIndividually) {
            const normalized = normalizeAddress(config.address);
            if (normalized.length > 0 && seenAddresses.has(normalized)) continue;

            const url = `${dataConfig.dexScreener.baseURL}${dataConfig.dexScreener.endpoints.tokens}/${config.address}`;
            const response = await fetch(url);
            if (!response.ok) continue;
            const data = await response.json();
            if (!data.pairs || !Array.isArray(data.pairs)) continue;

            const requested = new Set([normalizeAddress(config.address)]);
            const tokenPairs: { [address: string]: any[] } = {};
            for (const pair of data.pairs) {
                if (pair.chainId !== dexChainId) continue;
                const baseAddr = normalizeAddress(pair?.baseToken?.address);
                const quoteAddr = normalizeAddress(pair?.quoteToken?.address);
                if (baseAddr && requested.has(baseAddr)) (tokenPairs[baseAddr] ||= []).push(pair);
                if (quoteAddr && requested.has(quoteAddr)) (tokenPairs[quoteAddr] ||= []).push(pair);
            }

            const addr = normalizeAddress(config.address);
            const pairs = tokenPairs[addr];
            if (!pairs || pairs.length === 0) continue;

            const pricingPair = pickBestStableCounterPairForToken(pairs, dexChainId, config.address)
                ?? pickBestPairForToken(pairs, dexChainId, config.address);
            const linkPair = pickBestPairForToken(pairs, dexChainId, config.address) ?? pricingPair;
            const bestPair = pricingPair ?? linkPair;
            if (!bestPair) continue;

            const aggregated = aggregateTopPools(pairs, 3);

            const change24h = bestPair.priceChange?.h24 || 0;
            const { priceUsd, isDirect } = extractTokenPriceUsdFromPair(bestPair, config.address);
            const marketCapRaw = isDirect && typeof bestPair.marketCap === 'number' ? bestPair.marketCap : 0;
            const fdv = isDirect && typeof bestPair.fdv === 'number' ? bestPair.fdv : undefined;
            const marketCapKind: TokenData['marketCapKind'] = marketCapRaw > 0 ? 'market_cap' : (fdv ? 'fdv' : 'unknown');
            const marketCap = marketCapRaw > 0 ? marketCapRaw : (fdv ?? 0);

            if (normalized.length > 0) seenAddresses.add(normalized);
            tokens.push({
                symbol: config.symbol,
                name: config.name,
                address: config.address,
                contractAddress: config.address,
                price: priceUsd,
                change24h,
                volume24h: bestPair.volume?.h24 || 0,
                liquidity: bestPair.liquidity?.usd || 0,
                marketCap,
                fdv,
                marketCapKind,
                color: getTokenColor(change24h),
                icon: bestPair.info?.imageUrl,
                dexScreenerUrl: typeof linkPair?.url === 'string' ? linkPair.url : undefined,
                dexPairAddress: typeof linkPair?.pairAddress === 'string' ? linkPair.pairAddress : undefined,
                dexScreenerDexId: typeof linkPair?.dexId === 'string' ? linkPair.dexId : undefined,
                dexScreenerBaseSymbol: typeof linkPair?.baseToken?.symbol === 'string' ? linkPair.baseToken.symbol : undefined,
                dexScreenerQuoteSymbol: typeof linkPair?.quoteToken?.symbol === 'string' ? linkPair.quoteToken.symbol : undefined,
            });
        }

        // Update cache
        dexTokensCache[cacheKey] = { data: tokens, timestamp: now };
        
        debugLog('data', `DexScreener: Fetched ${tokens.length}/${tokenConfigs.length} tokens for ${dexChainId}`);
        return tokens;

    } catch (error) {
        console.error(`Failed to fetch DexScreener tokens for ${dexChainId}:`, error);
        return tokens;
    }
}
