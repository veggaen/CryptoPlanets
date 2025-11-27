import { GalaxyData, WeightMode, ChainData } from "@/types/galaxy";
import { fetchChainsTVL } from "./defiLlama";
import { fetchHEXData } from "./dexScreener";
import { fetchBTCStats } from "./coinGecko";
import { dataConfig, CHAIN_TOKENS, CHAIN_NATIVE_SYMBOLS, STABLECOIN_SYMBOLS, WRAPPED_PATTERNS } from "@/config/dataConfig";
import { debugLog } from "@/utils/debug";
import { validateGalaxyData } from "@/utils/validation";

// ===== HELPER FUNCTIONS =====

/** Check if a symbol is a stablecoin */
function isStable(symbol: string): boolean {
    return STABLECOIN_SYMBOLS.has(symbol.toUpperCase());
}

/** Check if a symbol is a wrapped/derivative token */
function isWrapped(symbol: string): boolean {
    return WRAPPED_PATTERNS.has(symbol.toUpperCase());
}

/** Check if a symbol is a chain native token (should be planet, not moon) */
function isChainNative(symbol: string): boolean {
    return CHAIN_NATIVE_SYMBOLS.has(symbol.toUpperCase());
}

export async function loadGalaxyData(weightMode: WeightMode): Promise<GalaxyData> {
    debugLog('data', `Loading galaxy data with weight mode: ${weightMode}`);

    try {
        // 1. Fetch Core Data (Parallel)
        const [btcData, chains, pulseChain] = await Promise.all([
            fetchBTCStats(),
            fetchChainsTVL(),
            import('./pulseChain').then(m => m.getPulseChainData())
        ]);

        // Add PulseChain to chains list if not present
        const allChains = [...chains];
        if (!allChains.find(c => c.id === 'pulsechain')) {
            allChains.push(pulseChain);
        }

        // 2. Sort & Filter Chains
        const weightedChains = allChains
            .map(chain => ({
                ...chain,
                weight: calculateWeight(chain, weightMode),
            }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, dataConfig.maxChains);

        // 3. Fetch Prices and Icons (Batch)
        const geckoIds = weightedChains
            .map(c => c.geckoId)
            .filter((id): id is string => id !== undefined && id !== null);

        debugLog('data', `Fetching prices and icons for ${geckoIds.length} chains`);
        const { fetchCoinsPrices, fetchCoinIcons } = await import('./coinGecko');
        const [chainPrices, chainIcons] = await Promise.all([
            fetchCoinsPrices(geckoIds),
            fetchCoinIcons(geckoIds)
        ]);

        // Apply chain prices and icons to weighted chains
        weightedChains.forEach(chain => {
            if (chain.geckoId) {
                if (chainPrices[chain.geckoId]) {
                    chain.price = chainPrices[chain.geckoId];
                }
                if (chainIcons[chain.geckoId]) {
                    chain.icon = chainIcons[chain.geckoId];
                }
            }
        });

        const totalVal = btcData.marketCap + allChains.reduce((sum, c) => sum + c.tvl, 0);

        // Fetch HEX data from DexScreener (CoinGecko has broken market cap data for HEX)
        const hexData = await fetchHEXData();

        // 4. Fetch Tokens using CURATED CHAIN_TOKENS list
        const chainsWithTokens = await Promise.all(
            weightedChains.map(async (chain) => {
                // Get the curated token list for this chain
                const curatedTokenIds = CHAIN_TOKENS[chain.id];
                
                if (!curatedTokenIds || curatedTokenIds.length === 0) {
                    debugLog('data', `No curated tokens for chain ${chain.id}`);
                    return { ...chain, tokens: [] };
                }

                // Filter out HEX IDs - we'll add HEX from DexScreener separately
                const tokenIdsWithoutHex = curatedTokenIds.filter(id => 
                    id !== 'hex' && id !== 'hex-pulsechain'
                );

                // Fetch tokens from CoinGecko using the curated IDs
                let tokens: any[] = [];
                if (tokenIdsWithoutHex.length > 0) {
                    debugLog('data', `Fetching ${tokenIdsWithoutHex.length} curated tokens for ${chain.id}`);
                    const { fetchSpecificTokens } = await import("./coinGecko");
                    tokens = await fetchSpecificTokens(tokenIdsWithoutHex);
                    debugLog('data', `Got ${tokens.length} tokens for ${chain.id}`);
                }

                // Apply final safety filters (in case CoinGecko returns something weird)
                tokens = tokens.filter(t => {
                    const symbol = (t.symbol || "").toUpperCase();
                    if (!symbol) return false;
                    if (isStable(symbol)) return false;
                    if (isWrapped(symbol)) return false;
                    if (isChainNative(symbol)) return false;
                    return true;
                });

                // Sort by marketCap descending
                tokens = tokens.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

                // Limit to configured max
                tokens = tokens.slice(0, dataConfig.tokensPerChain);

                // ===== ADD HEX FROM DEXSCREENER =====
                // CoinGecko has broken market_cap data for HEX, so we use DexScreener
                if (chain.id === 'ethereum' && hexData.eHEX) {
                    // Remove any existing HEX entry (shouldn't happen with curated list, but safety check)
                    tokens = tokens.filter(t => t.symbol?.toUpperCase() !== 'HEX');
                    // Add eHEX at the front (high priority)
                    tokens.unshift(hexData.eHEX);
                    console.log('[HEX] ✅ Added eHEX to Ethereum:', hexData.eHEX.symbol, hexData.eHEX.marketCap);
                } else if (chain.id === 'pulsechain' && hexData.pHEX) {
                    tokens = tokens.filter(t => t.symbol?.toUpperCase() !== 'HEX');
                    tokens.unshift(hexData.pHEX);
                    console.log('[HEX] ✅ Added pHEX to PulseChain:', hexData.pHEX.symbol, hexData.pHEX.marketCap);
                }

                console.log(`[${chain.id.toUpperCase()}] Final tokens:`, tokens.map(t => t.symbol).join(', '));

                return { ...chain, tokens };
            })
        );

        // 5. Calculate Dominance
        btcData.dominance = (btcData.marketCap / totalVal) * 100;
        chainsWithTokens.forEach(c => {
            c.dominance = (c.tvl / totalVal) * 100;
        });

        const galaxyData: GalaxyData = {
            btc: btcData,
            chains: chainsWithTokens,
            lastUpdated: new Date(),
            totalMarketCap: totalVal,
            metric: weightMode,
        };

        validateGalaxyData(galaxyData);
        debugLog('data', `Loaded ${galaxyData.chains.length} chains with real data`);

        return galaxyData;

    } catch (error) {
        console.error('[DATA ERROR]', error);
        return getFallbackData();
    }
}

function calculateWeight(chain: ChainData, mode: WeightMode): number {
    switch (mode) {
        case 'TVL': return chain.tvl;
        // Use TVL as proxy for Chain Market Cap if not explicitly available (DefiLlama doesn't give Chain MC easily)
        // But for ordering, TVL is often a good enough proxy for "DeFi Size". 
        // If we had real Chain MC (e.g. ETH MC), we should use it.
        // We do fetch 'price' for the chain. If we had circulating supply, we could calc MC.
        // For now, let's stick to TVL for chains, but maybe boost it?
        // Actually, let's use TVL as the primary weight for "Size" in the galaxy unless we have a better metric.
        case 'MarketCap': return chain.tvl;
        case 'Volume24h': return chain.volume24h;
        case 'Change24h': return Math.abs(chain.change24h);
        default: return chain.tvl;
    }
}

function getFallbackData(): GalaxyData {
    return {
        btc: { price: 60000, change24h: 0, dominance: 50, marketCap: 1000000000000, volume24h: 0 },
        chains: [],
        lastUpdated: new Date(),
        totalMarketCap: 2000000000000,
        metric: "TVL"
    };
}
