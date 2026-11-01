// Read-only market-history recovery when a bounded archive scan cannot reach
// the newest timestamp keys. Never treat the rolling cache as a complete archive.
export function mergeRecentMarketHistory(archive, rolling, asset, cutoff, now, limit=300) {
  if (typeof asset !== 'string' || !Number.isFinite(cutoff) ||
      !Number.isFinite(now) || !Number.isInteger(limit) || limit < 1) {
    throw new Error('Invalid market-history window');
  }
  const valid = row => row && row.asset === asset &&
    typeof row.ticker === 'string' && row.ticker.length > 0 &&
    Number.isFinite(row.t) && row.t >= cutoff && row.t <= now;
  const merged = new Map();
  // Archive wins ties: the first immutable sample is the research evidence.
  for (const row of Array.isArray(archive) ? archive : []) {
    if (valid(row)) merged.set(row.t + '/' + row.ticker, {row, fromRolling:false});
  }
  for (const row of Array.isArray(rolling) ? rolling : []) {
    if (!valid(row)) continue;
    const key = row.t + '/' + row.ticker;
    if (!merged.has(key)) {
      merged.set(key, {row, fromRolling:true});
    }
  }
  const selected = [...merged.values()]
    .sort((a,b) => a.row.t - b.row.t || a.row.ticker.localeCompare(b.row.ticker))
    .slice(-limit);
  return {records:selected.map(x=>x.row),
    recoveredFromRolling:selected.filter(x=>x.fromRolling).length};
}
