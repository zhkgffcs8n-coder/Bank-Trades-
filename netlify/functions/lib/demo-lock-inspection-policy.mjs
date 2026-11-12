// Read-only diagnostic cadence only. Never changes lock recovery, order
// submission, STOP, reconciliation, or release-gate decisions.
export const DEMO_LOCK_INSPECTION_INTERVAL_MS=10*60*1000;
export function shouldRefreshDemoLockInspection(previous,now=Date.now()){
 if(!previous?.lockEvidence||!Number.isFinite(previous.lockEvidenceCheckedAt))return true;
 const elapsed=now-previous.lockEvidenceCheckedAt;
 return elapsed<0||elapsed>=DEMO_LOCK_INSPECTION_INTERVAL_MS;
}
