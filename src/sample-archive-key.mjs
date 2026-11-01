// Samples are keyed as samples/<asset>/<minute-ms> for legacy rows, and
// samples/<asset>/<minute-ms>/<contract-ticker> for current immutable rows.
// The final path segment is NOT necessarily a timestamp.
export function sampleTimestampFromKey(key, asset) {
 if (typeof key !== 'string' || typeof asset !== 'string' || !asset) return null;
 const parts=key.split('/');
 if ((parts.length!==3 && parts.length!==4) ||
     parts[0]!=='samples' || parts[1]!==asset ||
     (parts.length===4 && !parts[3])) return null;
 // The collector uses 13-digit Unix epoch milliseconds, rounded to a minute.
 if (!/^\d{13}$/.test(parts[2])) return null;
 const timestamp=Number(parts[2]);
 return Number.isSafeInteger(timestamp) && timestamp>0 ? timestamp : null;
}
