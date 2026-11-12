import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePolymarketCall } from '../src/polymarket-call.mjs';

test('Polymarket call retains entry across reload and SKIP, rejects stale stops, and records fresh exits and flips', () => {
  const input = {
    ticker: 'btc-updown-15m-123', at: 1000, now: 1000, end: 900000, decision: 'UP',
    quotes: { up: { bid: 59, ask: 60 }, down: { bid: 40, ask: 41 } },
  };
  const bought = advancePolymarketCall(null, input);
  assert.equal(bought.entry, 60);
  const restored = JSON.parse(JSON.stringify(bought));
  assert.equal(advancePolymarketCall(restored, { ...input, decision: 'SKIP' }), restored);
  assert.equal(advancePolymarketCall(restored, {
    ...input, now: 16000, quotes: { ...input.quotes, up: { bid: 50, ask: 51 } },
  }), restored);
  const exited = advancePolymarketCall(restored, {
    ...input, at: 2000, now: 2000, quotes: { up: { bid: 74, ask: 75 }, down: { bid: 25, ask: 26 } },
  });
  assert.equal(exited.exit, 'TAKE PROFIT');
  assert.equal(exited.exitBid, 74);
  assert.equal(advancePolymarketCall(exited, { ...input, at: 3000, now: 3000, decision: 'DOWN' }).side, 'down');
  assert.equal(advancePolymarketCall(exited, { ...input, ticker: 'new-round', decision: 'SKIP' }), null);
});
