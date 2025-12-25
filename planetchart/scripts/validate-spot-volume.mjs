// Validates that our "Volume24h" mode (Spot) matches CoinGecko /coins/markets total_volume.
//
// Usage:
//   node planetchart/scripts/validate-spot-volume.mjs
//
// Requires the Next dev server to be running at http://localhost:3000
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
  return `${sign}$${abs.toFixed(2)}`;
}

function pctDiff(a, b) {
  if (a === null || b === null) return null;
  const denom = b === 0 ? null : b;
  if (denom === null) return null;
  return ((a - b) / denom) * 100;
}

async function fetchJson(url, headers = undefined) {
  const res = await fetch(url, { headers: headers || { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return res.json();
}

async function fetchCoinGeckoVolumesByIds(ids) {
  if (!ids.length) return {};

  const apiKey = process.env.COINGECKO_API_KEY;
  const headers = apiKey ? { 'x-cg-demo-api-key': apiKey } : undefined;

  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(','))}&order=market_cap_desc&per_page=${ids.length}&page=1&sparkline=false`;
  const rows = await fetchJson(url, headers);

  const out = {};
  for (const row of rows) {
    if (row && typeof row.id === 'string') {
      out[row.id] = asNumber(row.total_volume);
    }
  }
  return out;
}

async function main() {
  const apiUrl = `${API_BASE}/api/galaxy?mode=Volume24h&volumeSource=spot`;
  const api = await fetchJson(apiUrl);
  const data = api?.data;
  if (!data || !data.btc || !Array.isArray(data.chains)) {
    throw new Error(`Unexpected API shape from ${apiUrl}`);
  }

  const chainIds = data.chains.map((c) => c.geckoId).filter(Boolean);
  const ids = ['bitcoin', ...chainIds];
  const uniqueIds = [...new Set(ids)];

  const cgVolumes = await fetchCoinGeckoVolumesByIds(uniqueIds);

  console.log('SPOT/CEX VOLUME (24H) — CoinGecko total_volume');

  // BTC
  {
    const appVol = asNumber(data.btc.volume24h);
    const cgVol = asNumber(cgVolumes.bitcoin);
    const delta = pctDiff(appVol, cgVol);
    console.log('  Bitcoin');
    console.log(`    app: ${formatUsd(appVol)} (kind=${data.btc.volume24hKind})`);
    console.log(`    cg:  ${formatUsd(cgVol)}`);
    console.log(`    diff:${delta === null ? ' n/a' : ' ' + delta.toFixed(2) + '%'}`);
  }

  // Chains
  console.log('\n  Chains');
  for (const chain of data.chains) {
    const id = chain.geckoId;
    if (!id) continue;
    const appVol = asNumber(chain.volume24h);
    const cgVol = asNumber(cgVolumes[id]);
    const delta = pctDiff(appVol, cgVol);
    console.log(`    ${chain.name}`);
    console.log(`      app: ${formatUsd(appVol)} (kind=${chain.volume24hKind})`);
    console.log(`      cg:  ${formatUsd(cgVol)}`);
    console.log(`      diff:${delta === null ? ' n/a' : ' ' + delta.toFixed(2) + '%'}`);
  }

  console.log('\nNote: CoinGecko /coins/markets volumes can differ from CoinMarketCap/Coin360/DexScreener because each aggregator includes different exchanges and uses different methodologies.');
}

main().catch((err) => {
  console.error('\nValidation failed:', err?.message || err);
  console.error('Make sure the dev server is running, or set API_BASE.');
  process.exitCode = 1;
});
