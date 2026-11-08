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
