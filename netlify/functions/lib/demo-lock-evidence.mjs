// Read-only evidence. An unchanged lock and a complete snapshot cannot rule out
// an in-flight order request, so this probe never releases or replaces a lock.
export async function inspectDemoLock(repo,client) {
 try{
  const before=await repo.read();
  if(!before.lock)return {status:'LOCK_RELEASED'};
  const snapshot=await client.snapshot();
  const after=await repo.read();
  if(before.lock.token!==after.lock?.token||
     JSON.stringify(before.state.intents)!==JSON.stringify(after.state.intents))
   return {status:'EXECUTION_CHANGED_DURING_INSPECTION'};

  const orders=Array.isArray(snapshot.orders)?snapshot.orders:[];
  const intents=after.state.intents;
  const intentIds=new Set(intents.map(intent=>intent.id));
  const matched=orders.filter(order=>intentIds.has(order.client_order_id));
  return {
   status:snapshot.complete===true?'LOCK_REQUIRES_REVIEW':'SNAPSHOT_INCOMPLETE',
   lockAt:Number.isFinite(before.lock.at)?before.lock.at:null,
   authenticatedSnapshot:snapshot.complete===true,
   intents:intents.length,
   matchedOrders:matched.length,
   unresolvedIntents:intents.filter(intent=>!matched.some(order=>order.client_order_id===intent.id)).length
  };
 }catch(error){
  const code=/^KALSHI_HTTP_[0-9]{3}$/.test(error?.message)?error.message:'INSPECTION_UNAVAILABLE';
  return {status:code};
 }
}
