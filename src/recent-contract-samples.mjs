// Select only contemporaneous, same-contract minute samples for shadow research.
// Never scan the oldest blob-list page as if it were current market history.
// Conflicting copies of one minute are not independent market evidence: fail
// closed instead of letting insertion order pick a favorable momentum path.
export function recentContractSamples(rows, ticker, now, limit=8) {
  if (!Array.isArray(rows) || typeof ticker !== 'string' || !Number.isFinite(now)) return [];
  const byMinute=new Map();
  const quoteFields=['yesMid','yesBid','yesAsk','noBid','noAsk'];
  for (const r of rows) {
    if (r?.ticker !== ticker || !Number.isFinite(r.t) || !Number.isFinite(r.yesMid) ||
        r.t > now || r.t < now-480000 || r.yesMid < 0 || r.yesMid > 1) continue;
    const prior=byMinute.get(r.t);
    if (prior) {
      // Equal midpoints can still conceal contradictory executable bid/ask quotes.
      // Do not permit either version to drive shadow predictions or exit audits.
      if (quoteFields.some(field => !Object.is(prior[field], r[field]))) return [];
      continue; // Identical repeated evidence counts once; retain the first sample.
    }
    byMinute.set(r.t,r);
  }
  return [...byMinute.values()].sort((a,b)=>a.t-b.t).slice(-Math.max(1,Math.min(12,Math.trunc(limit)||8)));
}
