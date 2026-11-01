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
  let recoveredFromRolling = 0;
  // Archive wins ties: the first immutable sample is the research evidence.
  for (const row of Array.isArray(archive) ? archive : []) {
    if (valid(row)) merged.set(row.t + '/' + row.ticker, row);
  }
  for (const row of Array.isArray(rolling) ? rolling : []) {
    if (!valid(row)) continue;
    const key = row.t + '/' + row.ticker;
    if (!merged.has(key)) {
      merged.set(key, row);
      recoveredFromRolling++;
    }
  }
  const records = [...merged.values()]
    .sort((a,b) => a.t - b.t || a.ticker.localeCompare(b.ticker))
    .slice(-limit);
  return {records, recoveredFromRolling};
}
