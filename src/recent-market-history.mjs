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
  const merged = new Map(), conflicts = new Set();
  // Conflicting copies within one source are not independent market evidence.
  // Compare the observed quote and contract expiry, not incidental metadata.
  const quoteFields = ['yesMid','yesBid','yesAsk','noBid','noAsk','spread','expiresAt'];
  const sameQuote = (a,b) => quoteFields.every(field => Object.is(a[field],b[field]));
  const add = (row,fromRolling) => {
    if (!valid(row)) return;
    const key = row.t + '/' + row.ticker;
    if (conflicts.has(key)) return;
    const previous = merged.get(key);
    if (previous) {
      // An immutable archive row wins over a rolling-cache copy; the cache
      // may contain a later quote from the same minute, not an archive conflict.
      if (fromRolling && !previous.fromRolling) return;
      if (!sameQuote(previous.row,row)) {
        merged.delete(key);
        conflicts.add(key);
      }
      return;
    }
    merged.set(key,{row,fromRolling});
  };
  for (const row of Array.isArray(archive) ? archive : []) add(row,false);
  for (const row of Array.isArray(rolling) ? rolling : []) add(row,true);
  const selected = [...merged.values()]
    .sort((a,b) => a.row.t - b.row.t || a.row.ticker.localeCompare(b.row.ticker))
    .slice(-limit);
  return {records:selected.map(x=>x.row),
    recoveredFromRolling:selected.filter(x=>x.fromRolling).length,
    conflictingSampleCount:conflicts.size};
}
