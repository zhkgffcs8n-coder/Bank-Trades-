import { getStore } from '@netlify/blobs';
import { assessAlert, feedKey, feedStore } from './lib/tradingview-btc.mjs';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'GET only' }, 405);
  const params = new URL(request.url).searchParams;
  const ticker = params.get('ticker');
  const opensAt = Number(params.get('open'));
  const closesAt = Number(params.get('close'));
  if (!/^KXBTC15M-[A-Z0-9-]{1,48}$/.test(ticker ?? '') ||
      !Number.isSafeInteger(opensAt) || opensAt <= 0 ||
      !Number.isSafeInteger(closesAt) || closesAt - opensAt !== 900000) {
    return json({ error: 'Invalid BTC round' }, 400);
  }

  const enabled = process.env.TRADINGVIEW_BTC_ENTRIES === 'true';
  try {
    const alert = process.env.TRADINGVIEW_BTC_WEBHOOK_KEY
      ? await getStore({ name: feedStore, consistency: 'strong',
        fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(1200) })
      }).get(feedKey, { type: 'json' })
      : null;
    return json({ ...assessAlert(alert, opensAt, closesAt, Date.now()), ticker, enabled });
  } catch {
    return json({ ticker, enabled, status: 'UNAVAILABLE' });
  }
}
