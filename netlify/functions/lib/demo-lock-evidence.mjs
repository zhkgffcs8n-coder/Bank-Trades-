import {reconcile} from '../../../src/live-execution.mjs';
import {accountRisk} from '../../../src/live-accounting.mjs';

// Read-only evidence. An unchanged lock and a complete snapshot cannot rule out
// an in-flight order request, so this probe never releases or replaces a lock.

// Classify the *shape* of a discrepancy without exposing account values,
// tickers, order IDs, quantities, or changing any accounting decision.
export function classifySettlementRevenueMismatch(snapshot,intents){
 const tickers=new Set((intents||[]).map(i=>i.ticker).filter(t=>typeof t==='string'));
 for(const s of snapshot?.settlements||[]){
  if(!tickers.has(s.ticker))continue;
  const yes=Number(s.yes_count_fp),no=Number(s.no_count_fp),revenue=Number(s.revenue);
  if(!Number.isFinite(yes)||!Number.isFinite(no)||!Number.isFinite(revenue)||
     yes<0||no<0||revenue<0||!['yes','no'].includes(s.market_result))continue;
  const winning=s.market_result==='yes'?yes:no;
  const losing=s.market_result==='yes'?no:yes;
  const expected=winning*100;
  const matches=n=>Math.abs(revenue-n)<=1e-7;
  if(matches(expected))continue;
  if(revenue===0&&expected>0)return 'ZERO_PAYOUT';
  if(matches(winning))return 'DOLLARS_INSTEAD_OF_CENTS';
  if(matches(losing*100))return 'OPPOSITE_SIDE_PAYOUT';
  if(matches((yes+no)*100))return 'BOTH_SIDES_PAYOUT';
  return revenue<expected?'LOWER_THAN_EXPECTED':'HIGHER_THAN_EXPECTED';
 }
 return 'UNCLASSIFIED';
}

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
  let reconciliation=null;
  if(snapshot.complete===true){
   const state=structuredClone(after.state);
   try{
    reconcile(state,snapshot);
    const risk=accountRisk(state,snapshot);
    reconciliation={status:'RECONCILED_READ_ONLY',openPositions:risk.open.length,
     filledQuantity:state.intents.reduce((total,intent)=>total+(intent.filled||0),0)};
   }catch(error){
    const code=error?.message?.replace(/^(UNRESOLVED_ORDER|POSITION_MISMATCH|POSITION_MISSING)_.*/, '$1');
    reconciliation={status:/^[A-Z][A-Z_]{2,50}$/.test(code)?code:'RECONCILIATION_UNAVAILABLE',
     ...(code==='SETTLEMENT_REVENUE_MISMATCH'?{revenuePattern:classifySettlementRevenueMismatch(snapshot,intents)}:{})};
   }
  }
  return {
   reconciliation,
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
