import { describe, it, expect } from 'vitest';
import { mergeTokenFromProvider, mergeTokenWithProviderPreference } from '@/utils/providerMerge';
import type { TokenData } from '@/types/galaxy';
import type { PrimaryProvider } from '@/types/providers';

function baseToken(overrides: Partial<TokenData> = {}): TokenData {
  return {
    symbol: 'TKN',
    name: 'Token',
    address: 'token',
    price: 100,
    change24h: 1,
    volume24h: 1_000_000,
    liquidity: 0,
    marketCap: 10_000_000,
    marketCapKind: 'market_cap',
    color: 'from-slate-400 to-slate-600',
    ...overrides,
  };
}

describe('mergeTokenWithProviderPreference', () => {
  it('DexScreener primary overrides price/volume when present', () => {
    const existing = baseToken({ price: 0.000004014, volume24h: 168_000_000, liquidity: 0 });
    const dex = baseToken({ price: 0.000003974, volume24h: 479_000, liquidity: 30_800_000, dexScreenerUrl: 'https://dexscreener.com/x' });
    const out = mergeTokenWithProviderPreference(existing, dex, 'dexscreener');
    expect(out.price).toBe(dex.price);
    expect(out.volume24h).toBe(dex.volume24h);
    expect(out.liquidity).toBe(dex.liquidity);
    expect(out.dexScreenerUrl).toBe(dex.dexScreenerUrl);
  });

  it('CoinGecko primary keeps existing price/volume but fills missing liquidity from DexScreener', () => {
    const existing = baseToken({ price: 0.000004014, volume24h: 168_000_000, liquidity: 0 });
    const dex = baseToken({ price: 0.000003974, volume24h: 479_000, liquidity: 30_800_000 });
    const out = mergeTokenWithProviderPreference(existing, dex, 'coingecko');
    expect(out.price).toBe(existing.price);
    expect(out.volume24h).toBe(existing.volume24h);
    expect(out.liquidity).toBe(dex.liquidity);
  });

  it('Auto fills gaps but does not override existing values', () => {
    const existing = baseToken({ price: 1, volume24h: 2, liquidity: 0 });
    const dex = baseToken({ price: 3, volume24h: 4, liquidity: 5 });
    const out = mergeTokenWithProviderPreference(existing, dex, 'auto');
    expect(out.price).toBe(1);
    expect(out.volume24h).toBe(2);
    expect(out.liquidity).toBe(5);
  });

  it('Dex primary does not clobber CoinGecko market cap when Dex market cap is missing', () => {
    const existing = baseToken({ marketCap: 1_680_000_000, marketCapKind: 'market_cap' });
    const dex = baseToken({ marketCap: 0, marketCapKind: 'unknown' });
    const out = mergeTokenWithProviderPreference(existing, dex, 'dexscreener');
    expect(out.marketCap).toBe(1_680_000_000);
    expect(out.marketCapKind).toBe('market_cap');
  });

  it('Dex primary does not override an existing positive market cap even if Dex provides one', () => {
    const existing = baseToken({ marketCap: 3_630_000_000, marketCapKind: 'market_cap' });
    const dex = baseToken({ marketCap: 11_616_510_000_000_000, marketCapKind: 'fdv' });
    const out = mergeTokenWithProviderPreference(existing, dex, 'dexscreener');
    expect(out.marketCap).toBe(3_630_000_000);
    expect(out.marketCapKind).toBe('market_cap');
  });

  it('handles undefined dex token safely', () => {
    const existing = baseToken();
    const out = mergeTokenWithProviderPreference(existing, undefined, 'auto' as PrimaryProvider);
    expect(out).toEqual(existing);
  });
});

describe('mergeTokenFromProvider (coinmarketcap)', () => {
  it('CoinMarketCap primary overrides price/volume/marketCap (but not liquidity)', () => {
    const existing = baseToken({ price: 10, volume24h: 100, liquidity: 555, marketCap: 1000, marketCapKind: 'market_cap' });
    const cmc = { price: 11, volume24h: 999, marketCap: 2000, marketCapKind: 'market_cap' as const };
    const out = mergeTokenFromProvider(existing, cmc, 'coinmarketcap', 'coinmarketcap');
    expect(out.price).toBe(11);
    expect(out.volume24h).toBe(999);
    expect(out.marketCap).toBe(2000);
    expect(out.liquidity).toBe(555);
  });
});
