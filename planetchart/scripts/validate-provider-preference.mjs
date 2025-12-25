// Compares /api/galaxy output between different primary providers.
//
// Usage:
//   node planetchart/scripts/validate-provider-preference.mjs
//
// Requires the Next dev server running at http://localhost:3000
// (or set API_BASE env var).

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

function asNumber(x) {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function formatUsd(n) {
  if (n === null) return 'null';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(6)}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return res.json();
}

function pick(chain, symbols) {
  const bySymbol = new Map((chain.tokens || []).map((t) => [String(t.symbol || '').toUpperCase(), t]));
  return symbols
    .map((s) => String(s).toUpperCase())
    .map((s) => bySymbol.get(s))
    .filter(Boolean);
}

async function main() {
  const providers = ['coingecko', 'dexscreener', 'coinmarketcap'];

  const urls = providers.map(
    (p) => `${API_BASE}/api/galaxy?mode=MarketCap&hideStables=false&hideWrapped=false&primaryProvider=${encodeURIComponent(p)}`,
  );
  const results = await Promise.all(urls.map(fetchJson));

  const byProvider = new Map(providers.map((p, i) => [p, results[i]]));
  const ethByProvider = new Map();
  for (const p of providers) {
    const chains = byProvider.get(p)?.data?.chains;
    if (!Array.isArray(chains)) throw new Error(`Unexpected API shape for ${p}. Is the dev server running?`);
    const eth = chains.find((c) => c.id === 'ethereum');
    if (!eth) throw new Error(`Ethereum chain not found in API response for ${p}.`);
    ethByProvider.set(p, eth);
  }

  const focus = ['PEPE', 'HEX', 'AAVE', 'UNI', 'LINK'];

  console.log('PRIMARY PROVIDER COMPARISON (Ethereum, MarketCap mode)');
  console.log(`API base: ${API_BASE}`);
  console.log('');

  for (const symbol of focus) {
    console.log(symbol);

    for (const p of providers) {
      const eth = ethByProvider.get(p);
      const t = (pick(eth, [symbol])[0] || null);
      const label = p === 'coingecko' ? 'CoinGecko' : p === 'dexscreener' ? 'DexScreener' : 'CoinMarketCap';

      if (!t) {
        console.log(`  ${label} primary: missing`);
        continue;
      }

      console.log(
        `  ${label} primary: price=${formatUsd(asNumber(t.price))} vol24h=${formatUsd(asNumber(t.volume24h))} mc=${formatUsd(asNumber(t.marketCap))} liq=${formatUsd(asNumber(t.liquidity))}`,
      );
      if (t.dexScreenerUrl) console.log(`    dexLink: ${t.dexScreenerUrl}`);
    }

    console.log('');
  }

  console.log('If CoinMarketCap shows all missing, confirm COINMARKETCAP_API_KEY is set for the Next dev server process.');
}

main().catch((err) => {
  console.error('\nValidation failed:', err?.message || err);
  console.error('Make sure the dev server is running, or set API_BASE.');
  process.exitCode = 1;
});
