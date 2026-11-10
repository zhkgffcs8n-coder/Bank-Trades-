import assert from 'node:assert/strict';
import test from 'node:test';
import {scoreShadowRounds} from '../src/v22-shadow-scorecard.mjs';

const result = (grossPnl, fees) => ({
  verified: true,
  executionAttempts: 2,
  trades: [{grossPnl, fees, entryDelayMs: 100, exitEfficiency: 0.8}],
});
const skip = {verified: true, executionAttempts: 0, trades: []};

test('scores matched rounds, includes skips, excludes incomplete evidence and never promotes', () => {
  const first = {ticker: 'BTC-1', closedAt: 100, champion: result(1, 0.25), challenger: skip};
  const second = {ticker: 'BTC-2', closedAt: 200, champion: result(0, 0.25), challenger: result(2, 0.25)};
  const pending = {ticker: 'BTC-3', closedAt: 300, champion: result(50, 0), challenger: null};
  const score = scoreShadowRounds([second, pending, first]);
  assert.equal(score.pairedRounds, 2);
  assert.equal(score.excludedRounds, 1);
  assert.equal(score.champion.netPnl, 0.5);
  assert.equal(score.champion.maxRealizedDrawdown, 0.25);
  assert.equal(score.champion.executionReliability, 0.5);
  assert.equal(score.challenger.netPnl, 1.75);
  assert.equal(score.pairedNetPnlDelta, 1.25);
  assert.equal(score.promotionAuthorized, false);
  assert.throws(() => scoreShadowRounds([first, first]), /unique contract ticker/);
});
