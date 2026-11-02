import {SETTLEMENT_VERIFICATION} from './official-settlement.mjs';

// Audit the older gross-return/lesson reports with the same forward-only,
// officially finalized evidence requirements as the cost-aware comparison.
// This is a read-only filter: it does not modify models or trading decisions.
const validBuy = x => x && x.resolved === true &&
  ((x.action === 'BUY UP' && x.side === 'up') ||
   (x.action === 'BUY DOWN' && x.side === 'down')) &&
  Number.isFinite(x.ask) && x.ask > 0 && x.ask < 100 &&
  typeof x.won === 'boolean' && Number.isFinite(x.pnl);

function validEngine(x, outcome) {
  if (!validBuy(x)) return false;
  const won = (x.side === 'up') === (outcome === 'yes');
  return x.won === won &&
    Math.abs(x.pnl - Number(((won ? 1 : 0) - x.ask / 100).toFixed(4))) <= 0.0001;
}

export function verifiedComparisonEvidence(records) {
  const byTicker = new Map(), conflicts = new Set();
  let rejected = 0;
  for (const r of Array.isArray(records) ? records : []) {
    const original = r?.engines?.original;
    const upgraded = r?.engines?.upgraded;
    const valid = r?.status === 'RESOLVED' &&
      typeof r.ticker === 'string' && r.ticker.length > 0 &&
      r.outcomeVerification === SETTLEMENT_VERIFICATION &&
      ['yes', 'no'].includes(r.outcome) &&
      Number.isFinite(r.at) && r.at > 0 &&
      Number.isFinite(r.expiresAt) && r.at < r.expiresAt &&
      Number.isFinite(r.resolvedAt) && r.resolvedAt >= r.expiresAt &&
      validEngine(original, r.outcome) &&
      (upgraded?.action === 'WAIT' && upgraded.resolved !== true ||
       validEngine(upgraded, r.outcome));
    if (!valid) rejected++;
    if (typeof r?.ticker !== 'string' || !r.ticker) continue;
    // An invalid copy of a ticker can contradict an otherwise verified copy.
    // Keep it as conflict evidence, never as a usable resolved observation.
    const decision = x => x ? [x.action ?? null, x.side ?? null,
      x.ask ?? null, x.resolved === true] : null;
    const fingerprint = JSON.stringify([r.status, r.outcomeVerification ?? null,
      r.at ?? null, r.expiresAt ?? null, r.outcome ?? null,
      decision(original), decision(upgraded)]);
    const previous = byTicker.get(r.ticker);
    if (previous && (previous.fingerprint !== fingerprint || previous.valid !== valid))
      conflicts.add(r.ticker);
    else if (!previous) byTicker.set(r.ticker, {row:r, fingerprint, valid});
  }
  const rows = [...byTicker].filter(([ticker,entry]) => entry.valid && !conflicts.has(ticker))
    .map(([,entry]) => entry.row);
  return {rows, rejected, conflictingMarketCount:conflicts.size};
}
