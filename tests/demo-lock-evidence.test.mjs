import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectDemoLock,classifySettlementRevenueMismatch} from '../netlify/functions/lib/demo-lock-evidence.mjs';
import {sanitizeDemoLockEvidence} from '../src/kaibot-demo-lifecycle-telemetry.mjs';

test('Demo lock inspection exposes counts without releasing the lock or exposing identifiers',async()=>{
 const record={lock:{token:'private-token',at:123},state:{intents:[{id:'id-1'},{id:'id-2'}]}};
 const evidence=await inspectDemoLock({read:async()=>record},{
  snapshot:async()=>({complete:true,orders:[{client_order_id:'id-1'},{client_order_id:'unrelated'}]})
 });
 assert.deepEqual(evidence,{status:'LOCK_REQUIRES_REVIEW',lockAt:123,authenticatedSnapshot:true,reconciliation:{status:'INCOMPLETE_ACCOUNT_SNAPSHOT'},intents:2,matchedOrders:1,unresolvedIntents:1});
});
test('Demo lock turnover invalidates reconciliation evidence',async()=>{
 let reads=0;
 const evidence=await inspectDemoLock({read:async()=>({lock:{token:String(++reads)},state:{intents:[]}})},
  {snapshot:async()=>({complete:true,orders:[]})});
 assert.deepEqual(evidence,{status:'EXECUTION_CHANGED_DURING_INSPECTION'});
});

test('a terminal zero-fill Demo order reconciles without writing state',async()=>{
 const record={lock:{token:'private-token',at:123},state:{
  intents:[{id:'id-1',ticker:'DEMO',status:'UNKNOWN',qty:1,side:'up',action:'buy'}]
 }};
 const evidence=await inspectDemoLock({read:async()=>record},{
  snapshot:async()=>({at:Date.now(),balanceCents:1000,complete:true,fills:[],positions:[],settlements:[],
   orders:[{order_id:'exchange-id',client_order_id:'id-1',ticker:'DEMO',status:'canceled',fill_count_fp:'0.00'}]})
 });
 assert.deepEqual(evidence.reconciliation,{status:'RECONCILED_READ_ONLY',openPositions:0,filledQuantity:0});
 assert.equal(record.state.intents[0].status,'UNKNOWN');
});

test('read-only settlement mismatch diagnostic classifies patterns without amounts',()=>{
 const intents=[{ticker:'PRIVATE-MARKET'}];
 const settlement=(yes,no,result,revenue)=>({ticker:'PRIVATE-MARKET',yes_count_fp:String(yes),no_count_fp:String(no),market_result:result,revenue});
 const pattern=s=>classifySettlementRevenueMismatch({settlements:[s]},intents);
 assert.equal(pattern(settlement(2,0,'yes',2)),'DOLLARS_INSTEAD_OF_CENTS');
 assert.equal(pattern(settlement(2,1,'yes',100)),'OPPOSITE_SIDE_PAYOUT');
 assert.equal(pattern(settlement(2,1,'yes',300)),'BOTH_SIDES_PAYOUT');
 assert.equal(pattern(settlement(2,0,'yes',0)),'ZERO_PAYOUT');
 assert.equal(pattern(settlement(2,0,'yes',199)),'LOWER_THAN_EXPECTED');
 assert.equal(pattern(settlement(2,0,'yes',201)),'HIGHER_THAN_EXPECTED');
 assert.equal(pattern(settlement(2,0,'yes',200)),'UNCLASSIFIED');
 assert.equal(pattern(settlement(2,0,'yes',200)), 'UNCLASSIFIED');
});
test('revenue mismatch health evidence emits allowlisted pattern only',()=>{
 const safe=sanitizeDemoLockEvidence({status:'LOCK_REQUIRES_REVIEW',reconciliation:{
  status:'SETTLEMENT_REVENUE_MISMATCH',revenuePattern:'OPPOSITE_SIDE_PAYOUT',account:'private',amount:9999
 }});
 assert.equal(safe.reconciliation.revenuePattern,'OPPOSITE_SIDE_PAYOUT');
 assert.doesNotMatch(JSON.stringify(safe),/private|9999|account|amount/);
 const bad=sanitizeDemoLockEvidence({status:'LOCK_REQUIRES_REVIEW',reconciliation:{
  status:'SETTLEMENT_REVENUE_MISMATCH',revenuePattern:'secret-123'
 }});
 assert.equal(bad.reconciliation.revenuePattern,'UNCLASSIFIED');
});
