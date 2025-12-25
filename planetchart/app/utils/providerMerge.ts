import type { TokenData } from '@/types/galaxy';
import type { PrimaryProvider } from '@/types/providers';

function hasPositiveNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0;
}

export type TokenProvider = 'dexscreener' | 'coinmarketcap';

export function mergeTokenFromProvider(
  existing: TokenData,
  incoming: Partial<TokenData> | null | undefined,
  source: TokenProvider,
  primaryProvider: PrimaryProvider
): TokenData {
  if (!incoming) return existing;

  // Keep backwards behavior: DexScreener merge includes liquidity and dex metadata.
  if (source === 'dexscreener') {
    return mergeTokenWithProviderPreference(existing, incoming, primaryProvider);
  }

  const preferCmc = primaryProvider === 'coinmarketcap';
  const preferDex = primaryProvider === 'dexscreener';

  const next: TokenData = { ...existing };

  // CoinMarketCap doesn't provide liquidity/TVL; never touch liquidity.

  const cmcPrice = hasPositiveNumber(incoming.price) ? incoming.price : null;
  const cmcChange = typeof incoming.change24h === 'number' && Number.isFinite(incoming.change24h)
    ? incoming.change24h
    : null;
  const cmcVolume = hasPositiveNumber(incoming.volume24h) ? incoming.volume24h : null;
  const cmcMarketCap = hasPositiveNumber(incoming.marketCap) ? incoming.marketCap : null;
  const cmcFdv = hasPositiveNumber(incoming.fdv) ? incoming.fdv : null;

  // Price/change: only override when CMC is primary.
  if (preferCmc) {
    if (cmcPrice !== null) next.price = cmcPrice;
    if (cmcChange !== null) next.change24h = cmcChange;
  } else if (!preferDex) {
    // auto/coingecko: fill gaps only
    if (!hasPositiveNumber(next.price) && cmcPrice !== null) next.price = cmcPrice;
    if ((typeof next.change24h !== 'number' || !Number.isFinite(next.change24h)) && cmcChange !== null) next.change24h = cmcChange;
  }

  // Volume24h: CMC is market-wide aggregate; only override when CMC is primary.
  if (preferCmc) {
    if (cmcVolume !== null) next.volume24h = cmcVolume;
  } else if (!preferDex) {
    if (!hasPositiveNumber(next.volume24h) && cmcVolume !== null) next.volume24h = cmcVolume;
  }

  // Market cap: CMC is generally global aggregate; only override when CMC is primary.
  if (preferCmc) {
    if (cmcMarketCap !== null) {
      next.marketCap = cmcMarketCap;
      next.marketCapKind = incoming.marketCapKind ?? next.marketCapKind;
    } else if (cmcFdv !== null && !hasPositiveNumber(next.marketCap)) {
      next.marketCap = cmcFdv;
      next.marketCapKind = 'fdv';
    }

    if (cmcFdv !== null) next.fdv = cmcFdv;
  } else if (!preferDex) {
    if (!hasPositiveNumber(next.marketCap) && cmcMarketCap !== null) {
      next.marketCap = cmcMarketCap;
      next.marketCapKind = incoming.marketCapKind ?? next.marketCapKind;
    }
    if ((next.fdv === undefined || !hasPositiveNumber(next.fdv)) && cmcFdv !== null) next.fdv = cmcFdv;
  }

  return next;
}

