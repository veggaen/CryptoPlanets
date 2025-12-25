/*
  Sanity check for MarketCap behavior.

  Compares our internal /api/galaxy?mode=MarketCap output (single basis)
  against CoinGecko /coins/markets snapshots (market_cap) for the chains' native assets.

  Usage:
    BASE_URL=http://localhost:3000 node scripts/sanity-marketcap.mjs
*/

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TOP = Number(process.env.TOP || 12);
const MAX_DIFF_PCT = Number(process.env.MAX_DIFF_PCT || 2); // tolerate small drift

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

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}${text ? `\n${text.slice(0, 300)}` : ''}`);
  }
  return res.json();
}

async function fetchGalaxyMarketCap() {
  const url = new URL('/api/galaxy', BASE_URL);
  url.searchParams.set('mode', 'MarketCap');
  url.searchParams.set('hideStables', 'false');
  url.searchParams.set('hideWrapped', 'false');

  const body = await fetchJson(url.toString());
  if (!body || body.success !== true || !body.data) {
    throw new Error(`API returned success=false: ${body?.error || 'unknown error'}`);
  }
  return body.data;
}

async function fetchCoinGeckoMarkets(ids) {
  if (ids.length === 0) return {};
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(','))}&order=market_cap_desc&per_page=${ids.length}&page=1&sparkline=false`;
  const apiKey = process.env.COINGECKO_API_KEY;
  const headers = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};
  const rows = await fetchJson(url, headers);

  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.id !== 'string') continue;
    out[row.id] = {
      marketCap: typeof row.market_cap === 'number' ? row.market_cap : null,
      fdv: typeof row.fully_diluted_valuation === 'number' ? row.fully_diluted_valuation : null,
      price: typeof row.current_price === 'number' ? row.current_price : null,
      change24h: typeof row.price_change_percentage_24h === 'number' ? row.price_change_percentage_24h : null,
    };
  }
  return out;
}

function summarizeComparison(label, chains, snapshots, expectedField) {
  const rows = [];
  for (const c of chains) {
    const geckoId = c.geckoId;
    if (!geckoId) continue;
    const snap = snapshots[geckoId];
    const expected = snap ? snap[expectedField] : null;
    const ours = typeof c.marketCap === 'number' ? c.marketCap : null;

    if (expected === null || ours === null || expected <= 0 || ours <= 0) {
      rows.push({ chain: c.name, id: c.id, geckoId, ours, expected, diffPct: null, kind: c.marketCapKind ?? null });
      continue;
    }

    rows.push({
      chain: c.name,
      id: c.id,
      geckoId,
      ours,
      expected,
      diffPct: pctDiff(ours, expected),
      kind: c.marketCapKind ?? null,
    });
  }

  const comparable = rows.filter((r) => r.diffPct !== null);
  const mismatches = comparable.filter((r) => Math.abs(r.diffPct) > MAX_DIFF_PCT);
  const unknownKind = rows.filter((r) => r.kind === 'unknown');

  console.log(`\n[${label}]`);
  console.log('chains in response:', chains.length);
  console.log('chains with geckoId:', rows.length);
  console.log('comparable (expected+ours > 0):', comparable.length);
  console.log(`mismatches (>${MAX_DIFF_PCT}%):`, mismatches.length);
  console.log('unknown kind:', unknownKind.length);

  // show top 8 by ours
  const topByOurs = [...chains]
    .filter((c) => typeof c.marketCap === 'number' && c.marketCap > 0)
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
    .slice(0, Math.min(8, chains.length));

  console.log('\nTop by our marketCap:');
  for (const c of topByOurs) {
    console.log(`- ${c.name} (${c.id}) [${c.marketCapKind ?? 'n/a'}]: ${compactUsd(c.marketCap)}`);
  }

  // show worst diffs
  const worst = [...comparable].sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct)).slice(0, 8);
  if (worst.length > 0) {
    console.log('\nWorst diffs:');
    for (const r of worst) {
      const badge = Math.abs(r.diffPct) <= 1 ? 'OK' : Math.abs(r.diffPct) <= MAX_DIFF_PCT ? 'WARN' : 'MISMATCH';
      console.log(`- ${r.chain} (${r.id}) [${badge}] ours ${compactUsd(r.ours)} | cg ${compactUsd(r.expected)} | diff ${r.diffPct.toFixed(2)}% | kind ${r.kind}`);
    }
  }

  return { rows, mismatches };
}

async function main() {
  console.log('=== MarketCap Sanity Check ===');
  console.log('BASE_URL:', BASE_URL);
  console.log('TOP:', TOP);
  console.log('MAX_DIFF_PCT:', MAX_DIFF_PCT);

  const data = await fetchGalaxyMarketCap();
  const chains = (data.chains || []).slice(0, TOP);

  const geckoIds = Array.from(new Set(
    chains.map((c) => c.geckoId).filter(Boolean)
  ));

  console.log('\nFetching CoinGecko snapshots for:', geckoIds.length, 'ids');
  const snapshots = await fetchCoinGeckoMarkets(geckoIds);

  const report = summarizeComparison('MarketCap (market_cap)', chains, snapshots, 'marketCap');

  const mismatchCount = report.mismatches.length;
  console.log('\n[Result]');
  console.log('total mismatches:', mismatchCount);

  if (mismatchCount > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
