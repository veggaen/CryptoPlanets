// DexScreener/CoinGecko API service for fetching real crypto market data

export type TokenData = {
    chainId: string;
    symbol: string;
    name: string;
    priceUsd: string;
    priceChange24h: number;
    volume24h: number;
    marketCap: number;
    liquidity: number;
};

export type ChainData = {
    id: string;
    name: string;
    symbol: string;
    currentPrice: number; // Current price in USD
    totalMarketCap: number;
    dominance: number;
    priceChange24h: number;
    color: string;
    tokens: TokenData[];
};

// Fetch top cryptocurrencies with market dominance data
export async function fetchTopCryptos(limit: number = 15): Promise<ChainData[]> {
    try {
        // Using CoinGecko's free API for reliable market data
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`,
            {
                headers: {
                    'Accept': 'application/json',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const coins = await response.json();

        // Calculate total market cap for dominance
        const totalMarketCap = coins.reduce((sum: number, coin: any) =>
            sum + (coin.market_cap || 0), 0
        );

        // Map to chain data with color coding
        const chainData: ChainData[] = coins.map((coin: any) => {
            const marketCap = coin.market_cap || 0;
            const dominance = (marketCap / totalMarketCap) * 100;
            const priceChange = coin.price_change_percentage_24h || 0;
            const currentPrice = coin.current_price || 0;

            // Assign colors based on the coin
            const colorMap: Record<string, string> = {
                'bitcoin': 'from-yellow-400 to-orange-500',
                'ethereum': 'from-purple-400 to-indigo-600',
                'binancecoin': 'from-yellow-500 to-amber-600',
                'ripple': 'from-blue-400 to-blue-600',
                'solana': 'from-purple-500 to-pink-500',
                'cardano': 'from-blue-500 to-cyan-500',
                'dogecoin': 'from-yellow-300 to-yellow-500',
                'tron': 'from-red-500 to-red-600',
                'polkadot': 'from-pink-500 to-purple-600',
                'avalanche-2': 'from-red-400 to-red-600',
                'chainlink': 'from-sky-400 to-blue-600',
                'uniswap': 'from-pink-400 to-pink-600',
                'litecoin': 'from-slate-400 to-slate-600',
                'polygon': 'from-purple-600 to-indigo-700',
            };

            const color = colorMap[coin.id] || 'from-slate-400 to-slate-600';

            return {
                id: coin.id,
                name: coin.name,
                symbol: coin.symbol.toUpperCase(),
                currentPrice,
                totalMarketCap: marketCap,
                dominance,
                priceChange24h: priceChange,
                color,
                tokens: [],
            };
        });

        return chainData;
    } catch (error) {
        console.error('Failed to fetch crypto data:', error);
        return getFallbackData();
    }
}

// Fallback data in case API fails
function getFallbackData(): ChainData[] {
    return [
        {
            id: 'bitcoin',
            name: 'Bitcoin',
            symbol: 'BTC',
            currentPrice: 88081.45,
            totalMarketCap: 1_700_000_000_000,
            dominance: 52.5,
            priceChange24h: 1.54,
            color: 'from-yellow-400 to-orange-500',
            tokens: [],
        },
        {
            id: 'ethereum',
            name: 'Ethereum',
            symbol: 'ETH',
            currentPrice: 2940.81,
            totalMarketCap: 350_000_000_000,
            dominance: 18.2,
            priceChange24h: 5.44,
            color: 'from-purple-400 to-indigo-600',
            tokens: [],
        },
        {
            id: 'binancecoin',
            name: 'BNB',
            symbol: 'BNB',
            currentPrice: 864.71,
            totalMarketCap: 85_000_000_000,
            dominance: 4.2,
            priceChange24h: 3.14,
            color: 'from-yellow-500 to-amber-600',
            tokens: [],
        },
        {
            id: 'solana',
            name: 'Solana',
            symbol: 'SOL',
            currentPrice: 138.49,
            totalMarketCap: 75_000_000_000,
            dominance: 3.8,
            priceChange24h: 8.95,
            color: 'from-purple-500 to-pink-500',
            tokens: [],
        },
        {
            id: 'ripple',
            name: 'XRP',
            symbol: 'XRP',
            currentPrice: 2.26,
            totalMarketCap: 65_000_000_000,
            dominance: 3.5,
            priceChange24h: 10.94,
            color: 'from-blue-400 to-blue-600',
            tokens: [],
        },
    ];
}

// Calculate proper planet sizing based on market dominance
export function calculatePlanetRadius(
    marketCap: number,
    dominance: number,
    isLargest: boolean
): number {
    if (isLargest) {
        // BTC as the black hole gets a fixed large size
        return 90;
    }

    // Use logarithmic scale for better visual distribution
    // Min radius: 25, Max radius: 70 for non-BTC
    const logMarketCap = Math.log10(marketCap + 1);
    const logMax = Math.log10(1_000_000_000_000); // 1 trillion
    const normalizedSize = logMarketCap / logMax;

    // Also factor in dominance
    const dominanceFactor = Math.sqrt(dominance / 100);

    const radius = 25 + (normalizedSize * dominanceFactor * 45);

    return Math.max(25, Math.min(70, radius));
}

// Format price for display
export function formatPrice(price: number): string {
    if (price >= 1000) {
        return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    } else if (price >= 1) {
        return `$${price.toFixed(2)}`;
    } else if (price >= 0.01) {
        return `$${price.toFixed(4)}`;
    } else {
        return `$${price.toFixed(6)}`;
    }
}

// Assign colors based on price change
export function getPriceChangeColor(priceChange: number): string {
    if (priceChange >= 5) return 'from-emerald-400 to-green-600';
    if (priceChange >= 2) return 'from-emerald-300 to-green-500';
    if (priceChange >= 0) return 'from-green-400 to-emerald-500';
    if (priceChange >= -2) return 'from-orange-400 to-red-400';
    if (priceChange >= -5) return 'from-red-400 to-red-600';
    return 'from-red-500 to-rose-700';
}
