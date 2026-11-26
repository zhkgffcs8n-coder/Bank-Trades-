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
  const opposite = { ...input, at: 3000, now: 3000, decision: 'DOWN' };
  const watch = advancePolymarketCall(exited, opposite);
  assert.equal(watch.exit, 'TAKE PROFIT');
  assert.equal(advancePolymarketCall(watch, opposite), watch);
  const reset = advancePolymarketCall(watch, { ...opposite, at: 4000, now: 4000, decision: 'SKIP' });
  assert.equal(reset.flipWatchAt, null);
  assert.equal(advancePolymarketCall(watch, { ...opposite, at: 5000, now: 5000 }).side, 'down');
  assert.equal(advancePolymarketCall(exited, { ...input, ticker: 'new-round', decision: 'SKIP' }), null);
});

test('Polymarket buys and flips require a 40–80% entry ask', () => {
  const ticker = 'btc-updown-15m-123';
  const exited = { ticker, side: 'up', entry: 60, exit: 'TAKE PROFIT', updatedAt: 1000 };
  for (const ask of [1, 10, 39.99, 40, 80, 80.01, 90]) {
    const input = {
      ticker, at: 2000, now: 2000, end: 900000, decision: 'DOWN',
      quotes: { up: { bid: 100 - ask, ask: 100 - ask + .1 }, down: { bid: ask - .1, ask } },
    };
    const eligible = ask >= 40 && ask <= 80;
    assert.equal(advancePolymarketCall(null, input)?.entry, eligible ? ask : undefined);
    const watch = advancePolymarketCall(exited, input);
    assert.equal(watch.flipWatchAt, eligible ? 2000 : undefined);
    const flip = advancePolymarketCall(watch, { ...input, at: 3000, now: 3000 });
    assert.equal(flip.side, eligible ? 'down' : 'up');
  }
});
