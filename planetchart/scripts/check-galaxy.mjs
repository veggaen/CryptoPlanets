async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  const url = new URL('/api/galaxy', base);
  url.searchParams.set('mode', process.env.MODE || 'MarketCap');
  url.searchParams.set('hideStables', 'false');
  url.searchParams.set('hideWrapped', 'false');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  console.log('success:', body && body.success);

  const data = body && body.data;
  const btc = data && data.btc;
  console.log('mode:', data && data.metric);
  console.log('btc.dominance:', btc && btc.dominance);
  console.log('btc.marketCap:', btc && btc.marketCap);
  console.log('totalMarketCap:', data && data.totalMarketCap);
}

main().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
