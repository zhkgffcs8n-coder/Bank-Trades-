import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../btc-lock-radar.js', import.meta.url), 'utf8');
const livePath = source.slice(
  source.indexOf('const positions=new Map();'),
  source.lastIndexOf("waitForData('Checking "),
);

test('Main PRO SCALPER keeps its original feed, entry, and exit path', () => {
  // Baseline from 725dc880ac87e160374c79bbdeade7280b3823b9.
  // Keep shadow observers outside this path, including its feed evaluation.
  assert.equal(createHash('sha256').update(livePath).digest('hex'),
    'e4eeaaae8a0d635a4cd53ace875229ca29c825898aaf6347ab9ec48d71fe12e3');
});

for (const side of ['up', 'down']) {
  for (const [exit, bid, seconds] of [['TAKE PROFIT', 68, 120], ['SELL FAST', 55, 120], ['TIME EXIT', 59, 90]]) {
    test(`Main PRO SCALPER preserves ${side} entry, hold, and ${exit}`, () => {
      const now = Date.parse('2026-11-11T22:00:00Z');
      const ticker = 'KXBTC15M-REGRESSION';
      const scalpLabel = {};
      const assess = runInNewContext(livePath + '\nassess', {
        Date: class extends Date { static now() { return now; } },
        selectedCoin: 'BTC',
        box: { querySelector: () => ({}) },
        window: {},
        scalpLabel,
        scalpAction: { style: {} },
        scalpIcon: {},
        scalpDetail: {},
        scalpMotion: null,
        actionLooks: new Proxy({}, { get: () => ['', '', '', null] }),
        sharedScalpCall: null,
      });
      const evidence = {
        at: now, candleAt: now - 60_000, direction: side,
        bull: side === 'up' ? 6 : 2, bear: side === 'down' ? 6 : 2,
      };
      function tick(left, quote, expected, spot = evidence, contract = ticker) {
        const close = new Date(now + left * 1000).toISOString();
        assess('BTC', {
          ticker: contract, expires_at: close, close_time: close,
          yes_ask: side === 'up' ? Math.max(60, quote) : 41,
          yes_bid: side === 'up' ? quote : 40,
          no_ask: side === 'down' ? Math.max(60, quote) : 41,
          no_bid: side === 'down' ? quote : 40,
        }, spot, true);
        assert.equal(scalpLabel.textContent, expected);
      }
      const direction = side.toUpperCase();
      tick(179, 59, 'NO ENTRY');
      tick(180, 56, 'NO ENTRY');
      tick(180, 59, 'BUY ' + direction + ' SETUP');
      tick(150, 59, 'HOLD ' + direction, { ...evidence, direction: 'mixed' });
      tick(seconds, bid, exit + ' ' + direction);
      tick(seconds - 1, 59, exit + ' ' + direction);
      tick(180, 59, 'BUY ' + direction + ' SETUP', evidence, ticker + '-NEXT');
    });
  }
}
