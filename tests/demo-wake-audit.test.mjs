import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverInterruptedDemoWakeAudit,recordDemoWakeAcknowledgment} from '../src/demo-wake-audit.mjs';

test('restart records uncertain Demo wake delivery without replay or inventing an acknowledgment',()=>{
 const state={demoWakeAudit:[
  {ticker:'BTC-A',action:'BUY UP',status:'QUEUED',signalAt:100},
  {ticker:'BTC-B',action:'BUY DOWN',status:'SENDING',sentAt:200},
  {ticker:'BTC-C',action:'SELL FAST UP',status:'RUNNER_ACKNOWLEDGED',completedAt:300},
  {ticker:'BTC-D',action:'BUY UP',status:'DEMO_WAKE_HTTP_403',completedAt:400}
 ]};
 assert.equal(recoverInterruptedDemoWakeAudit(state,500),true);
 assert.deepEqual(state.demoWakeAudit.map(x=>x.status),[
  'DELIVERY_UNCONFIRMED_ON_RESTART','DELIVERY_UNCONFIRMED_ON_RESTART',
  'RUNNER_ACKNOWLEDGED','DEMO_WAKE_HTTP_403'
 ]);
 assert.deepEqual(state.demoWakeAudit.map(x=>x.recoveredAt),[500,500,undefined,undefined]);
 assert.equal(recoverInterruptedDemoWakeAudit(state,600),false);
 assert.equal(state.demoWakeAudit.length,4);
});

test('restart recovery leaves absent and terminal audit history unchanged',()=>{
 assert.equal(recoverInterruptedDemoWakeAudit({},123),false);
 const state={demoWakeAudit:[null,{status:'EXPIRED_BEFORE_SEND'},{status:'TRANSPORT'}]};
 assert.equal(recoverInterruptedDemoWakeAudit(state,123),false);
 assert.equal(state.demoWakeAudit[1].recoveredAt,undefined);
});

test('worker persists the sanitized lifecycle gate from an acknowledged Demo wake',()=>{
 const event={ticker:'KXBTC15M-TEST',action:'BUY DOWN',signalAt:100,bookAt:90,status:'SENDING'};
 const response=new Response(null,{status:204,headers:{'x-demo-lifecycle-status':'DEMO_WAITING_FOR_CHAMPION_ENTRY'}});
 recordDemoWakeAcknowledgment(event,response);
 assert.equal(event.status,'RUNNER_ACKNOWLEDGED');
 assert.equal(event.httpStatus,204);
 assert.equal(event.lifecycleStatus,'DEMO_WAITING_FOR_CHAMPION_ENTRY');
 assert.equal(event.action,'BUY DOWN');
 assert.equal(event.signalAt,100);
 assert.equal(event.filled,undefined);
});

test('missing or malformed Demo outcome is recorded as unverified, never a fill',()=>{
 for(const status of [null,'BAD_STATUS','DEMO_BAD-STATUS','DEMO_FAKE+BAD']){
  const event={ticker:'KXBTC15M-TEST',action:'SELL FAST DOWN',status:'SENDING'};
  const headers=status===null?{}:{'x-demo-lifecycle-status':status};
  recordDemoWakeAcknowledgment(event,new Response(null,{status:204,headers}));
  assert.equal(event.status,'RUNNER_ACKNOWLEDGED');
  assert.equal(event.lifecycleStatus,'DEMO_OUTCOME_UNVERIFIED');
  assert.equal(event.filled,undefined);
 }
});

test('Railway audit captures only allowlisted contract rejection reasons, not fills',()=>{
 for(const [reason,expected] of [
  ['DEMO_MARKET_SPREAD_UNSAFE','DEMO_MARKET_SPREAD_UNSAFE'],
  ['DEMO_MARKET_NOT_FOUND','DEMO_MARKET_NOT_FOUND'],
  ['FAKE_EXCHANGE_FILL','DEMO_MARKET_NOT_VERIFIED']
 ]){
  const event={ticker:'KXBTC15M-TEST',action:'BUY DOWN',status:'SENDING'};
  const response=new Response(null,{status:204,headers:{
   'x-demo-lifecycle-status':'DEMO_CHAMPION_CONTRACT_INELIGIBLE',
   'x-demo-market-rejection-reason':reason
  }});
  recordDemoWakeAcknowledgment(event,response);
  assert.equal(event.marketRejectionReason,expected);
  assert.equal(event.filled,undefined);
 }
 const exit={ticker:'KXBTC15M-TEST',action:'SELL FAST DOWN',status:'SENDING'};
 recordDemoWakeAcknowledgment(exit,new Response(null,{status:204,headers:{
  'x-demo-lifecycle-status':'DEMO_WAITING_FOR_CHAMPION_ENTRY',
  'x-demo-market-rejection-reason':'DEMO_MARKET_SPREAD_UNSAFE'
 }}));
 assert.equal(exit.marketRejectionReason,undefined);
});