export function mergeTokenWithProviderPreference(
  existing: TokenData,
  dexToken: Partial<TokenData> | null | undefined,
  primaryProvider: PrimaryProvider
): TokenData {
  if (!dexToken) return existing;

  const preferDex = primaryProvider === 'dexscreener';
  const preferCg = primaryProvider === 'coingecko' || primaryProvider === 'coinmarketcap';

  const dexLiquidity = hasPositiveNumber(dexToken.liquidity) ? dexToken.liquidity : null;
  const dexVolume = hasPositiveNumber(dexToken.volume24h) ? dexToken.volume24h : null;
  const dexPrice = hasPositiveNumber(dexToken.price) ? dexToken.price : null;
  const dexChange = typeof dexToken.change24h === 'number' && Number.isFinite(dexToken.change24h)
    ? dexToken.change24h
    : null;

  const dexMarketCap = hasPositiveNumber(dexToken.marketCap) ? dexToken.marketCap : null;
  const dexFdv = hasPositiveNumber(dexToken.fdv) ? dexToken.fdv : null;

  const merged: TokenData = { ...existing };

  // Liquidity: CoinGecko generally doesn't provide DEX liquidity. Treat DexScreener as the fallback.
  if (preferDex) {
    if (dexLiquidity !== null) merged.liquidity = dexLiquidity;
  } else {
    if (!hasPositiveNumber(merged.liquidity) && dexLiquidity !== null) merged.liquidity = dexLiquidity;
  }

  // Volume24h: differs by definition (Dex pair/pools vs market-wide).
  if (preferDex) {
    if (dexVolume !== null) merged.volume24h = dexVolume;
  } else {
    if (!hasPositiveNumber(merged.volume24h) && dexVolume !== null) merged.volume24h = dexVolume;
  }

  // Price/change: both providers can have values. Apply explicit preference.
  if (preferDex) {
    if (dexPrice !== null) merged.price = dexPrice;
    if (dexChange !== null) merged.change24h = dexChange;
  } else if (preferCg) {
    if (!hasPositiveNumber(merged.price) && dexPrice !== null) merged.price = dexPrice;
    if ((typeof merged.change24h !== 'number' || !Number.isFinite(merged.change24h)) && dexChange !== null) {
      merged.change24h = dexChange;
    }
  } else {
    // auto: prefer existing, fill gaps
    if (!hasPositiveNumber(merged.price) && dexPrice !== null) merged.price = dexPrice;
    if ((typeof merged.change24h !== 'number' || !Number.isFinite(merged.change24h)) && dexChange !== null) {
      merged.change24h = dexChange;
    }
  }

  // Market cap: CoinGecko/CoinMarketCap are usually the better global aggregates.
  // DexScreener is per-pair and can be misleading; only use it to FILL missing values.
  if (!hasPositiveNumber(merged.marketCap)) {
    if (dexMarketCap !== null) {
      merged.marketCap = dexMarketCap;
      merged.marketCapKind = dexToken.marketCapKind ?? merged.marketCapKind;
    } else if (dexFdv !== null) {
      merged.marketCap = dexFdv;
      merged.marketCapKind = 'fdv';
    }
  }

  if ((merged.fdv === undefined || !hasPositiveNumber(merged.fdv)) && dexFdv !== null) {
    merged.fdv = dexFdv;
  }

  // Always preserve DexScreener deep-link metadata when present.
  if (typeof dexToken.dexScreenerUrl === 'string' && dexToken.dexScreenerUrl.length > 0) {
    merged.dexScreenerUrl = dexToken.dexScreenerUrl;
  }
  if (typeof dexToken.dexPairAddress === 'string' && dexToken.dexPairAddress.length > 0) {
    merged.dexPairAddress = dexToken.dexPairAddress;
  }
  if (typeof dexToken.dexScreenerDexId === 'string' && dexToken.dexScreenerDexId.length > 0) {
    merged.dexScreenerDexId = dexToken.dexScreenerDexId;
  }
  if (typeof dexToken.dexScreenerBaseSymbol === 'string' && dexToken.dexScreenerBaseSymbol.length > 0) {
    merged.dexScreenerBaseSymbol = dexToken.dexScreenerBaseSymbol;
  }
  if (typeof dexToken.dexScreenerQuoteSymbol === 'string' && dexToken.dexScreenerQuoteSymbol.length > 0) {
    merged.dexScreenerQuoteSymbol = dexToken.dexScreenerQuoteSymbol;
  }

  return merged;
}
