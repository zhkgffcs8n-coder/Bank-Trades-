import { timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { feedStore, parseAlert, recordAlert } from './lib/tradingview-btc.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const receivedAt = Date.now();
  const secret = process.env.TRADINGVIEW_BTC_WEBHOOK_KEY;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) return new Response(null, { status: 503 });
  const supplied = new URL(request.url).searchParams.get('key') ?? '';
  if (!/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(secret, 'hex'))) {
    return new Response(null, { status: 401 });
  }

  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks = [];
    let byteCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.length;
      if (byteCount > 2048) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(Buffer.from(value));
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return new Response(null, { status: 400 });
  }
  const alert = parseAlert(body, receivedAt);
  if (!alert) return new Response(null, { status: 422 });

  try {
    const store = getStore({ name: feedStore, consistency: 'strong' });
    return new Response(null, { status: await recordAlert(store, alert) ? 201 : 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
