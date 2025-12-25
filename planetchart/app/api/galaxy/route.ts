/**
 * Galaxy Data API Route - Centralized Caching Layer
 * 
 * This route is the ONLY place that calls external APIs (CoinGecko, DefiLlama, DexScreener).
 * All clients fetch from this endpoint, which returns cached data to avoid rate limits.
 * 
 * HOW TO ADJUST:
 * - CACHE_TTL_MS: How long data stays fresh (default 60 seconds)
 * - STALE_TTL_MS: How long stale data can be served if API fails (default 5 minutes)
 * 
 * CACHE BEHAVIOR:
 * 1. If cache is fresh (< CACHE_TTL_MS old) → return cached data immediately
 * 2. If cache is stale but API fails → return stale cache with "stale" flag
 * 3. If no cache exists and API fails → return error
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GalaxyData, WeightMode, ChainData, TokenData, BTCData } from '@/types/galaxy';
import type { PrimaryProvider } from '@/types/providers';
import { normalizePrimaryProvider } from '@/types/providers';
import { mergeTokenFromProvider } from '@/utils/providerMerge';
import crypto from 'crypto';

// ===== CACHE CONFIGURATION =====
const CACHE_TTL_MS = 60_000;        // 60 seconds - how often to refresh from external APIs
const STALE_TTL_MS = 300_000;       // 5 minutes - max age for stale cache fallback
const CACHE_KEY_VERSION = 5;

// ===== OWNER-ONLY FEATURE GATING (CoinMarketCap) =====
const OWNER_COOKIE_NAME = 'planetchart_owner';

function getOwnerSecret(): string {
    return process.env.PLANETCHART_OWNER_KEY || process.env.OWNER_KEY || '';
}

function computeOwnerCookieValue(secret: string): string {
    return crypto.createHmac('sha256', secret).update('owner').digest('hex');
}

function isOwnerRequest(request: NextRequest): boolean {
    const secret = getOwnerSecret();
    if (!secret) return false;
    const cookie = request.cookies.get(OWNER_COOKIE_NAME)?.value;
    if (!cookie) return false;
    return cookie === computeOwnerCookieValue(secret);
}

// ===== LIGHTWEIGHT IN-MEMORY RATE LIMIT =====
type RateEntry = { windowStart: number; count: number };
const rateLimitByClient: Map<string, RateEntry> = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 120;

function getClientKey(request: NextRequest): string {
    const xfwd = request.headers.get('x-forwarded-for');
    const ip = xfwd ? xfwd.split(',')[0].trim() : (request.headers.get('x-real-ip') || 'unknown');
    const ua = request.headers.get('user-agent') || 'unknown';
    return `${ip}|${ua}`;
}

function checkRateLimit(request: NextRequest): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const key = getClientKey(request);
    const now = Date.now();
    const current = rateLimitByClient.get(key);

    if (!current || now - current.windowStart >= RATE_WINDOW_MS) {
        rateLimitByClient.set(key, { windowStart: now, count: 1 });
        return { ok: true };
    }

    current.count += 1;
    if (current.count <= RATE_MAX_REQUESTS) return { ok: true };

    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.windowStart)) / 1000));
    return { ok: false, retryAfterSeconds };
}

function isValidWeightMode(input: unknown): input is WeightMode {
    return input === 'TVL' || input === 'MarketCap' || input === 'Volume24h' || input === 'Change24h';
}

// ===== IN-MEMORY CACHE =====
interface CacheEntry {
    data: GalaxyData;
    timestamp: number;
    source: 'api' | 'cache' | 'stale-cache';
}

// Module-level cache - persists across requests in the same Node.js process
const galaxyCache: Map<string, CacheEntry> = new Map();

// Lock to prevent multiple simultaneous API calls.
// IMPORTANT: this must be keyed per request variant (mode/basis/filters),
// otherwise parallel requests can receive/cached the wrong variant.
const fetchInProgressByKey: Map<string, Promise<GalaxyData>> = new Map();

// ===== HELPER: Check if cache is fresh =====
function isCacheFresh(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

function isCacheUsable(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < STALE_TTL_MS;
}

// ===== FILTER OPTIONS TYPE =====
interface FilterOptions {
    hideStables: boolean;
    hideWrapped: boolean;
}

type VolumeSource = 'dex' | 'spot';

// ===== CORE DATA FETCHING (calls external APIs) =====
async function fetchGalaxyDataFromAPIs(weightMode: WeightMode, filters: FilterOptions, volumeSource: VolumeSource, primaryProvider: PrimaryProvider): Promise<GalaxyData> {
    // Import services dynamically to avoid circular dependencies
    const { fetchChainsTVL, fetchDexTotal24h, fetchDexChainVolume24h } = await import('@/services/defiLlama');
    const { fetchHEXData, fetchDexScreenerTokensByAddress } = await import('@/services/dexScreener');
    const { fetchBTCStats, fetchGlobalMarketStats, fetchSpecificTokens, fetchCoinsPrices, fetchCoinIcons, fetchCoinMarketCaps, fetchCoinMarketSnapshots } = await import('@/services/coinGecko');
    const { getPulseChainData } = await import('@/services/pulseChain');
    const { dataConfig, CHAIN_TOKENS, DEXSCREENER_TOKENS, STABLECOIN_SYMBOLS, WRAPPED_PATTERNS, CHAIN_NATIVE_SYMBOLS, DEFAULT_FILTERS } = await import('@/config/dataConfig');

    // Helper functions (respect filter settings)
    const isStable = (symbol: string): boolean => STABLECOIN_SYMBOLS.has(symbol.toUpperCase());
    const isWrapped = (symbol: string): boolean => {
        const upperSymbol = symbol.toUpperCase();
        // Check exceptions first (always show these liquid staking tokens)
        if (DEFAULT_FILTERS.wrappedExceptions.includes(upperSymbol)) return false;
        return WRAPPED_PATTERNS.has(upperSymbol);
    };
    const isChainNative = (symbol: string): boolean => CHAIN_NATIVE_SYMBOLS.has(symbol.toUpperCase());

    const calculateWeight = (chain: ChainData, mode: WeightMode): number => {
        switch (mode) {
            case 'TVL': return chain.tvl;
            case 'MarketCap': {
                return typeof chain.marketCap === 'number' && chain.marketCap > 0 ? chain.marketCap : 0;
            }
            case 'Volume24h': return chain.volume24h;
            case 'Change24h': return Math.abs(chain.change24h);
            default: return chain.tvl;
        }
    };

    const isDexVolume = weightMode === 'Volume24h' && volumeSource === 'dex';
    const isSpotVolume = weightMode === 'Volume24h' && volumeSource === 'spot';

    const cgPlatformKeysByChainId: Record<string, string[]> = {
        ethereum: ['ethereum'],
        solana: ['solana'],
        bnb: ['binance-smart-chain', 'bsc'],
        polygon: ['polygon-pos', 'polygon'],
        avalanche: ['avalanche'],
        arbitrum: ['arbitrum-one', 'arbitrum'],
        optimism: ['optimistic-ethereum', 'optimism'],
        base: ['base'],
        sui: ['sui'],
        ton: ['the-open-network', 'ton'],
    };

    const nonEvmChainIds = new Set<string>(['solana', 'sui', 'ton']);
    const isNonEvmChain = (chainId: string): boolean => nonEvmChainIds.has(chainId);

    const normalizeAddress = (input: unknown): string => {
        if (typeof input !== 'string') return '';
        const trimmed = input.trim();
        if (!trimmed) return '';
        // EVM addresses are case-insensitive.
        if (/^0x[a-fA-F0-9]{6,}$/.test(trimmed)) return trimmed.toLowerCase();
        // Non-EVM addresses (Solana/Sui/TON) are case-sensitive.
        return trimmed;
    };
    const looksLikeEvmAddress = (input: unknown): boolean => /^0x[a-fA-F0-9]{40}$/.test(typeof input === 'string' ? input.trim() : '');

    const resolveContractAddressForChain = (token: TokenData, chainId: string): string | null => {
        const direct = typeof token.contractAddress === 'string' ? token.contractAddress.trim() : '';
        if (direct.length > 0) return direct;

        const keys = cgPlatformKeysByChainId[chainId] ?? [];
        if (!token.platformAddresses || keys.length === 0) return null;

        for (const key of keys) {
            const addr = token.platformAddresses[key];
            if (typeof addr === 'string' && addr.trim().length > 0) return addr.trim();
        }

        return null;
    };

    async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
        const results: R[] = new Array(items.length);
        let nextIndex = 0;

        async function worker(): Promise<void> {
            while (true) {
                const current = nextIndex++;
                if (current >= items.length) return;
                results[current] = await fn(items[current]);
            }
        }

        const workerCount = Math.max(1, Math.min(concurrency, items.length));
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
        return results;
    }

    console.log('[API] Fetching fresh galaxy data from external APIs...');

    // 1. Fetch Core Data (Parallel)
    const [btcData, globalStats, chains, pulseChain] = await Promise.all([
        fetchBTCStats(),
        fetchGlobalMarketStats(),
        fetchChainsTVL(),
        getPulseChainData()
    ]);

    // Add PulseChain to chains list if not present
    const allChains = [...chains];
    if (!allChains.find(c => c.id === 'pulsechain')) {
        allChains.push(pulseChain);
    }

    // DefiLlama may already include PulseChain but without CoinGecko metadata.
    // Ensure PulseChain has a geckoId so we can fetch price/marketCap for PLS.
    {
        const pls = allChains.find(c => c.id === 'pulsechain');
        if (pls) {
            if (!pls.geckoId) pls.geckoId = pulseChain.geckoId;
            if (!pls.symbol) pls.symbol = pulseChain.symbol;
            if (!pls.name) pls.name = pulseChain.name;
            if (!pls.color) pls.color = pulseChain.color;
        }
    }

    // Extra MarketCap-only "planets" (not DefiLlama chains).
    // IMPORTANT: we do not guess TVL/volume here. These are asset planets sized by MarketCap only.
    const extraMarketCapPlanets: ChainData[] = [
        {
            id: 'xrp',
            name: 'XRP',
            symbol: 'XRP',
            weight: 0,
            tvl: 0,
            tvlKind: 'unknown',
            change24h: 0,
            change24hKind: 'unknown',
            volume24h: 0,
            volume24hKind: 'unknown',
            dominance: 0,
            color: 'from-gray-500 to-gray-700',
            tokens: [],
            geckoId: 'ripple',
        },
    ];

    // 2. Select candidate chains by TVL (stable selection), with a small MarketCap-only allowlist.
    const tvlTopChains = allChains
        .slice()
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, dataConfig.maxChains);

    const candidateChains: ChainData[] = weightMode === 'MarketCap'
        ? (() => {
            const merged = [...tvlTopChains];
            for (const extra of extraMarketCapPlanets) {
                if (!merged.find(c => c.id === extra.id)) merged.push(extra);
            }
            return merged;
        })()
        : tvlTopChains;

    let weightedChains = candidateChains.map(chain => ({
        ...chain,
        weight: calculateWeight(chain, weightMode),
    }));

    // 3. Fetch Prices, Market Caps, and Icons (Batch - single API call for all chains)
    const geckoIds = weightedChains
        .map(c => c.geckoId)
        .filter((id): id is string => id !== undefined && id !== null);

    console.log(`[API] Fetching prices/icons/marketcaps for ${geckoIds.length} chains in single batch`);
    const [chainPrices, chainIcons, chainMarketCaps, chainSnapshots] = await Promise.all([
        fetchCoinsPrices(geckoIds),
        fetchCoinIcons(geckoIds),
        fetchCoinMarketCaps(geckoIds),
        fetchCoinMarketSnapshots(geckoIds)
    ]);

    // Apply chain prices, icons, and MARKET CAPS
    weightedChains.forEach(chain => {
        if (chain.geckoId) {
            if (chainPrices[chain.geckoId]) chain.price = chainPrices[chain.geckoId];
            if (chainIcons[chain.geckoId]) chain.icon = chainIcons[chain.geckoId];
            if (typeof chainMarketCaps[chain.geckoId] === 'number') chain.marketCap = chainMarketCaps[chain.geckoId];

            const snap = chainSnapshots[chain.geckoId];
            if (snap) {
                if (typeof snap.fdv === 'number') chain.fdv = snap.fdv;
                if (typeof snap.change24h === 'number') {
                    chain.change24h = snap.change24h;
                    chain.change24hKind = 'price';
                }

                if (isSpotVolume && typeof snap.volume24h === 'number' && snap.volume24h >= 0) {
                    chain.volume24h = snap.volume24h;
                    chain.volume24hKind = 'asset';
                }
            }
        }
    });

    // Recompute weights after coin snapshots are applied.
    weightedChains.forEach(chain => {
        if (weightMode === 'MarketCap') {
            const capRaw = chain.geckoId && typeof chainMarketCaps[chain.geckoId] === 'number'
                ? chainMarketCaps[chain.geckoId]
                : 0;
            const cap = (typeof capRaw === 'number' && capRaw > 0) ? capRaw : 0;
            const fdv = (typeof chain.fdv === 'number' && chain.fdv > 0) ? chain.fdv : 0;

            if (cap > 0) {
                chain.marketCap = cap;
                chain.marketCapKind = 'market_cap';
            } else if (fdv > 0) {
                // CoinGecko sometimes omits market_cap for smaller/newer assets but provides FDV.
                // Use FDV as a cap-like sizing metric and label it accordingly.
                chain.marketCap = fdv;
                chain.marketCapKind = 'fdv';
            } else {
                chain.marketCapKind = 'unknown';
            }
        }

        chain.weight = calculateWeight(chain, weightMode);
    });

    // In MarketCap mode, rank planets by the selected cap basis.
    // This allows MarketCap-only asset planets (e.g. XRP) to appear without polluting TVL/Volume modes.
    if (weightMode === 'MarketCap') {
        weightedChains = weightedChains
            .slice()
            .sort((a, b) => (b.weight || 0) - (a.weight || 0))
            .slice(0, dataConfig.maxChains);
    }

    // Calculate total value (for global dominance, use global total market cap when available)
    const computedSubsetTotal = weightMode === 'MarketCap'
        ? btcData.marketCap + weightedChains.reduce((sum, c) => {
            const cap = c.marketCap;
            return sum + (typeof cap === 'number' && cap > 0 ? cap : 0);
        }, 0)
        : btcData.marketCap + allChains.reduce((sum, c) => sum + c.tvl, 0);

    const totalVal = typeof globalStats?.totalMarketCapUsd === 'number' && globalStats.totalMarketCapUsd > 0
        ? globalStats.totalMarketCapUsd
        : computedSubsetTotal;

    // DEX total volume (24h) used for Volume24h mode (DEX).
    const dexTotal24h = isDexVolume ? await fetchDexTotal24h() : null;

    // Fetch HEX data from DexScreener (CoinGecko has broken market cap data for HEX)
    const hexData = await fetchHEXData();

    // 4. Fetch ALL tokens in ONE batch call to minimize API requests
    const allTokenIds: string[] = [];
    const chainTokenMap: Map<string, string[]> = new Map();

    weightedChains.forEach(chain => {
        const curatedTokenIds = CHAIN_TOKENS[chain.id];
        if (curatedTokenIds && curatedTokenIds.length > 0) {
            // Filter out HEX IDs - we add from DexScreener
            const tokenIds = curatedTokenIds.filter(id => id !== 'hex' && id !== 'hex-pulsechain');
            chainTokenMap.set(chain.id, tokenIds);
            allTokenIds.push(...tokenIds);
        }
    });

    // Single batch fetch for ALL tokens across ALL chains
    const uniqueTokenIds = [...new Set(allTokenIds)];
    console.log(`[API] Fetching ${uniqueTokenIds.length} tokens in single batch call`);
    
    let allTokens: TokenData[] = [];
    if (uniqueTokenIds.length > 0) {
        allTokens = await fetchSpecificTokens(uniqueTokenIds);
        console.log(`[API] Got ${allTokens.length} tokens from CoinGecko`);

        // If CoinGecko fails or rate-limits, we can get an empty array.
        // Returning "0 moons" is worse UX than serving stale cache, so treat this as a fetch failure.
        if (allTokens.length === 0) {
            throw new Error('CoinGecko token fetch returned 0 tokens (likely rate limit / API issue)');
        }
        
        // Log which tokens were not found
        const foundIds = new Set(allTokens.map(t => t.address));
        const missingIds = uniqueTokenIds.filter(id => !foundIds.has(id));
        if (missingIds.length > 0) {
            console.log(`[API] ⚠️ Missing tokens (wrong CoinGecko ID?): ${missingIds.join(', ')}`);
        }
    }

    // Create lookup map for tokens
    const tokenLookup = new Map(allTokens.map(t => [t.address, t])); // address = coingecko ID

    // 5. Pre-fetch DexScreener tokens by address (curated + auto in TVL mode)
    const dexTokensMap: Map<string, TokenData[]> = new Map();
    const dexChainIdMap: Record<string, string> = {
        pulsechain: 'pulsechain',
        fantom: 'fantom',
        ethereum: 'ethereum',
        bnb: 'bsc',
        bsc: 'bsc',
        arbitrum: 'arbitrum',
        polygon: 'polygon',
        base: 'base',
        avalanche: 'avalanche',
        solana: 'solana',
        sui: 'sui',
        ton: 'ton',
    };

    type DexFetchItem = { chainId: string; dexChainId: string; tokenConfigs: Array<{ address: string; symbol: string; name: string }> };
    const dexFetchItems: DexFetchItem[] = [];

    for (const chain of weightedChains) {
        const curated = DEXSCREENER_TOKENS[chain.id] ?? [];
        const tokenConfigs: Array<{ address: string; symbol: string; name: string }> = [...curated];

        // Liquidity is used in the Details panel, so enrich displayed moons in ALL modes.
        // (TVL mode also depends on it for sizing/sorting.)
        {
            const chainTokenIds = chainTokenMap.get(chain.id) || [];
            for (const id of chainTokenIds.slice(0, dataConfig.tokensPerChain)) {
                const token = tokenLookup.get(id);
                if (!token) continue;

                const symbol = (token.symbol || '').toUpperCase();
                if (!symbol) continue;
                if (isChainNative(symbol)) continue;
                if (filters.hideStables && isStable(symbol)) continue;
                if (filters.hideWrapped && isWrapped(symbol)) continue;

                const resolved = resolveContractAddressForChain(token, chain.id);
                if (!resolved) continue;

                // For EVM, ensure it's a real 0x address. For non-EVM (e.g. Solana), accept non-empty.
                if (!isNonEvmChain(chain.id) && !looksLikeEvmAddress(resolved)) continue;

                tokenConfigs.push({
                    address: resolved,
                    symbol: token.symbol,
                    name: token.name,
                });
            }
        }

        // Dedupe by address.
        const deduped: Array<{ address: string; symbol: string; name: string }> = [];
        const seen = new Set<string>();
        for (const cfg of tokenConfigs) {
            const addr = normalizeAddress(cfg.address);
            if (!addr) continue;
            if (seen.has(addr)) continue;
            seen.add(addr);
            deduped.push(cfg);
        }

        // Only fetch if we have something meaningful (curated OR auto-TVl).
        if (deduped.length === 0) continue;

        dexFetchItems.push({
            chainId: chain.id,
            dexChainId: dexChainIdMap[chain.id] || chain.id,
            tokenConfigs: deduped,
        });
    }

    const dexResults = await mapWithConcurrency(dexFetchItems, 3, async (item) => {
        try {
            const tokens = await fetchDexScreenerTokensByAddress(item.dexChainId, item.tokenConfigs);
            return { chainId: item.chainId, tokens };
        } catch (error) {
            console.warn(`[API] Failed to fetch DexScreener tokens for ${item.chainId}:`, error);
            return { chainId: item.chainId, tokens: [] as TokenData[] };
        }
    });

    for (const result of dexResults) {
        dexTokensMap.set(result.chainId, result.tokens);
    }

    // 6. Assign tokens to chains
    let chainsWithTokens = await Promise.all(weightedChains.map(async (chain) => {
        const chainTokenIds = chainTokenMap.get(chain.id) || [];
        
        let tokens = chainTokenIds
            .map(id => tokenLookup.get(id))
            .filter((t): t is TokenData => t !== undefined);

        // Attach resolved contract address for this chain (when possible).
        tokens = tokens.map((t) => {
            const contractAddress = resolveContractAddressForChain(t, chain.id);
            return contractAddress ? { ...t, contractAddress } : t;
        });

        // Apply safety filters based on filter options
        tokens = tokens.filter(t => {
            const symbol = (t.symbol || "").toUpperCase();
            if (!symbol) return false;
            // Always filter chain natives (they are planets, not moons)
            if (isChainNative(symbol)) return false;
            // Optionally filter stablecoins
            if (filters.hideStables && isStable(symbol)) return false;
            // Optionally filter wrapped tokens
            if (filters.hideWrapped && isWrapped(symbol)) return false;
            return true;
        });

        // For MarketCap mode, enforce circulating market cap only (no FDV mixing).
        if (weightMode === 'MarketCap') {
            tokens = tokens.map(token => {
                const cap = token.marketCapKind === 'market_cap' && token.marketCap > 0 ? token.marketCap : 0;
                return {
                    ...token,
                    marketCap: cap,
                    marketCapKind: cap > 0 ? 'market_cap' : 'unknown',
                };
            });
        }

        // Merge in DexScreener tokens (liquidity/DEX metadata) before sorting.
        // This is critical for TVL mode where token TVL ~= DEX liquidity.
        const dexTokens = dexTokensMap.get(chain.id) || [];
        if (dexTokens.length > 0) {
            const filteredDexTokens = dexTokens.filter(t => {
                const symbol = (t.symbol || "").toUpperCase();
                if (!symbol) return false;
                if (isChainNative(symbol)) return false;
                if (filters.hideStables && isStable(symbol)) return false;
                if (filters.hideWrapped && isWrapped(symbol)) return false;
                return true;
            });

            const bySymbol = new Map(tokens.map((t, idx) => [(t.symbol || '').toUpperCase(), idx] as const));
            const byContract = new Map(tokens
                .map((t, idx) => {
                    const addr = normalizeAddress(t.contractAddress);
                    return addr ? ([addr, idx] as const) : null;
                })
                .filter((x): x is readonly [string, number] => x !== null)
            );

            for (const dexToken of filteredDexTokens) {
                const symbol = (dexToken.symbol || '').toUpperCase();
                const dexAddr = normalizeAddress(dexToken.contractAddress || dexToken.address);
                const existingIndex = (dexAddr ? byContract.get(dexAddr) : undefined) ?? bySymbol.get(symbol);

                if (typeof existingIndex === 'number') {
                    const existing = tokens[existingIndex];

                    // Prefer a real contract address when DexScreener provides one for the token.
                    const contractAddress = (looksLikeEvmAddress(dexToken.address) || isNonEvmChain(chain.id))
                        ? dexToken.address
                        : (existing.contractAddress || undefined);

                    // Merge numeric fields according to user-selected primary provider.
                    const merged = mergeTokenFromProvider(existing, dexToken, 'dexscreener', primaryProvider);
                    tokens[existingIndex] = { ...merged, contractAddress };
                } else {
                    tokens.push({
                        ...dexToken,
                        contractAddress: dexToken.contractAddress || dexToken.address,
                    });
                    bySymbol.set(symbol, tokens.length - 1);
                    if (dexAddr) byContract.set(dexAddr, tokens.length - 1);
                }
            }

            if (filteredDexTokens.length > 0) {
                console.log(`[API] ${chain.id}: Merged ${filteredDexTokens.length} DexScreener tokens (${filteredDexTokens.map(t => t.symbol).join(', ')})`);
            }
        }

        const tokenSortValue = (token: TokenData): number => {
            if (weightMode === 'TVL') return typeof token.liquidity === 'number' ? token.liquidity : 0;
            if (weightMode === 'Volume24h') return typeof token.volume24h === 'number' ? token.volume24h : 0;
            // For other modes (Change*, etc.) keep ordering stable by cap.
            return typeof token.marketCap === 'number' ? token.marketCap : 0;
        };

        // Sort by the active metric and limit.
        tokens = tokens
            .sort((a, b) => (tokenSortValue(b) - tokenSortValue(a)) || ((b.marketCap || 0) - (a.marketCap || 0)))
            .slice(0, dataConfig.tokensPerChain);

        // Add HEX from DexScreener (force include and prioritize).
        if (chain.id === 'ethereum' && hexData.eHEX) {
            tokens = tokens.filter(t => t.symbol?.toUpperCase() !== 'HEX');
            tokens.unshift(hexData.eHEX);
        } else if (chain.id === 'pulsechain' && hexData.pHEX) {
            tokens = tokens.filter(t => t.symbol?.toUpperCase() !== 'HEX');
            tokens.unshift(hexData.pHEX);
        }

        // Log token count per chain
        console.log(`[API] ${chain.id}: ${tokens.length} tokens (${tokens.map(t => t.symbol).join(', ')})`);

        // Fill per-chain volume (24h) only when Volume24h is active.
        // - DEX source: DefiLlama chain DEX volume
        // - Spot source: CoinGecko total_volume for the chain's native token
        const dexVol = isDexVolume ? await fetchDexChainVolume24h(chain.name) : null;
        const nextChain: ChainData = {
            ...chain,
            volume24h: isDexVolume
                ? (typeof dexVol === 'number' ? dexVol : chain.volume24h)
                : chain.volume24h,
            volume24hKind: weightMode === 'Volume24h'
                ? (isDexVolume
                    ? (typeof dexVol === 'number' ? 'dex' : 'unknown')
                    : (isSpotVolume ? (chain.volume24hKind === 'asset' ? 'asset' : 'unknown') : 'unknown'))
                : undefined,
            tokens,
        };

        // When MarketCap mode is active, set the displayed/sizing cap explicitly to the selected basis.
        if (weightMode === 'MarketCap') {
            const cap = (typeof nextChain.marketCap === 'number' && nextChain.marketCap > 0) ? nextChain.marketCap : 0;
            const fdv = (typeof nextChain.fdv === 'number' && nextChain.fdv > 0) ? nextChain.fdv : 0;

            // Preserve FDV labeling if upstream logic selected FDV as the only reliable cap-like metric.
            if (nextChain.marketCapKind === 'fdv' && fdv > 0) {
                nextChain.marketCap = fdv;
                nextChain.marketCapKind = 'fdv';
                nextChain.weight = fdv;
            } else

            if (cap > 0) {
                nextChain.marketCap = cap;
                nextChain.marketCapKind = 'market_cap';
                nextChain.weight = cap;
            } else if (fdv > 0) {
                nextChain.marketCap = fdv;
                nextChain.marketCapKind = 'fdv';
                nextChain.weight = fdv;
            } else {
                nextChain.marketCap = 0;
                nextChain.marketCapKind = 'unknown';
                nextChain.weight = 0;
            }
        }

        if (weightMode === 'Volume24h') {
            nextChain.weight = nextChain.volume24h;
        }

        return nextChain;
    }));

    // 6b. Optionally apply CoinMarketCap token quotes when user selects it as primary.
    // This is credit-sensitive, so the underlying service caches for a longer TTL.
    if (primaryProvider === 'coinmarketcap') {
        const { fetchCoinMarketCapQuotesBySymbols } = await import('@/services/coinMarketCap');

        const symbols = Array.from(new Set(
            chainsWithTokens
                .flatMap((c) => c.tokens)
                .map((t) => (t.symbol || '').toUpperCase())
                .filter(Boolean)
        ));

        const cmcQuotes = await fetchCoinMarketCapQuotesBySymbols(symbols);

        if (cmcQuotes.size > 0) {
            chainsWithTokens = chainsWithTokens.map((chain) => ({
                ...chain,
                tokens: chain.tokens.map((token) => {
                    const q = cmcQuotes.get((token.symbol || '').toUpperCase());
                    return q ? mergeTokenFromProvider(token, q, 'coinmarketcap', primaryProvider) : token;
                }),
            }));
        }
    }

    // 7. Calculate Dominance (GLOBAL market share, when available)
    if (typeof globalStats?.btcDominance === 'number' && globalStats.btcDominance >= 0) {
        btcData.dominance = globalStats.btcDominance;
    } else {
        btcData.dominance = (btcData.marketCap / totalVal) * 100;
    }

    // Chain dominance should represent market-cap share when we have market caps.
    chainsWithTokens.forEach(c => {
        const cap = (typeof c.marketCap === 'number' && c.marketCap > 0) ? c.marketCap : 0;
        c.dominance = cap > 0 ? (cap / totalVal) * 100 : 0;
    });

    // In Volume24h mode:
    // - DEX source uses DefiLlama DEX totals (dex_total)
    // - Spot source uses CoinGecko BTC total_volume (asset)
    const volume24hKind: BTCData['volume24hKind'] = isDexVolume ? 'dex_total' : 'asset';
    const btcForResponse: BTCData = {
        ...btcData,
        volume24h: isDexVolume && typeof dexTotal24h === 'number' ? dexTotal24h : btcData.volume24h,
        volume24hKind,
    };

    const galaxyData: GalaxyData = {
        btc: btcForResponse,
        chains: chainsWithTokens,
        lastUpdated: new Date(),
        totalMarketCap: totalVal,
        metric: weightMode,
    };

    // Type is already validated by TypeScript, no runtime assertion needed
    console.log(`[API] Successfully fetched galaxy data with ${galaxyData.chains.length} chains`);

    return galaxyData;
}

// ===== API ROUTE HANDLER =====
export async function GET(request: NextRequest) {
    const limit = checkRateLimit(request);
    if (!limit.ok) {
        return NextResponse.json(
            { success: false, error: 'Rate limit exceeded' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const searchParams = request.nextUrl.searchParams;
    const rawMode = searchParams.get('mode') || 'MarketCap';
    const weightMode: WeightMode = isValidWeightMode(rawMode) ? rawMode : 'MarketCap';

    const primaryProviderRequested = normalizePrimaryProvider(searchParams.get('primaryProvider'));
    const isOwner = isOwnerRequest(request);

    // CoinMarketCap is owner-only to protect credits and avoid redistribution risk.
    const coinMarketCapLocked = primaryProviderRequested === 'coinmarketcap' && !isOwner;
    const primaryProviderUsed: PrimaryProvider = coinMarketCapLocked ? 'coingecko' : primaryProviderRequested;

    const volumeSourceRaw = searchParams.get('volumeSource');
    const volumeSource: VolumeSource = volumeSourceRaw === 'spot' ? 'spot' : 'dex';
    
    // Filter params (default: hide stablecoins and wrapped tokens)
    const hideStables = searchParams.get('hideStables') !== 'false';
    const hideWrapped = searchParams.get('hideWrapped') !== 'false';
    
    // Create cache key that includes filter state + Volume24h source
    const cacheKey = `galaxy-v${CACHE_KEY_VERSION}-${weightMode}-vol:${weightMode === 'Volume24h' ? volumeSource : 'n/a'}-stables:${hideStables}-wrapped:${hideWrapped}-primary:${primaryProviderUsed}`;
    const filters: FilterOptions = { hideStables, hideWrapped };

    const meta: GalaxyData['meta'] = {
        primaryProviderRequested,
        primaryProviderUsed,
        lockedPrimaryProvider: coinMarketCapLocked ? 'coinmarketcap' : undefined,
        lockReason: coinMarketCapLocked ? 'CoinMarketCap is owner-only (credit/plan protection).' : undefined,
    };

    try {
        // Check cache first
        const cached = galaxyCache.get(cacheKey);

        if (cached && isCacheFresh(cached)) {
            // Fresh cache - return immediately
            console.log(`[API] Returning fresh cached data (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
            return NextResponse.json({
                success: true,
                data: { ...cached.data, meta },
                source: 'cache',
                cacheAge: Date.now() - cached.timestamp,
                cacheTTL: CACHE_TTL_MS,
            });
        }

        // Cache is stale or missing - need to fetch fresh data
        // Use a keyed lock to prevent multiple simultaneous API calls for the same variant.
        const inFlight = fetchInProgressByKey.get(cacheKey);
        if (!inFlight) {
            const next = fetchGalaxyDataFromAPIs(weightMode, filters, volumeSource, primaryProviderUsed)
                .finally(() => { fetchInProgressByKey.delete(cacheKey); });
            fetchInProgressByKey.set(cacheKey, next);
        }

        try {
            const freshData = await fetchInProgressByKey.get(cacheKey);
            if (!freshData) throw new Error('Internal error: missing in-flight fetch promise');
            
            // Update cache
            galaxyCache.set(cacheKey, {
                data: freshData,
                timestamp: Date.now(),
                source: 'api',
            });

            const withMeta: GalaxyData = { ...freshData, meta };

            return NextResponse.json({
                success: true,
                data: withMeta,
                source: 'api',
                cacheAge: 0,
                cacheTTL: CACHE_TTL_MS,
            });
        } catch (apiError) {
            console.error('[API] External API error:', apiError);

            // API failed - try to return stale cache
            if (cached && isCacheUsable(cached)) {
                console.log(`[API] Returning stale cache (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
                return NextResponse.json({
                    success: true,
                    data: { ...cached.data, meta },
                    source: 'stale-cache',
                    cacheAge: Date.now() - cached.timestamp,
                    cacheTTL: CACHE_TTL_MS,
                    warning: 'Using stale data due to API error',
                });
            }

            // No usable cache - return error
            throw apiError;
        }
    } catch (error) {
        console.error('[API] Fatal error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            source: 'error',
        }, { status: 500 });
    }
}

// Enable edge caching with Next.js
export const revalidate = 60; // ISR: revalidate every 60 seconds
