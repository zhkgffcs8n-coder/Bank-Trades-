const kalshi = 'https://api.elections.kalshi.com/trade-api/v2';

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('Market data unavailable');
  return response.json();
}

async function kalshiFlow(ticker, end) {
  const start = end - 30_000;
  const params = new URLSearchParams({ ticker, min_ts: Math.floor(start / 1000), limit: 1000 });
  const totals = { up: 0, down: 0, upCount: 0, downCount: 0 };
  const seen = new Set();
  for (let page = 0; page < 4; page++) {
    const { trades, cursor } = await json(kalshi + '/markets/trades?' + params);
    for (const trade of trades) {
      const at = Date.parse(trade.created_time);
      if (trade.ticker !== ticker || !(at > start && at <= end) || !trade.trade_id || seen.has(trade.trade_id)) continue;
      seen.add(trade.trade_id);
      const side = trade.taker_outcome_side ?? trade.taker_side;
      const size = Number(trade.count_fp ?? trade.count);
      if (!['yes', 'no'].includes(side) || !(size > 0) || !Number.isFinite(size)) return null;
      const key = side === 'yes' ? 'up' : 'down';
      totals[key] += size;
      totals[key + 'Count']++;
    }
    if (!cursor) return totals;
    params.set('cursor', cursor);
  }
  return null;
}

async function resolutions() {
  const { markets } = await json(kalshi + '/markets?series_ticker=KXBTC15M&status=settled&limit=12');
  return markets.filter(m => m.status === 'finalized' && ['yes', 'no'].includes(m.result) && Date.parse(m.close_time) <= Date.now())
    .sort((a, b) => Date.parse(b.close_time) - Date.parse(a.close_time)).slice(0, 4)
    .map(m => ({ close: Date.parse(m.close_time), side: m.result === 'yes' ? 'UP' : 'DOWN',
      value: m.expiration_value != null && Number(m.expiration_value) > 0 ? Number(m.expiration_value) : null }));
}

async function bitcoinStats() {
  const [btc] = await json('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin');
  return btc ? { supply: btc.circulating_supply, cap: btc.market_cap, at: btc.last_updated } : null;
}

export default async function handler(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const at = Date.now();
  const safe = promise => promise.catch(() => null);
  if (url.searchParams.get('view') === 'stats') {
    const [stats, rounds] = await Promise.all([safe(bitcoinStats()), safe(resolutions())]);
    return Response.json({ at, stats, rounds }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=45' } });
  }
  const ticker = url.searchParams.get('ticker') ?? '';
  if (!/^KXBTC15M-[A-Z0-9-]{6,60}$/.test(ticker)) return new Response(null, { status: 400 });
  const [flow, depth] = await Promise.all([
    safe(kalshiFlow(ticker, at)),
    safe(json(kalshi + '/markets/' + ticker + '/orderbook?depth=8')),
  ]);
  return Response.json({ at, ticker, flow, depth }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=3' } });
}
