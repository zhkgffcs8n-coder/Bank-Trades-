import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/live-execution.mjs';
import {runDemoLifecycle} from '../netlify/functions/lib/kalshi-demo-lifecycle.mjs';
const id='123e4567-e89b-42d3-a456-426614174000';
const now=Date.now();
const snapshot=()=>({at:now,complete:true,balanceCents:500,orders:[],fills:[],positions:[],settlements:[]});
const repo=state=>({acquire:async()=>({state,persist:async()=>{},release:async()=>{}})});
test('finished Demo only re-arms on new owner request and a flat exchange snapshot',async()=>{
 const state=initialState();state.demo={status:'DEMO_EXECUTION_TEST_VERIFIED',finished:true,attempts:2};
 let reads=0,orders=0;
 const options={repo:repo(state),client:{snapshot:async()=>{reads++;return snapshot()},create:async()=>{orders++;}},
  executionTest:true,testRunId:id,testSide:'DOWN',entryOnly:true,clock:()=>now};
 assert.equal((await runDemoLifecycle({...options,testRunId:undefined})).status,'DEMO_EXECUTION_TEST_VERIFIED');
 assert.equal(reads,0);
 assert.equal((await runDemoLifecycle(options)).status,'DEMO_NEW_TEST_ARMED');
 assert.equal(reads,1);assert.equal(orders,0);
 assert.equal(state.demo.mode,'DEMO_EXECUTION_TEST');
 assert.equal(state.demo.phase,'DOWN');assert.equal(state.demo.testRunId,id);
 assert.equal(state.demoHistory.length,1);
});
test('unreconciled intent prevents Demo rearm without any exchange write',async()=>{
 const state=initialState();state.demo={finished:true,status:'DEMO_EXECUTION_TEST_VERIFIED'};
 state.intents=[{status:'UNKNOWN',ticker:'TEST'}];
 let reads=0;
 const result=await runDemoLifecycle({repo:repo(state),client:{snapshot:async()=>{reads++;return snapshot()},
  create:async()=>assert.fail('no writes')},executionTest:true,testRunId:id,clock:()=>now});
 assert.equal(result.status,'DEMO_REARM_BLOCKED_UNRESOLVED_INTENTS');assert.equal(reads,0);
});
test('resting exchange order blocks Demo rearm',async()=>{
 const state=initialState();state.demo={finished:true,status:'DEMO_EXECUTION_TEST_VERIFIED'};
 const result=await runDemoLifecycle({repo:repo(state),client:{snapshot:async()=>({...snapshot(),
  orders:[{order_id:'outside',status:'resting'}]}),create:async()=>assert.fail('no writes')},
  executionTest:true,testRunId:id,clock:()=>now});
 assert.equal(result.status,'DEMO_REARM_BLOCKED_ACCOUNT_EXPOSURE');
});
test('STOP prevents Demo rearm before reading or writing exchange state',async()=>{
 const state=initialState();state.demo={finished:true,status:'DEMO_EXECUTION_TEST_VERIFIED'};
 const result=await runDemoLifecycle({repo:repo(state),client:{snapshot:async()=>assert.fail('no read'),
  create:async()=>assert.fail('no write')},executionTest:true,testRunId:id,
  checkStopped:async()=>true,clock:()=>now});
 assert.equal(result.status,'DEMO_EXECUTION_TEST_STOPPED');
});
