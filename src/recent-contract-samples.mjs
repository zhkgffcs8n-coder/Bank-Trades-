// Select only contemporaneous, same-contract minute samples for shadow research.
// Never scan the oldest blob-list page as if it were current market history.
export function recentContractSamples(rows, ticker, now, limit=8) {
  if (!Array.isArray(rows) || typeof ticker !== 'string' || !Number.isFinite(now)) return [];
  const byMinute=new Map();
  for (const r of rows) {
    if (r?.ticker !== ticker || !Number.isFinite(r.t) || !Number.isFinite(r.yesMid) ||
        r.t > now || r.t < now-480000 || r.yesMid < 0 || r.yesMid > 1 ||
        (r.observedAt != null && (!Number.isFinite(Number(r.observedAt)) || Number(r.observedAt)>now))) continue;
    const prior=byMinute.get(r.t);
    if (!prior || (Number(r.observedAt)||0) > (Number(prior.observedAt)||0)) byMinute.set(r.t,r);
  }
  return [...byMinute.values()].sort((a,b)=>a.t-b.t).slice(-Math.max(1,Math.min(12,Math.trunc(limit)||8)));
}
