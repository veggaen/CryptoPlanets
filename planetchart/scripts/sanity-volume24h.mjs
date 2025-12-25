/*
  Sanity check for Volume24h mode.

  Compares our internal /api/galaxy?mode=Volume24h output against DefiLlama DEX volume endpoints:
  - Global total: /overview/dexs (total24h)
  - Per-chain totals: /overview/dexs/{chain}?dataType=dailyVolume (total24h)

  Usage:
    BASE_URL=http://localhost:3000 node scripts/sanity-volume24h.mjs
*/

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TOP = Number(process.env.TOP || 10);

function compactUsd(n) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function pctDiff(a, b) {
  const denom = Math.max(1e-9, Math.abs(b));
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
  if (aliases[trimmed]) candidates.push(...aliases[trimmed]);
  return [...new Set(candidates)].filter(Boolean);
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}${text ? `\n${text.slice(0, 300)}` : ''}`);
  }
  return res.json();
}

async function fetchGalaxyVolume() {
  const url = new URL('/api/galaxy', BASE_URL);
  url.searchParams.set('mode', 'Volume24h');
  url.searchParams.set('hideStables', 'false');
  url.searchParams.set('hideWrapped', 'false');

  const body = await fetchJson(url.toString());
  if (!body || body.success !== true || !body.data) {
    throw new Error(`API returned success=false: ${body?.error || 'unknown error'}`);
  }
  return body.data;
}

async function fetchDexTotal24h() {
  const url = 'https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume';
  const data = await fetchJson(url);
  return typeof data?.total24h === 'number' ? data.total24h : null;
}

async function fetchDexChain24h(chainName) {
  for (const candidate of getDexChainCandidates(chainName)) {
    const url = `https://api.llama.fi/overview/dexs/${encodeURIComponent(candidate)}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume`;
    try {
      const data = await fetchJson(url);
      if (typeof data?.total24h === 'number') return { value: data.total24h, resolvedName: candidate };
    } catch {
      // try next alias
    }
  }
  return { value: null, resolvedName: null };
}

async function main() {
  console.log('=== Volume24h Sanity Check ===');
  console.log('BASE_URL:', BASE_URL);
  console.log('TOP:', TOP);

  const [galaxy, dexTotal] = await Promise.all([
    fetchGalaxyVolume(),
    fetchDexTotal24h(),
  ]);

  const btc = galaxy.btc;
  console.log('\n[Sun] BTC Volume24h provenance');
  console.log('btc.volume24hKind:', btc.volume24hKind ?? '(missing)');
  console.log('btc.volume24h:', compactUsd(btc.volume24h));
  console.log('defillama.dexTotal24h:', dexTotal === null ? '(failed)' : compactUsd(dexTotal));
  if (typeof dexTotal === 'number') {
    const diff = pctDiff(btc.volume24h, dexTotal);
    console.log('btc vs defillama total diff:', `${diff.toFixed(2)}%`);
  }

  const candidates = (galaxy.chains || [])
    .filter((c) => c && c.volume24hKind === 'dex' && typeof c.volume24h === 'number' && c.volume24h > 0)
    .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    .slice(0, TOP);

  console.log(`\n[Chains] Top ${candidates.length} by our API Volume24h (DEX)`);
  for (const c of candidates) {
    console.log(`- ${c.name} (${c.id}): ${compactUsd(c.volume24h)}`);
  }

  console.log('\n[Comparison] Per-chain totals vs DefiLlama');
  const rows = [];
  for (const c of candidates) {
    const expected = c.volume24h;
    const { value, resolvedName } = await fetchDexChain24h(c.name);
    if (value === null) {
      rows.push({ chain: c.name, id: c.id, ours: expected, llama: null, resolvedName: null, diffPct: null });
      continue;
    }
    rows.push({
      chain: c.name,
      id: c.id,
      ours: expected,
      llama: value,
      resolvedName,
      diffPct: pctDiff(expected, value),
    });
  }

  // Sort by worst absolute diff
  rows.sort((a, b) => (Math.abs(b.diffPct ?? -1) - Math.abs(a.diffPct ?? -1)));

  for (const r of rows) {
    if (r.llama === null) {
      console.log(`- ${r.chain} (${r.id}): ours ${compactUsd(r.ours)} | defillama: (failed)`);
    } else {
      const badge = Math.abs(r.diffPct) <= 1.0 ? 'OK' : Math.abs(r.diffPct) <= 5.0 ? 'WARN' : 'MISMATCH';
      console.log(`- ${r.chain} (${r.id}) [${badge}]${r.resolvedName && r.resolvedName !== r.chain ? ` via ${r.resolvedName}` : ''}: ours ${compactUsd(r.ours)} | llama ${compactUsd(r.llama)} | diff ${r.diffPct.toFixed(2)}%`);
    }
  }

  const failures = rows.filter((r) => r.llama === null);
  const mismatches = rows.filter((r) => r.llama !== null && Math.abs(r.diffPct) > 5.0);

  console.log('\n[Result]');
  console.log('chains compared:', rows.length);
  console.log('chain fetch failures:', failures.length);
  console.log('chain mismatches (>5%):', mismatches.length);

  if (btc.volume24hKind !== 'dex_total') {
    console.log('WARN: btc.volume24hKind is not dex_total in Volume24h mode');
  }

  if (typeof dexTotal === 'number' && Math.abs(pctDiff(btc.volume24h, dexTotal)) > 5.0) {
    console.log('WARN: btc.volume24h differs from defillama total24h by >5%');
  }

  if (mismatches.length > 0 || failures.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