test('failed Demo lifecycle records only an allowlisted stage, never a fill',()=>{
 const event={ticker:'KXBTC15M-TEST',action:'BUY DOWN',status:'SENDING'};
 recordDemoWakeAcknowledgment(event,new Response(null,{status:204,headers:{
  'x-demo-lifecycle-status':'DEMO_LIFECYCLE_FAILED',
  'x-demo-failure-stage':'ACCOUNT_SNAPSHOT'
 }}));
 assert.equal(event.lifecycleStatus,'DEMO_LIFECYCLE_FAILED');
 assert.equal(event.failureStage,'ACCOUNT_SNAPSHOT');
 assert.equal(event.filled,undefined);
 const bad={ticker:'KXBTC15M-TEST',action:'BUY DOWN'};
 recordDemoWakeAcknowledgment(bad,new Response(null,{status:204,headers:{
  'x-demo-lifecycle-status':'DEMO_LIFECYCLE_FAILED',
  'x-demo-failure-stage':'SECRET_TOKEN_VALUE'
 }}));
 assert.equal(bad.failureStage,'UNVERIFIED_STAGE');
 const waiting={ticker:'KXBTC15M-TEST',action:'SELL FAST DOWN'};
 recordDemoWakeAcknowledgment(waiting,new Response(null,{status:204,headers:{
  'x-demo-lifecycle-status':'DEMO_WAITING_FOR_CHAMPION_ENTRY',
  'x-demo-failure-stage':'ACCOUNT_SNAPSHOT'
 }}));
 assert.equal(waiting.failureStage,undefined);
});


test('durable Demo wake records only allowlisted account snapshot failure codes',()=>{
 const event={ticker:'KXBTC15M-TEST',action:'BUY UP',status:'SENDING'};
 recordDemoWakeAcknowledgment(event,new Response(null,{status:204,headers:{
  'x-demo-lifecycle-status':'DEMO_LIFECYCLE_FAILED',
  'x-demo-failure-stage':'ACCOUNT_SNAPSHOT',
  'x-demo-failure-code':'KALSHI_HTTP_403'
 }}));
 assert.equal(event.failureStage,'ACCOUNT_SNAPSHOT');
 assert.equal(event.failureCode,'KALSHI_HTTP_403');
 assert.equal(event.filled,undefined);
 const unsafe={status:'SENDING'};
 recordDemoWakeAcknowledgment(unsafe,new Response(null,{status:204,headers:{
  'x-demo-lifecycle-status':'DEMO_LIFECYCLE_FAILED',
  'x-demo-failure-code':'PRIVATE_KEY_VALUE'
 }}));
 assert.equal(unsafe.failureCode,'UNVERIFIED_FAILURE_CODE');
 const waiting={status:'SENDING'};
 recordDemoWakeAcknowledgment(waiting,new Response(null,{status:204,headers:{
  'x-demo-lifecycle-status':'DEMO_WAITING_FOR_CHAMPION_ENTRY',
  'x-demo-failure-code':'KALSHI_HTTP_403'
 }}));
 assert.equal(waiting.failureCode,undefined);
});


test('durable Railway audit retains only sanitized underlying snapshot cause',()=>{
 for(const [cause,expected] of [
  ['KALSHI_HTTP_429','KALSHI_HTTP_429'],
  ['KALSHI_HTTP_401','KALSHI_HTTP_401'],
  ['INVALID_FILLS','INVALID_FILLS'],
  ['PRIVATE_KEY_VALUE','UNVERIFIED_FAILURE_CODE']
 ]){
  const event={ticker:'KXBTC15M-TEST',action:'BUY UP',status:'SENDING'};
  recordDemoWakeAcknowledgment(event,new Response(null,{status:204,headers:{
   'x-demo-lifecycle-status':'DEMO_LIFECYCLE_FAILED',
   'x-demo-failure-stage':'ACCOUNT_SNAPSHOT',
   'x-demo-failure-code':'DEMO_SNAPSHOT_BALANCE_READ_FAILED',
   'x-demo-snapshot-cause':cause
  }}));
  assert.equal(event.snapshotCause,expected);
  assert.equal(event.failureCode,'DEMO_SNAPSHOT_BALANCE_READ_FAILED');
  assert.equal(event.filled,undefined);
 }
 for(const [status,stage] of [
  ['DEMO_WAITING_FOR_CHAMPION_ENTRY','ACCOUNT_SNAPSHOT'],
  ['DEMO_LIFECYCLE_FAILED','SUBMIT_ENTRY']
 ]){
  const event={status:'SENDING'};
  recordDemoWakeAcknowledgment(event,new Response(null,{status:204,headers:{
   'x-demo-lifecycle-status':status,'x-demo-failure-stage':stage,
   'x-demo-snapshot-cause':'KALSHI_HTTP_401'
  }}));
  assert.equal(event.snapshotCause,undefined);
 }
});
