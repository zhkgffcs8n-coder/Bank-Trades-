import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/live-execution.mjs';
import {runDemoLifecycle} from '../netlify/functions/lib/kalshi-demo-lifecycle.mjs';

test('demo entry takes its fresh quote after the last preflight snapshot', async () => {
 const state=initialState(), calls=[], now=Date.now();
 const options={
  repo:{acquire:async()=>({state,persist:async()=>{},release:async()=>{}})},
  client:{
   snapshot:async()=>{calls.push('snapshot');return {at:now,complete:true,balanceCents:500,orders:[],fills:[],positions:[],settlements:[]};},
   create:async()=>{calls.push('create');throw Error('raw upstream detail');}
  },
  findMarket:async()=>({ticker:'TEST-ROUND'}),
  quoteFor:async ticker=>{calls.push('quote');return {ticker,at:now,expiresAt:now+600000,upAsk:50,upBid:49};},
  clock:()=>now
 };
 const failed=await runDemoLifecycle(options);
 assert.deepEqual(calls,['snapshot','snapshot','quote','create']);
 assert.equal(failed.stage,'SUBMIT_ENTRY');
 assert.equal(failed.error,'ORDER_OUTCOME_UNKNOWN_RECONCILE_REQUIRED');
 assert.equal(state.intents[0].status,'UNKNOWN');
 assert.equal(state.stopped,true);
 assert.equal(await runDemoLifecycle(options),failed);
 assert.equal(calls.length,4);
});

test('a legacy transport failure arms one new Demo run and keeps historical state',async()=>{
 const now=Date.now(),state=initialState();
 const old={finished:true,status:'DEMO_LIFECYCLE_FAILED',error:'DEMO_TRANSPORT_OR_STORAGE_ERROR',attempts:1};
 state.demo=old;
 state.intents=[{id:'old',status:'ABORTED',ticker:'OLD'}];
 const options={
  repo:{acquire:async()=>({state,persist:async()=>{},release:async()=>{}})},
  client:{snapshot:async()=>({at:now,complete:true,balanceCents:500,orders:[],fills:[],positions:[],settlements:[]})},
  findMarket:async excluded=>{assert.deepEqual(excluded,['OLD']);return null;},
  clock:()=>now
 };
 assert.equal((await runDemoLifecycle(options)).status,'DEMO_RETRY_ARMED');
 assert.deepEqual(state.demoHistory,[old]);
 assert.equal(state.demo.intentOffset,1);
 assert.equal((await runDemoLifecycle(options)).status,'DEMO_NO_ELIGIBLE_DEFAULT_EXCHANGE_MARKET');
});
