import assert from 'node:assert/strict';
import test from 'node:test';
import {researchFee, settleShadow, stepShadow} from '../src/v22-paper-lifecycle.mjs';

const sample = (at, yes = 0.48, no = 0.50, size = 10) => ({
  ticker: 'BTC-1', at, closesAt: 10000, feeMultiplier: 1,
  book: {yes: {price: yes, size}, no: {price: no, size}},
});

test('fills on later executable quotes with one-contract depth and both taker fees', () => {
  const signal = stepShadow(null, sample(1000), 'UP');
  assert.equal(signal.intent.action, 'BUY UP');
  assert.equal(stepShadow(signal, sample(1300), null).entry, undefined);
  assert.equal(stepShadow(signal, sample(1600, 0.48, 0.50, 0.5), null).entry, undefined);
  const entry = stepShadow(signal, sample(1800, 0.47, 0.49), null);
  assert.equal(entry.entry.price, 0.51);
  const exit = stepShadow(entry, sample(3000, 0.65, 0.33), null);
  assert.equal(exit.intent.action, 'TAKE PROFIT');
  const filled = stepShadow(exit, sample(3600, 0.62, 0.36), null);
  assert.equal(filled.closed.exit.price, 0.62);
  assert.equal(filled.closed.fees, researchFee(0.51, 1) + researchFee(0.62, 1));
  assert.equal(stepShadow(filled, sample(5000), 'DOWN'), filled);
});

test('unfilled attempts expire and open positions can settle once', () => {
  const signal = stepShadow(null, sample(1000), 'DOWN');
  assert.equal(stepShadow(signal, sample(7000), null).missedFills, 1);
  const entered = stepShadow(signal, sample(2000), null);
  const closed = settleShadow(entered, 'no', 12000);
  assert.equal(closed.closed.exit.price, 1);
  assert.equal(closed.closed.fees, entered.entry.fee);
  assert.equal(settleShadow(closed, 'no', 13000), closed);
});
