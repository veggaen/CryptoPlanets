import fs from 'fs';

function parseChainIdMapFromDataConfigTs(tsPath) {
  const src = fs.readFileSync(tsPath, 'utf8');
  const startIdx = src.indexOf('chainIdMap:');
  if (startIdx === -1) return new Map();

  const braceIdx = src.indexOf('{', startIdx);
  if (braceIdx === -1) return new Map();

  // naive brace matching from first '{'
  let depth = 0;
  let endIdx = -1;
  for (let i = braceIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) return new Map();

  const block = src.slice(braceIdx + 1, endIdx);

  // match "Key": "value"
  const re = /"([^"]+)"\s*:\s*"([^"]+)"/g;
  const out = new Map();
  let m;
  while ((m = re.exec(block))) {
    out.set(m[1], m[2]);
  }
  return out;
}

async function fetchDefiLlamaChains() {
  const res = await fetch('https://api.llama.fi/v2/chains', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Unexpected DefiLlama response');
  return data;
}

function compactUsd(n) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

async function main() {
  const tsPath = new URL('../app/config/dataConfig.ts', import.meta.url);
  const map = parseChainIdMapFromDataConfigTs(tsPath);

  const topN = Number(process.env.TOP || 40);
  const chains = await fetchDefiLlamaChains();

  const sorted = [...chains]
    .filter((c) => typeof c?.tvl === 'number' && c.tvl > 0)
    .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
    .slice(0, topN)
    .map((c) => {
      const name = String(c.name || '');
      const mapped = map.has(name);
      return {
        name,
        tvl: c.tvl,
        tvlPretty: compactUsd(c.tvl),
        mapped,
        mappedId: mapped ? map.get(name) : null,
        gecko_id: c.gecko_id ?? null,
        tokenSymbol: c.tokenSymbol ?? null,
      };
    });

  const candidates = sorted.filter((c) => !c.mapped);

  const report = {
    topN,
    mappedCount: sorted.length - candidates.length,
    candidateCount: candidates.length,
    candidates,
    top: sorted,
  };

  const outPath = process.env.OUT || './chain-candidates.json';
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(`Candidates (unmapped in chainIdMap): ${candidates.length}`);
  console.log('Top 10 candidates:');
  candidates.slice(0, 10).forEach((c) => {
    console.log(`- ${c.name} (${c.tvlPretty}) gecko_id=${c.gecko_id || 'n/a'}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
