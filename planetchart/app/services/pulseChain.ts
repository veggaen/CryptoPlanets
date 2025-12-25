import { debugLog } from "@/utils/debug";
import { ChainData } from "@/types/galaxy";

const PULSECHAIN_RPC = "https://pulsechain-rpc.publicnode.com";
const PULSECHAIN_ID = "pulsechain";

interface PulseChainStats {
    blockNumber: number;
    gasPrice: number; // in wei
}

/**
 * Fetch basic stats from PulseChain RPC
 */
export async function fetchPulseChainStats(): Promise<PulseChainStats | null> {
    try {
        debugLog('api', 'Fetching PulseChain stats from RPC...');

        // Batch request for block number and gas price
        const response = await fetch(PULSECHAIN_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([
                { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 },
                { jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 2 }
            ])
        });

        if (!response.ok) throw new Error(`RPC Error: ${response.status}`);

        const data = await response.json();

        // Parse hex results
        const blockNumber = parseInt(data[0].result, 16);
        const gasPrice = parseInt(data[1].result, 16);

        debugLog('api', `PulseChain: Block ${blockNumber}, Gas ${gasPrice} wei`);

        return { blockNumber, gasPrice };
    } catch (error) {
        console.error("Failed to fetch PulseChain stats:", error);
        return null;
    }
}

/**
 * Get PulseChain data object
 * Note: TVL is hard to get via RPC alone without an indexer, 
 * so we might need a fallback or static estimate if DefiLlama fails.
 */
export async function getPulseChainData(): Promise<ChainData> {
    const stats = await fetchPulseChainStats();

    return {
        id: PULSECHAIN_ID,
        name: "PulseChain",
        symbol: "PLS",
        // NOTE: We intentionally do NOT guess TVL/volume here.
        // DefiLlama provides authoritative chain TVL; DefiLlama DEX endpoints provide DEX volume.
        // When those are unavailable, keep these as unknown instead of inventing numbers.
        tvl: 0,
        tvlKind: 'unknown',
        weight: 0,
        volume24h: 0,
        volume24hKind: 'unknown',
        change24h: 0,
        change24hKind: 'unknown',
        dominance: 0,
        color: "from-purple-500 to-pink-600", // PulseChain branding
        tokens: [], // Will be populated by DexScreener
        geckoId: "pulsechain", // For price lookup
        price: 0 // Will be updated by CoinGecko
    };
}
