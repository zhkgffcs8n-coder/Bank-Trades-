import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverInterruptedDemoWakeAudit} from '../src/demo-wake-audit.mjs';

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
