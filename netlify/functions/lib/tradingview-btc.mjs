export const feedKey = 'btc/latest';
export const maxAlertAgeMs = 20_000;
export const feedStore = 'bank-trades-tradingview';

export function parseAlert(body, receivedAt) {
  const { symbol, interval, candleCloseAt, direction, bullScore, bearScore } = body ?? {};
  if (typeof symbol !== 'string' || !/^[A-Z0-9_]+:BTCUSD$/.test(symbol) || interval !== '1S' ||
      !Number.isSafeInteger(candleCloseAt) || candleCloseAt % 1000 !== 0 ||
      candleCloseAt > receivedAt || receivedAt - candleCloseAt > maxAlertAgeMs ||
      !['UP', 'DOWN', 'MIXED'].includes(direction) ||
      ![bullScore, bearScore].every(score => Number.isInteger(score) && score >= 0 && score <= 13) ||
      (direction === 'UP' && bullScore <= bearScore) ||
      (direction === 'DOWN' && bearScore <= bullScore)) return null;
  return { symbol, interval, candleCloseAt, direction, bullScore, bearScore, receivedAt };
}

export async function recordAlert(store, alert) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const prior = await store.getWithMetadata(feedKey, { type: 'json' });
    if (prior?.data.candleCloseAt >= alert.candleCloseAt) return false;
    const write = await store.setJSON(feedKey, alert,
      prior ? { onlyIfMatch: prior.etag } : { onlyIfNew: true });
    if (write.modified) return true;
  }
  throw new Error('Concurrent alert update');
}

export function assessAlert(alert, roundOpensAt, roundClosesAt, now) {
  if (!alert) return { status: 'UNAVAILABLE' };
  if (!Number.isFinite(roundOpensAt) || !Number.isFinite(roundClosesAt) ||
      alert.candleCloseAt <= roundOpensAt || alert.candleCloseAt >= roundClosesAt || now >= roundClosesAt) {
    return { status: 'ROUND_MISMATCH' };
  }
  const ageMs = now - alert.candleCloseAt;
  if (ageMs < 0 || ageMs > maxAlertAgeMs) return { status: 'STALE', ageMs };
  return { status: 'FRESH', ...alert, ageMs, deliveryMs: alert.receivedAt - alert.candleCloseAt };
}
