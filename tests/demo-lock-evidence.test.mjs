import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectDemoLock} from '../netlify/functions/lib/demo-lock-evidence.mjs';

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
