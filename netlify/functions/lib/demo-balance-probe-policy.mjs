// Bound read-only credential checks so a previous receipt cannot stay fresh forever.
// A scheduled retry is not an authorization to place orders.
export const SAVED_DEMO_BALANCE_PROBE_MAX_AGE_MS = 15 * 60 * 1000;
// Retry only transient transport/server failures sooner. Persistent auth failures
// retain the normal TTL, avoiding repeated requests with invalid credentials.
export const SAVED_DEMO_BALANCE_TRANSIENT_RETRY_MS = 2 * 60 * 1000;
const TRANSIENT_BALANCE_STATUSES = new Set([
  'DEMO_TRANSPORT_ERROR', 'KALSHI_HTTP_408', 'KALSHI_HTTP_429',
  'KALSHI_HTTP_500', 'KALSHI_HTTP_502', 'KALSHI_HTTP_503', 'KALSHI_HTTP_504'
]);

export function shouldRefreshSavedDemoBalanceProbe(previous, {
  commit = null, credentialCheckedAt = null, now = Date.now()
} = {}) {
  if (!previous || previous.commit !== commit ||
      previous.credentialCheckedAt !== credentialCheckedAt) return true;
  const last = Date.parse(previous.checkedAt);
  const maxAge = TRANSIENT_BALANCE_STATUSES.has(previous.status)
    ? SAVED_DEMO_BALANCE_TRANSIENT_RETRY_MS
    : SAVED_DEMO_BALANCE_PROBE_MAX_AGE_MS;
  return !Number.isFinite(last) || last > now || now - last >= maxAge;
}
