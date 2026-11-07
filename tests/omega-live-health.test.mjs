import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaLiveHealth} from '../netlify/functions/omega-live-health.mjs';
const now=Date.parse('2026-11-05T12:00:00Z');
const heartbeat={completedAt:new Date(now-60000).toISOString(),status:'COMPLETED',sampledAssets:['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'],trainingSucceeded:true};
test('fresh completed collection is distinguished from OMEGA provider operation',()=>{
 const result=omegaLiveHealth(heartbeat,now);
 assert.equal(result.status,'COLLECTOR_FRESH');assert.equal(result.omegaLiveResearchRunning,false);
});
test('stale or incomplete collection cannot be called healthy',()=>{
 assert.equal(omegaLiveHealth({...heartbeat,completedAt:new Date(now-180000).toISOString()},now).status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth({...heartbeat,sampledAssets:['BTC']},now).status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth(null,now).status,'NOT_VERIFIED');
});

test('collector numeric timestamp',()=>{assert.equal(omegaLiveHealth({...heartbeat,completedAt:now-60000},now).status,'COLLECTOR_FRESH');});

test('paper monitoring counters are read-only, bounded and not fabricated',()=>{
 const omega={checkedAt:new Date(now-1000).toISOString(),status:'NO_FRESH_MARKET_OBSERVATION',
  paperMonitoring:{open:2,settled:1,unpriced:3,exits:-1,holds:'7'}};
 const result=omegaLiveHealth(heartbeat,now,omega,{action:'PAPER_SETTLED',updatedAtMs:now-1000});
 assert.equal(result.omegaPaperMonitoring.open,2);
 assert.equal(result.omegaPaperMonitoring.settled,1);
 assert.equal(result.omegaPaperMonitoring.exits,null);
 assert.equal(result.omegaPaperMonitoring.holds,null);
 assert.equal(result.paperLastAction,'PAPER_SETTLED');
 assert.equal(result.omegaExternalProvidersRunning,false);
 assert.equal(result.realOrdersAuthorized,false);
});

test('last-run learning and paper PnL diagnostics never masquerade as lifetime totals',()=>{
 const enriched={...heartbeat,newPendingPredictions:5,trainedThisRun:2,trainingReviewCount:1,
  settlementFailures:0,researchFailures:3};
 const result=omegaLiveHealth(enriched,now,null,{action:'PAPER_EXIT',updatedAtMs:now-1000,netDollars:-.37});
 assert.deepEqual(result.collectorLastRunCounts,{newPendingPredictions:5,trained:2,trainingReviews:1,
  settlementFailures:0,researchFailures:3});
 assert.equal(result.paperLastActionNetDollars,-.37);
 assert.equal(result.paperLastActionAtMs,now-1000);
 const absent=omegaLiveHealth(heartbeat,now,null,{action:'PAPER_ENTRY',updatedAtMs:now+60000,netDollars:'3'});
 assert.equal(absent.collectorLastRunCounts.trained,null);
 assert.equal(absent.paperLastActionNetDollars,null);
 assert.equal(absent.paperLastActionAtMs,null);
 assert.equal(absent.realOrdersAuthorized,false);
});
