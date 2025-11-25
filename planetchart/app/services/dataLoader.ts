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
        // Fetch all data in parallel
        const [btcData, chains] = await Promise.all([
            fetchBTCStats(),
            fetchChainsTVL(),
        ]);

        // Sort chains by weight
        const weightedChains = chains
            .map(chain => ({
                ...chain,
                weight: calculateWeight(chain, weightMode),
            }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, dataConfig.maxChains);

        // Fetch tokens for each chain using ecosystem-specific APIs
        const chainsWithTokens = await Promise.all(
            weightedChains.map(async (chain) => {
                let tokens: any[] = [];

                // Check if this chain has a CoinGecko ecosystem category mapping
                const ecosystemCategory = dataConfig.chainEcosystemCategory[chain.id];

                if (ecosystemCategory) {
                    // Use CoinGecko for ecosystem tokens (REAL chain-specific tokens)
                    debugLog('data', `Fetching ecosystem tokens for ${chain.id} from category: ${ecosystemCategory}`);
                    const { fetchEcosystemTokensFromCoinGecko } = await import("./coinGecko");
                    tokens = await fetchEcosystemTokensFromCoinGecko(ecosystemCategory, dataConfig.tokensPerChain);
                } else {
                    // Fallback to DexScreener for chains without ecosystem mapping
                    debugLog('data', `Fetching tokens for ${chain.id} from DexScreener (no ecosystem category)`);
                    tokens = await fetchTokensForChain(chain.id, dataConfig.tokensPerChain);
                }

                return { ...chain, tokens };
            })
        );

        // Calculate dominance for BTC and chains
        // Total market cap = BTC cap + Sum of all chain TVLs (approximation for this viz)
        const totalVal = btcData.marketCap + chains.reduce((sum, c) => sum + c.tvl, 0);

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

        // Runtime validation
        validateGalaxyData(galaxyData);

        debugLog('data', `Loaded ${galaxyData.chains.length} chains with ${galaxyData.chains.reduce((sum, c) => sum + c.tokens.length, 0)} total tokens`);

        return galaxyData;

    } catch (error) {
        console.error('[DATA ERROR]', error);
        // Return fallback/mock data
        return getFallbackData();
    }
}

function calculateWeight(chain: ChainData, mode: WeightMode): number {
    switch (mode) {
        case 'TVL': return chain.tvl;
        case 'MarketCap': return chain.tvl; // Using TVL as proxy for chain MC if MC is missing
        case 'Volume24h': return chain.volume24h;
        case 'Change24h': return Math.abs(chain.change24h);
        case 'Change7d': return 0; // Not implemented yet
        case 'Change30d': return 0; // Not implemented yet
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
