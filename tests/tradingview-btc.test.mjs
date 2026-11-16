import assert from 'node:assert/strict';
import test from 'node:test';
import { assessAlert, parseAlert, recordAlert, tradingViewEntryCheck } from '../netlify/functions/lib/tradingview-btc.mjs';

const close = 1_800_000_000_000;
const payload = { symbol: 'CRYPTO:BTCUSD', interval: '1S', candleCloseAt: close, direction: 'UP', bullScore: 6, bearScore: 3 };

test('accepts timestamped closed BTCUSD 1S alerts and rejects invalid inputs', () => {
  assert.equal(parseAlert(payload, close + 100).receivedAt, close + 100);
  assert.equal(parseAlert({ ...payload, interval: '5S' }, close), null);
  assert.equal(parseAlert({ ...payload, direction: 'DOWN' }, close), null);
  assert.equal(parseAlert(payload, close - 1), null);
  assert.equal(parseAlert(payload, close + 20_001), null);
});

test('checks round boundaries and distinguishes delivery delay from decision age', () => {
  const alert = parseAlert(payload, close + 100);
  assert.equal(assessAlert(alert, close, close + 900_000, close + 100).status, 'ROUND_MISMATCH');
  assert.equal(assessAlert(alert, close - 1000, close + 900_000, close + 20_001).status, 'STALE');
  const result = assessAlert(alert, close - 1000, close + 900_000, close + 250);
  assert.equal(result.status, 'FRESH');
  assert.equal(result.ageMs, 250);
  assert.equal(result.deliveryMs, 100);
});

test('concurrent writes cannot replace a newer alert with stale or duplicate data', async () => {
  let state = null;
  const store = {
    async getWithMetadata() { return state; },
    async setJSON(key, data, options) {
      if (state ? state.etag !== options.onlyIfMatch : !options.onlyIfNew) return { modified: false };
      state = { etag: String(data.candleCloseAt), data };
      return { modified: true };
    }
  };
  const earlier = parseAlert(payload, close);
  const later = parseAlert({ ...payload, candleCloseAt: close + 1000 }, close + 1000);
  await Promise.all([recordAlert(store, later), recordAlert(store, earlier)]);
  assert.deepEqual(state.data, later);
  assert.equal(await recordAlert(store, later), false);
  assert.equal(await recordAlert(store, earlier), false);
});

test('enabled entry check requires a fresh, same-round, agreeing signal and a Kalshi target', () => {
  const feed = { enabled: true, ticker: 'round-a', status: 'FRESH', direction: 'UP', candleCloseAt: close };
  assert.equal(tradingViewEntryCheck(feed, 'round-a', 'up', 64000, close + 100), null);
  assert.ok(tradingViewEntryCheck(feed, 'round-b', 'up', 64000, close + 100));
  assert.ok(tradingViewEntryCheck(feed, 'round-a', 'down', 64000, close + 100));
  assert.ok(tradingViewEntryCheck(feed, 'round-a', 'up', 0, close + 100));
  assert.ok(tradingViewEntryCheck(feed, 'round-a', 'up', 64000, close + 20001));
});
