// Combine bounded current snapshots with an archival page. Archive listings can
// begin with the oldest keys, so they must not hide the live rolling window.
export function visibleMarketSamples(archived, rolling, asset, cutoff, limit=240) {
  if (typeof asset !== 'string' || !Number.isFinite(cutoff)) return [];
  const byContractMinute = new Map();
  for (const r of [...(Array.isArray(archived) ? archived : []), ...(Array.isArray(rolling) ? rolling : [])]) {
    if (!r || r.asset !== asset || typeof r.ticker !== 'string' ||
        !Number.isFinite(r.t) || r.t < cutoff || !Number.isFinite(r.yesMid) ||
        r.yesMid < 0 || r.yesMid > 1) continue;
    const key = r.ticker + ':' + r.t;
    const previous = byContractMinute.get(key);
    if (!previous || (Number(r.observedAt) || 0) >= (Number(previous.observedAt) || 0)) byContractMinute.set(key, r);
  }
  return [...byContractMinute.values()].sort((a, b) => a.t - b.t)
    .slice(-Math.max(1, Math.min(240, Math.trunc(limit) || 240)));
}
