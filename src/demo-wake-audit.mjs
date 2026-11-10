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
