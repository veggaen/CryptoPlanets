import fs from "fs";

type WeightMode = "TVL" | "MarketCap" | "Volume24h" | "Change24h" | "Change7d" | "Change30d";

type TokenData = {
  symbol: string;
  name: string;
  address: string;
  price: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  fdv?: number;
  marketCapKind?: "market_cap" | "fdv" | "unknown";
  icon?: string;
};

type ChainData = {
  id: string;
  symbol: string;
  name: string;
  weight: number;
  tvl: number;
  marketCap?: number;
  price?: number;
  change24h: number;
  volume24h: number;
  dominance: number;
  tokens: TokenData[];
};

type BTCData = {
  price: number;
  change24h: number;
  dominance: number;
  marketCap: number;
  volume24h: number;
};

type GalaxyData = {
  btc: BTCData;
  chains: ChainData[];
  lastUpdated: string;
  totalMarketCap: number;
  metric: WeightMode;
};

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

async function fetchGalaxy(baseUrl: string, mode: WeightMode): Promise<GalaxyData> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/galaxy?mode=${encodeURIComponent(mode)}&hideStables=false&hideWrapped=false`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { success: boolean; data?: GalaxyData; error?: string };
  if (!body.success || !body.data) throw new Error(body.error || "API returned success=false");
  return body.data;
}

function auditGalaxy(data: GalaxyData) {
  const issues: Array<{ severity: "info" | "warn"; message: string; context?: unknown }> = [];

  // Token cap provenance
  let fdvBackedCount = 0;
  let unknownCapCount = 0;
  for (const chain of data.chains) {
    for (const t of chain.tokens) {
      if (t.marketCapKind === "fdv") fdvBackedCount++;
      if (!t.marketCapKind || t.marketCapKind === "unknown") unknownCapCount++;
    }
  }
  if (fdvBackedCount > 0) {
    issues.push({
      severity: "warn",
      message: `${fdvBackedCount} tokens are using FDV (not circulating market cap) for the value shown/sizing. UI now labels these as FDV instead of MCap.`,
    });
  }
  if (unknownCapCount > 0) {
    issues.push({
      severity: "info",
      message: `${unknownCapCount} tokens have unknown cap provenance (provider did not report market cap or FDV).`,
    });
  }

  // Dominance sanity (not strict)
  const sumDom = data.btc.dominance + data.chains.reduce((s, c) => s + (c.dominance || 0), 0);
  if (sumDom < 80 || sumDom > 120) {
    issues.push({
      severity: "info",
      message: `Dominance sum is ${sumDom.toFixed(2)}%. This can be OK if dominance is global (not just displayed chains), but it’s a good thing to confirm.`,
    });
  }

  // Top chains summary
  const topChains = [...data.chains]
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      name: c.name,
      weight: compact(c.weight),
      tvl: compact(c.tvl),
      marketCap: c.marketCap ? compact(c.marketCap) : null,
      dominance: `${(c.dominance || 0).toFixed(2)}%`,
      tokens: c.tokens.length,
    }));

  return {
    metric: data.metric,
    lastUpdated: data.lastUpdated,
    totalMarketCap: data.totalMarketCap,
    btc: {
      marketCap: compact(data.btc.marketCap),
      dominance: `${data.btc.dominance.toFixed(2)}%`,
      price: data.btc.price,
    },
    issues,
    topChains,
  };
}

async function main() {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const mode = (process.env.MODE as WeightMode) || "MarketCap";

  const data = await fetchGalaxy(baseUrl, mode);
  const report = auditGalaxy(data);

  const outPath = process.env.OUT || "./galaxy-audit.json";
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Wrote audit report to ${outPath}`);
  console.log(`Issues: ${report.issues.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
