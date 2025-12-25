// Validates that our "Volume24h" mode matches DefiLlama DEX volume.
//
// Usage:
//   node planetchart/scripts/validate-dex-volume.mjs
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

function getDexChainCandidates(chainName) {
  const trimmed = String(chainName || '').trim();
  const candidates = [trimmed];

  const aliases = {
    'BNB Chain': ['BSC'],
    'BSC': ['BNB Chain'],
    'Binance Smart Chain': ['BSC', 'BNB Chain'],
    'PulseChain': ['Pulsechain'],
    'Pulsechain': ['PulseChain'],
  };

  const extra = aliases[trimmed];
  if (extra) candidates.push(...extra);

  return [...new Set(candidates)].filter(Boolean);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return res.json();
}

async function fetchDefiLlamaDexTotal24h() {
  const url = 'https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume';
  const raw = await fetchJson(url);
  return asNumber(raw.total24h);
}

async function fetchDefiLlamaDexChain24h(chainName) {
  const candidates = getDexChainCandidates(chainName);
  for (const candidate of candidates) {
    const url = `https://api.llama.fi/overview/dexs/${encodeURIComponent(candidate)}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume`;
    try {
      const raw = await fetchJson(url);
      const val = asNumber(raw.total24h);
      if (val !== null) return { value: val, used: candidate };
    } catch {
      // try next alias
    }
  }
  return { value: null, used: null };
}

async function main() {
  const apiUrl = `${API_BASE}/api/galaxy?mode=Volume24h&volumeSource=dex`;
  const api = await fetchJson(apiUrl);
  const data = api?.data;
  if (!data || !data.btc || !Array.isArray(data.chains)) {
    throw new Error(`Unexpected API shape from ${apiUrl}`);
  }

  const btcVol = asNumber(data.btc.volume24h);
  const btcKind = data.btc.volume24hKind;

  const llamaTotal = await fetchDefiLlamaDexTotal24h();
  const btcDelta = pctDiff(btcVol, llamaTotal);

  console.log('DEX TOTAL (24H):');
  console.log(`  app:   ${formatUsd(btcVol)} (kind=${btcKind})`);
  console.log(`  llama: ${formatUsd(llamaTotal)}`);
  console.log(`  diff:  ${btcDelta === null ? 'n/a' : btcDelta.toFixed(2) + '%'}`);
  console.log('');

  const focus = ['Ethereum', 'Solana', 'BNB Chain', 'Arbitrum', 'Base', 'Sui', 'Polygon', 'Avalanche', 'TRON', 'PulseChain'];
  const byName = new Map(data.chains.map((c) => [c.name, c]));

  console.log('CHAINS (24H DEX VOL):');
  for (const name of focus) {
    const chain = byName.get(name);
    if (!chain) continue;

    const appVol = asNumber(chain.volume24h);
    const appKind = chain.volume24hKind;

    const llama = await fetchDefiLlamaDexChain24h(chain.name);
    const delta = pctDiff(appVol, llama.value);

    console.log(`  ${chain.name}`);
    console.log(`    app:   ${formatUsd(appVol)} (kind=${appKind})`);
    console.log(`    llama: ${formatUsd(llama.value)}${llama.used ? ` (endpoint=${llama.used})` : ''}`);
    console.log(`    diff:  ${delta === null ? 'n/a' : delta.toFixed(2) + '%'}`);
  }

  console.log('\nNote: This validates DefiLlama DEX volume (what the app shows in Volume24h mode), not coin spot/CEX trading volume from CoinGecko markets/CMC.');
}

main().catch((err) => {
  console.error('\nValidation failed:', err?.message || err);
  console.error('Make sure the dev server is running, or set API_BASE.');
  process.exitCode = 1;
});
