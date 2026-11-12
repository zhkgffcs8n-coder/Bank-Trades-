// Read-only, sanitized status telemetry. Never expose order IDs, account data,
// owner identity, credentials, or full lifecycle state in worker health.
const stageNames=new Set(['INITIALIZE','ACCOUNT_SNAPSHOT','ACCOUNT_RECONCILIATION','ENTRY_ACCOUNT_SNAPSHOT','ENTRY_QUOTE','FIND_MARKET','RECORD_ENTRY_ATTEMPT','SUBMIT_ENTRY','VERIFY_ENTRY','EXIT_QUOTE','RECORD_EXIT_ATTEMPT','SUBMIT_EXIT','VERIFY_EXIT']);
const statusCode=value=>typeof value==='string'&&/^DEMO_[A-Z0-9_]{3,80}$/.test(value)?value:null;
const errorCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{2,80}$/.test(value)?value:null;
export function sanitizeDemoLifecycleReceipt(raw){
 if(!raw||typeof raw!=='object')return {status:'NO_SAVED_DEMO_LIFECYCLE'};
 const checkedAt=typeof raw.checkedAt==='number'&&Number.isFinite(raw.checkedAt)?raw.checkedAt:
  typeof raw.checkedAt==='string'&&Number.isFinite(Date.parse(raw.checkedAt))?Date.parse(raw.checkedAt):null;
 return {status:statusCode(raw.status)||'UNRECOGNIZED_DEMO_LIFECYCLE_STATUS',
  checkedAt,finished:raw.finished===true,stage:stageNames.has(raw.stage)?raw.stage:null,
  attempts:Number.isSafeInteger(raw.attempts)&&raw.attempts>=0&&raw.attempts<=8?raw.attempts:null,
  error:errorCode(raw.error),snapshotCause:errorCode(raw.snapshotCause),
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
