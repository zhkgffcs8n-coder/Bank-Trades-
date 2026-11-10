import {reconcile} from '../../../src/live-execution.mjs';
import {accountRisk} from '../../../src/live-accounting.mjs';

// Scheduled Demo invocations cannot survive this quarantine window. Require
// current exchange evidence as well, since a request can outlive its caller.
const quarantineMs=15*60*1000;
export async function recoverTerminalDemoState(record,client,clock=Date.now){
 const {lock,state}=record;
 if(!Number.isFinite(lock?.at)||clock()-lock.at<quarantineMs||!state?.intents?.length)return null;
 try{
  const snapshot=await client.snapshot();
  const recovered=structuredClone(state);
  reconcile(recovered,snapshot,clock());
  if(recovered.intents.some(intent=>!['RECONCILED','ABORTED'].includes(intent.status)))return null;
  if(accountRisk(recovered,snapshot,clock()).open.length)return null;
  return recovered;
 }catch{
  return null;
 }
}
