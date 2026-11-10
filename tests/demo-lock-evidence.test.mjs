import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectDemoLock} from '../netlify/functions/lib/demo-lock-evidence.mjs';

test('Demo lock inspection exposes counts without releasing the lock or exposing identifiers',async()=>{
 const record={lock:{token:'private-token',at:123},state:{intents:[{id:'id-1'},{id:'id-2'}]}};
 const evidence=await inspectDemoLock({read:async()=>record},{
  snapshot:async()=>({complete:true,orders:[{client_order_id:'id-1'},{client_order_id:'unrelated'}]})
 });
 assert.deepEqual(evidence,{status:'LOCK_REQUIRES_REVIEW',lockAt:123,authenticatedSnapshot:true,intents:2,matchedOrders:1,unresolvedIntents:1});
});
test('Demo lock turnover invalidates reconciliation evidence',async()=>{
 let reads=0;
 const evidence=await inspectDemoLock({read:async()=>({lock:{token:String(++reads)},state:{intents:[]}})},
  {snapshot:async()=>({complete:true,orders:[]})});
 assert.deepEqual(evidence,{status:'EXECUTION_CHANGED_DURING_INSPECTION'});
});
