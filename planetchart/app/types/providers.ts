export type PrimaryProvider = 'auto' | 'dexscreener' | 'coingecko' | 'coinmarketcap';

export function normalizePrimaryProvider(input: unknown): PrimaryProvider {
  const raw = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (raw === 'dex' || raw === 'dexscreener') return 'dexscreener';
  if (raw === 'cg' || raw === 'coingecko' || raw === 'coin-gecko') return 'coingecko';
  if (raw === 'cmc' || raw === 'coinmarketcap' || raw === 'coin-market-cap') return 'coinmarketcap';
  return 'auto';
}

export const PRIMARY_PROVIDER_LABELS: Record<PrimaryProvider, string> = {
  auto: 'Auto',
  dexscreener: 'DexScreener',
  coingecko: 'CoinGecko',
  coinmarketcap: 'CoinMarketCap',
};
