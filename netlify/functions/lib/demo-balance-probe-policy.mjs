// Bound read-only credential checks so a previous receipt cannot stay fresh forever.
// A scheduled retry is not an authorization to place orders.
export const SAVED_DEMO_BALANCE_PROBE_MAX_AGE_MS = 15 * 60 * 1000;

export function shouldRefreshSavedDemoBalanceProbe(previous, {
  commit = null, credentialCheckedAt = null, now = Date.now()
} = {}) {
  if (!previous || previous.commit !== commit ||
      previous.credentialCheckedAt !== credentialCheckedAt) return true;
  const last = Date.parse(previous.checkedAt);
  return !Number.isFinite(last) || last > now ||
    now - last >= SAVED_DEMO_BALANCE_PROBE_MAX_AGE_MS;
}
