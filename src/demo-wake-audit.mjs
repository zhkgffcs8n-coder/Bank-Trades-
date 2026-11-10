import {demoWakeLifecycleStatus} from './demo-wake-outcome.mjs';
// A worker restart destroys the in-memory wake queue and any in-flight promise.
// Do not replay an exchange-facing Demo request from a stale persisted record:
// delivery may already have happened, and a signal expires after ten seconds.
// Mark uncertainty explicitly without changing the champion decision or order gates.
export function recoverInterruptedDemoWakeAudit(state,now=Date.now()){
 if(!Array.isArray(state?.demoWakeAudit))return false;
 let changed=false;
 for(const event of state.demoWakeAudit){
  if(!event||typeof event!=='object')continue;
  if(event.status==='QUEUED'||event.status==='SENDING'){
   event.status='DELIVERY_UNCONFIRMED_ON_RESTART';
   event.recoveredAt=now;
   changed=true;
  }
 }
 return changed;
}

// A 204 confirms the runner responded, not that a Demo order was attempted.
// Keep the allowlisted lifecycle gate with the same durable wake event.
export function recordDemoWakeAcknowledgment(event,response){
 event.status='RUNNER_ACKNOWLEDGED';
 event.httpStatus=Number.isInteger(response?.status)?response.status:null;
 event.lifecycleStatus=demoWakeLifecycleStatus(response?.headers?.get?.('x-demo-lifecycle-status'));
 return event;
}
