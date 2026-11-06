import test from 'node:test';import assert from 'node:assert/strict';
import {assessLiveOrder,LIVE_MODES} from '../src/live-risk-policy.mjs';
const valid={owner:true,mode:'LOCK',start:true,emergencyStop:false,credentialVerified:true,
executionVerified:true,fillReconciliationVerified:true,quoteAgeMs:100,spreadCents:2,
signalScore:99,orderUsd:1,dailyRealizedPnlUsd:0,openPositions:0,
signalSource:'SPIDER_PRIMAL_VERIFIED',orderId:'round-1',seenOrderIds:[]};
test('default refuses live orders',()=>assert.equal(assessLiveOrder().allowed,false));
test('all explicitly verified gates pass policy only',()=>assert.equal(assessLiveOrder(valid).allowed,true));
for(const [key,value] of Object.entries({owner:false,start:false,emergencyStop:true,
 credentialVerified:false,executionVerified:false,fillReconciliationVerified:false,
 quoteAgeMs:4000,spreadCents:20,signalScore:10,orderUsd:5,
 dailyRealizedPnlUsd:-5,openPositions:1,signalSource:'UNVERIFIED',orderId:''})){
 test('rejects '+key,()=>assert.equal(assessLiveOrder({...valid,[key]:value}).allowed,false));
}
test('rejects duplicate order IDs',()=>assert.equal(assessLiveOrder({...valid,seenOrderIds:['round-1']}).allowed,false));
test('modes have finite caps',()=>{for(const v of Object.values(LIVE_MODES))assert.ok(v.maxOrderUsd<=3&&v.maxDailyLossUsd<=5)});
