import {demoWakeFailureCode} from './demo-wake-outcome.mjs';

// Fixed allowlists only. Never put exception text, credentials or response bodies in logs.
const PHASES=new Set(['BALANCE','ORDERS','FILLS','POSITIONS','SETTLEMENTS']);
const CATEGORIES=Object.freeze({
 TimeoutError:'TIMEOUT',AbortError:'ABORTED',SyntaxError:'INVALID_JSON',TypeError:'REQUEST_ERROR'
});
export function sanitizedDemoSnapshotFailure(error,{durationMs,trigger}={}){
 return {
  event:'DEMO_SNAPSHOT_READ_FAILED',
  phase:PHASES.has(error?.snapshotPhase)?error.snapshotPhase:'UNKNOWN',
  cause:demoWakeFailureCode(error?.message),
  category:Object.hasOwn(CATEGORIES,error?.name)?CATEGORIES[error.name]:'UNKNOWN',
  durationMs:Number.isFinite(durationMs)?Math.max(0,Math.floor(durationMs)):null,
  trigger:trigger==='worker'?'worker':'schedule'
 };
}
