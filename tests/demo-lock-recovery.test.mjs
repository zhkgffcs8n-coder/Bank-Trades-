import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverTerminalDemoState} from '../netlify/functions/lib/demo-lock-recovery.mjs';

test('Demo lock recovery requires an old lock and a terminal reconciled order',async()=>{
 const now=Date.now(),clock=()=>now;
 const record={lock:{at:now-3600000},state:{intents:[{id:'old',ticker:'DEMO',side:'up',action:'buy',qty:1,status:'UNKNOWN'}]}};
 const order={client_order_id:'old',order_id:'exchange',ticker:'DEMO',fill_count_fp:'0.00',status:'canceled'};
 const client={snapshot:async()=>({at:now,complete:true,balanceCents:100,orders:[order],fills:[],positions:[],settlements:[]})};
 const recovered=await recoverTerminalDemoState(record,client,clock);
 assert.equal(recovered.intents[0].status,'RECONCILED');
 assert.equal(record.state.intents[0].status,'UNKNOWN');
 assert.equal(await recoverTerminalDemoState({...record,lock:{at:now}},client,clock),null);
 order.status='resting';
 assert.equal(await recoverTerminalDemoState(record,client,clock),null);
});
