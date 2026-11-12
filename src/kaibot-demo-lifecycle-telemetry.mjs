// Read-only, sanitized status telemetry. Never expose order IDs, account data,
// owner identity, credentials, or full lifecycle state in worker health.
const stageNames=new Set(['INITIALIZE','ACCOUNT_SNAPSHOT','ACCOUNT_RECONCILIATION','ENTRY_ACCOUNT_SNAPSHOT','ENTRY_QUOTE','FIND_MARKET','RECORD_ENTRY_ATTEMPT','SUBMIT_ENTRY','VERIFY_ENTRY','EXIT_QUOTE','RECORD_EXIT_ATTEMPT','SUBMIT_EXIT','VERIFY_EXIT']);
const statusCode=value=>typeof value==='string'&&/^DEMO_[A-Z0-9_]{3,80}$/.test(value)?value:null;
const errorCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{2,80}$/.test(value)?value:null;
const lockStatuses=new Set(['LOCK_RELEASED','LOCK_REQUIRES_REVIEW','SNAPSHOT_INCOMPLETE','EXECUTION_CHANGED_DURING_INSPECTION','INSPECTION_UNAVAILABLE','KALSHI_HTTP_429','KALSHI_HTTP_401','KALSHI_HTTP_403','KALSHI_HTTP_503']);
const reconcileStatuses=new Set(['RECONCILED_READ_ONLY','UNRESOLVED_ORDER','POSITION_MISMATCH','POSITION_MISSING','RECONCILIATION_UNAVAILABLE',
 'INCOMPLETE_ACCOUNT_SNAPSHOT','CONFLICTING_CACHED_ORDERS','CONFLICTING_CACHED_FILLS','CONFLICTING_CACHED_SETTLEMENTS',
 'DUPLICATE_OR_INVALID_ORDER','INVALID_FILL','CONFLICTING_FILL','INVALID_POSITION','ORDER_TICKER_MISMATCH',
 'INVALID_FILL_COUNT','FILL_COUNT_MISMATCH','ORDER_NOT_TERMINAL','UNMANAGED_RESTING_ORDER',
 'UNRECONCILED_RISK','FILL_ID_MISSING','INVALID_FILL_TIME_OR_QUANTITY','FILL_TICKER_MISMATCH',
 'INVALID_FILL_PRICE','MISSING_FILL_QUANTITY','MISSING_FILL_FEES','INVALID_FILL_QUANTITY','INVALID_FILL_FEES',
 'UNEXPECTED_SIDE_CHANGE','INVALID_FILL_TIME_OR_QUANTITY','DUPLICATE_SETTLEMENT','SETTLEMENT_MISMATCH','SETTLEMENT_REVENUE_MISMATCH']);
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000?value:null;
export function sanitizeDemoLockEvidence(raw){
 if(!raw||typeof raw!=='object')return null;
 return {status:lockStatuses.has(raw.status)?raw.status:'UNRECOGNIZED_LOCK_STATUS',
  lockAt:Number.isFinite(raw.lockAt)&&raw.lockAt>=0?raw.lockAt:null,
  authenticatedSnapshot:raw.authenticatedSnapshot===true,
  intents:count(raw.intents),matchedOrders:count(raw.matchedOrders),
  unresolvedIntents:count(raw.unresolvedIntents),
  reconciliation:raw.reconciliation&&typeof raw.reconciliation==='object'?{
   status:reconcileStatuses.has(raw.reconciliation.status)?raw.reconciliation.status:'UNRECOGNIZED_RECONCILIATION',
   openPositions:count(raw.reconciliation.openPositions)
  }:null};
}
export function sanitizeDemoLifecycleReceipt(raw){
 if(!raw||typeof raw!=='object')return {status:'NO_SAVED_DEMO_LIFECYCLE'};
 const checkedAt=typeof raw.checkedAt==='number'&&Number.isFinite(raw.checkedAt)?raw.checkedAt:
  typeof raw.checkedAt==='string'&&Number.isFinite(Date.parse(raw.checkedAt))?Date.parse(raw.checkedAt):null;
 return {status:statusCode(raw.status)||'UNRECOGNIZED_DEMO_LIFECYCLE_STATUS',
  checkedAt,finished:raw.finished===true,stage:stageNames.has(raw.stage)?raw.stage:null,
  attempts:Number.isSafeInteger(raw.attempts)&&raw.attempts>=0&&raw.attempts<=8?raw.attempts:null,
  error:errorCode(raw.error),snapshotCause:errorCode(raw.snapshotCause),
  ...(raw.lockEvidence&&typeof raw.lockEvidence==='object'?{lockEvidence:sanitizeDemoLockEvidence(raw.lockEvidence)}:{}),
  upRoundTripVerified:raw.upRoundTripVerified===true,
  downRoundTripVerified:raw.downRoundTripVerified===true,
  executionTest:raw.mode==='DEMO_EXECUTION_TEST',
  commit:typeof raw.commit==='string'&&/^[a-f0-9]{40}$/.test(raw.commit)?raw.commit:null};
}
export async function readSanitizedDemoLifecycle(store){
 if(!store)return {status:'LIFECYCLE_STORE_UNCONFIGURED'};
 try{return sanitizeDemoLifecycleReceipt(await store.get('lifecycle-status',{type:'json'}));}
 catch{return {status:'LIFECYCLE_RECEIPT_READ_UNAVAILABLE'};}
}
