import { GalaxyData, WeightMode, ChainData } from "@/types/galaxy";
import { fetchChainsTVL } from "./defiLlama";
import { fetchTokensForChain } from "./dexScreener";
import { fetchBTCStats } from "./coinGecko";
import { dataConfig } from "@/config/dataConfig";
import { debugLog } from "@/utils/debug";
import { validateGalaxyData } from "@/utils/validation";

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

        // 3. Fetch Prices (Batch)
        const geckoIds = weightedChains
            .map(c => c.geckoId)
            .filter((id): id is string => id !== undefined && id !== null);

        debugLog('data', `Fetching prices for ${geckoIds.length} chains`);
        const { fetchCoinsPrices } = await import('./coinGecko');
        const chainPrices = await fetchCoinsPrices(geckoIds);

        // Update chain prices
        const totalVal = btcData.marketCap + allChains.reduce((sum, c) => sum + c.tvl, 0);

        // 4. Fetch Tokens (Parallel per chain)
        const chainsWithTokens = await Promise.all(
            weightedChains.map(async (chain) => {
                let tokens: any[] = [];

                // Check for priority tokens first
                const priorityList = dataConfig.priorityTokens[chain.id];

                if (priorityList && priorityList.length > 0) {
                    debugLog('data', `Fetching ${priorityList.length} priority tokens for ${chain.id}`);
                    const { fetchSpecificTokens } = await import("./coinGecko");
                    tokens = await fetchSpecificTokens(priorityList);
                }

                // If no priority tokens or they failed/returned few, fall back to ecosystem/dexscreener
                if (tokens.length < dataConfig.tokensPerChain) {
                    const ecosystemCategory = dataConfig.chainEcosystemCategory[chain.id];
                    if (ecosystemCategory) {
                        const { fetchEcosystemTokensFromCoinGecko } = await import("./coinGecko");
                        const moreTokens = await fetchEcosystemTokensFromCoinGecko(ecosystemCategory, dataConfig.tokensPerChain);
                        // Merge and deduplicate
                        const existingIds = new Set(tokens.map(t => t.address)); // address here is geckoID
                        moreTokens.forEach(t => {
                            if (!existingIds.has(t.address)) {
                                tokens.push(t);
                            }
                        });
                    } else {
                        // Fallback to DexScreener
                        const dexTokens = await fetchTokensForChain(chain.id, dataConfig.tokensPerChain);
                        tokens = [...tokens, ...dexTokens];
                    }
                }

                // Slice to limit
                tokens = tokens.slice(0, dataConfig.tokensPerChain);

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
