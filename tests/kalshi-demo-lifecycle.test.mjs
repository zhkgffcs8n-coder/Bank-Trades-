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

test('Demo snapshot read phase is sanitized, creates no orders, and retains bounded retry semantics',async()=>{
 const state=initialState(),now=Date.now();let calls=0,creates=0;
 const options={
  repo:{acquire:async()=>({state,persist:async()=>{},release:async()=>{}})},
  client:{snapshot:async()=>{
   calls++;
   if(calls===1){const error=new TypeError('private host and credential detail');error.snapshotPhase='FILLS';throw error;}
   return {at:now,complete:true,balanceCents:500,orders:[],fills:[],positions:[],settlements:[]};
  },create:async()=>{creates++;throw Error('should never submit')}},
  findMarket:async()=>null,clock:()=>now
 };
 const failed=await runDemoLifecycle(options);
 assert.equal(failed.status,'DEMO_LIFECYCLE_FAILED');
 assert.equal(failed.stage,'ACCOUNT_SNAPSHOT');
 assert.equal(failed.error,'DEMO_SNAPSHOT_FILLS_READ_FAILED');
 assert.equal(creates,0);
 assert.equal((await runDemoLifecycle(options)).status,'DEMO_RETRY_ARMED');
 assert.equal(creates,0);
 assert.equal((await runDemoLifecycle(options)).status,'DEMO_NO_ELIGIBLE_DEFAULT_EXCHANGE_MARKET');
 assert.equal(creates,0);
});
test('unrecognized snapshot phases never leak raw error data',async()=>{
 const state=initialState(),now=Date.now();
 const result=await runDemoLifecycle({
  repo:{acquire:async()=>({state,persist:async()=>{},release:async()=>{}})},
  client:{snapshot:async()=>{const error=Error('secret details');error.snapshotPhase='TOKEN_VALUE';throw error;}},
  clock:()=>now
 });
 assert.equal(result.error,'DEMO_TRANSPORT_OR_STORAGE_ERROR');
 assert.equal(result.stage,'ACCOUNT_SNAPSHOT');
});

test('snapshot phase overrides generic uppercase transport error without submitting an order',async()=>{
 const state=initialState(),now=Date.now();let snapshots=0,orders=0;
 const options={
  repo:{acquire:async()=>({state,persist:async()=>{},release:async()=>{}})},
  client:{
   snapshot:async()=>{
    snapshots++;
    if(snapshots===1){
     const error=Error('DEMO_TRANSPORT_OR_STORAGE_ERROR');
     error.snapshotPhase='POSITIONS';
     throw error;
    }
    return {at:now,complete:true,balanceCents:500,orders:[],fills:[],positions:[],settlements:[]};
   },
   create:async()=>{orders++;throw Error('unexpected order')}
  },
  findMarket:async()=>null,clock:()=>now
 };
 const failure=await runDemoLifecycle(options);
 assert.equal(failure.stage,'ACCOUNT_SNAPSHOT');
 assert.equal(failure.error,'DEMO_SNAPSHOT_POSITIONS_READ_FAILED');
 assert.equal(failure.status,'DEMO_LIFECYCLE_FAILED');
 assert.equal(orders,0);
 assert.equal((await runDemoLifecycle(options)).status,'DEMO_RETRY_ARMED');
 assert.equal(orders,0);
});

test('Demo snapshot preserves sanitized HTTP root cause independently of failed read phase',async()=>{
 for(const [phase,underlying] of [['BALANCE','KALSHI_HTTP_401'],['SETTLEMENTS','KALSHI_HTTP_503'],['FILLS','INVALID_FILLS']]){
  const state=initialState();let orders=0;
  const result=await runDemoLifecycle({
   repo:{acquire:async()=>({state,persist:async()=>{},release:async()=>{}})},
   client:{snapshot:async()=>{const e=Error(underlying);e.snapshotPhase=phase;throw e;},
    create:async()=>{orders++;throw Error('UNEXPECTED_ORDER');}},
   clock:()=>1000
  });
  assert.equal(result.stage,'ACCOUNT_SNAPSHOT');
  assert.equal(result.error,'DEMO_SNAPSHOT_'+phase+'_READ_FAILED');
  assert.equal(result.snapshotCause,underlying);
  assert.equal(result.finished,true);
  assert.equal(orders,0);
 }
});
test('Demo snapshot never persists untrusted exception text as a cause',async()=>{
 const state=initialState();
 const result=await runDemoLifecycle({
  repo:{acquire:async()=>({state,persist:async()=>{},release:async()=>{}})},
  client:{snapshot:async()=>{const e=Error('SECRET_PRIVATE_KEY_VALUE');e.snapshotPhase='ORDERS';throw e;}},
  clock:()=>1000
 });
 assert.equal(result.error,'DEMO_SNAPSHOT_ORDERS_READ_FAILED');
 assert.equal(result.snapshotCause,undefined);
});
