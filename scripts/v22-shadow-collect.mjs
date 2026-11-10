// Standalone research worker. Public market data only, with its own journal.
import {mkdir, open, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {openPredatorTape} from '../src/predator-stream.mjs';
import {predatorObservation} from '../src/btc-predator.mjs';
import {parseDepthV8} from '../src/scalper-v8.mjs';
import {verifiedFinalizedBinaryOutcome} from '../src/official-settlement.mjs';
import {stepShadow, settleShadow} from '../src/v22-paper-lifecycle.mjs';

const directory = process.env.V22_SHADOW_STATE_DIR;
if (!directory || resolve(directory) === resolve(process.env.PREDATOR_STATE_DIR ?? '/data')) {
  throw Error('Set V22_SHADOW_STATE_DIR to a dedicated research directory');
}
const maxSamples = Number(process.env.V22_SHADOW_MAX_SAMPLES ?? Infinity);
if (!(maxSamples === Infinity || Number.isSafeInteger(maxSamples) && maxSamples > 0)) {
  throw Error('V22_SHADOW_MAX_SAMPLES must be a positive integer');
}
const get = async path => {
  const response = await fetch('https://external-api.kalshi.com/trade-api/v2/' + path,
    {signal: AbortSignal.timeout(4000)});
  if (!response.ok) throw Error('KALSHI_HTTP_' + response.status);
  return response.json();
};
const series = (await get('series/KXBTC15M')).series;
await mkdir(directory, {recursive: true, mode: 0o700});
const path = resolve(directory, 'v22-observations.ndjson');
const journal = await open(path, 'a+', 0o600);
const states = new Map();
const feeRules = new Map();
for (const line of (await readFile(path, 'utf8')).split('\n').filter(Boolean)) {
  const row = JSON.parse(line);
  if (row.states) states.set(row.ticker, row.states);
}
async function append(row) {
  try {
    await journal.appendFile(JSON.stringify(row) + '\n');
    await journal.sync();
  } catch (cause) {
    throw new Error('Research journal write failed', {cause});
  }
}
const tape = openPredatorTape();
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopping = true; });
let recorded = 0;
let nextSettlement = 0;
try {
  while (!stopping && recorded < maxSamples) {
    try {
      if (Date.now() >= nextSettlement) {
        nextSettlement = Date.now() + 30000;
        for (const [ticker, engines] of states) {
          if (!Object.values(engines).some(state => state.entry && !state.closed)) continue;
          const market = (await get('markets/' + encodeURIComponent(ticker))).market;
          const at = Date.now();
          const outcome = verifiedFinalizedBinaryOutcome(market, ticker);
          if (!outcome) continue;
          const settled = Object.fromEntries(Object.entries(engines).map(([name, state]) =>
            [name, settleShadow(state, outcome, at)]));
          await append({kind: 'SETTLEMENT', ticker, at, outcome, states: settled});
          states.set(ticker, settled);
        }
      }
      const {markets} = await get('markets?series_ticker=KXBTC15M&status=open&limit=20');
      const now = Date.now();
      const market = markets.filter(row => Date.parse(row.close_time) > now)
        .sort((a, b) => Date.parse(a.close_time) - Date.parse(b.close_time))[0];
      if (market) {
        const {ticker, event_ticker: eventTicker} = market;
        if (!feeRules.has(eventTicker)) {
          const {event} = await get('events/' + encodeURIComponent(eventTicker));
          const type = event.fee_type_override ?? series.fee_type;
          feeRules.set(eventTicker, type === 'quadratic' ? event.fee_multiplier_override ?? series.fee_multiplier : null);
        }
        const requestedAt = Date.now();
        const payload = await get('markets/' + encodeURIComponent(ticker) + '/orderbook?depth=1');
        const at = Date.now();
        const closesAt = Date.parse(market.close_time);
        const book = at - requestedAt <= 1500 ? parseDepthV8(payload, ticker, at) : null;
        const trades = tape.snapshot().tape;
        const observation = book ? predatorObservation({ticker, now: at, bookAt: at,
          remaining: (closesAt - at) / 1000, yes: book.yes, no: book.no, trades}) : null;
        const sample = {ticker, at, closesAt, book, feeMultiplier: feeRules.get(eventTicker)};
        const signals = {
          MomentumResearch: observation?.baselineSide ?? null,
          EarlyFlowResearch: observation?.early ? observation.side : null,
        };
        const prior = states.get(ticker);
        const next = Object.fromEntries(Object.entries(signals).map(([name, signal]) =>
          [name, stepShadow(prior?.[name], sample, signal)]));
        await append({kind: 'SAMPLE', mode: 'PUBLIC_REST_RESEARCH', ...sample, requestedAt,
          tapeEventAt: trades.at(-1)?.time ?? null, observation, signals, states: next});
        states.set(ticker, next);
        recorded++;
      }
    } catch (error) {
      // Storage failure must stop the worker before it can make another decision.
      if (error.message === 'Research journal write failed') throw error;
      console.error('V22 sample unavailable:', /^KALSHI_HTTP_\d+$/.test(error.message) ? error.message : error.name);
    }
    if (!stopping && recorded < maxSamples) await delay(2500);
  }
} finally {
  tape.close();
  await journal.close();
}
console.log(JSON.stringify({mode: 'SHADOW_ONLY', recorded, ordersAuthorized: false}));
