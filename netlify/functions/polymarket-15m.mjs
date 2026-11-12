import { member, errorResponse } from './lib/access.mjs';

const coins = ['btc', 'eth', 'sol', 'xrp'];
const roundMs = 15 * 60 * 1000;

async function fetchJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('Polymarket data unavailable');
  return response.json();
}

async function loadMarket(coin, start) {
  const slug = `${coin}-updown-15m-${start / 1000}`;
  const event = await fetchJson(`https://gamma-api.polymarket.com/events/slug/${slug}`);
  const market = event.markets?.find(candidate => candidate.slug === slug);
  if (event.slug !== slug || !market?.acceptingOrders || market.closed) return null;

  const outcomes = JSON.parse(market.outcomes);
  const tokens = JSON.parse(market.clobTokenIds);
  const sides = ['Up', 'Down'].map(label => ({ label, token: tokens[outcomes.indexOf(label)] }));
  if (sides.some(({ token }) => typeof token !== 'string' || !/^\d+$/.test(token))
      || sides[0].token === sides[1].token) return null;

  const quotes = await Promise.all(sides.map(async ({ label, token }) => {
    const book = await fetchJson(`https://clob.polymarket.com/book?token_id=${token}`);
    if (book.asset_id !== token) throw new Error('Unexpected Polymarket token');
    return { label, bid: bestPrice(book.bids, Math.max), ask: bestPrice(book.asks, Math.min) };
  }));
  return { slug, quotes };
}

function bestPrice(levels, select) {
  const prices = (levels ?? []).map(level => Number(level.price))
    .filter(price => price > 0 && price < 1);
  return prices.length ? select(...prices) : null;
}

export default async function handler(req) {
  if (req.method !== 'GET') return new Response(null, { status: 405 });
  try {
    await member();
    const start = Math.floor(Date.now() / roundMs) * roundMs;
    const end = start + roundMs;
    const results = await Promise.allSettled(coins.map(coin => loadMarket(coin, start)));
    const observedAt = Date.now();
    const markets = results.map((result, index) => ({
      coin: coins[index].toUpperCase(),
      market: observedAt < end && result.status === 'fulfilled' ? result.value : null,
    }));
    return Response.json({ end, observedAt, markets }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
