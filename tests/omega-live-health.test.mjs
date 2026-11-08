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
test('collector health requires eight distinct expected markets, not repeated or unknown assets',()=>{
 const repeated={...heartbeat,sampledAssets:Array(8).fill('BTC')};
 const repeatedHealth=omegaLiveHealth(repeated,now);
 assert.equal(repeatedHealth.status,'NOT_VERIFIED');
 assert.equal(repeatedHealth.sampledAssetCount,1);
 const substituted={...heartbeat,sampledAssets:[...heartbeat.sampledAssets.slice(0,7),'FAKE']};
 assert.equal(omegaLiveHealth(substituted,now).status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth(heartbeat,now).status,'COLLECTOR_FRESH');
});


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

test('forecast research health exposes only fresh bounded verified hypothetical counts',()=>{
 const report={version:2,mode:'SHADOW_ONLY',at:now-30000,n:7,wins:4,losses:3,scope:'FIRST_PAGE_ONLY',truncated:true,simulatedNetPnl:-1.4,excludedUnverified:2,conflictingTickers:1};
 const result=omegaLiveHealth(heartbeat,now,null,null,report);
 assert.equal(result.forecastShadow.status,'BOUNDED_VERIFIED_RESEARCH');
 assert.equal(result.forecastShadow.verifiedResolved,7);
 assert.equal(result.forecastShadow.scope,'FIRST_PAGE_ONLY');
 assert.equal(result.forecastShadow.hypotheticalNetDollars,-1.4);
 assert.equal(result.realOrdersAuthorized,false);
 assert.equal(omegaLiveHealth(heartbeat,now,null,null,{...report,at:now-300000}).forecastShadow.status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth(heartbeat,now,null,null,{...report,wins:8}).forecastShadow.status,'INVALID_REPORT');
});

test('OMEGA external provider activity requires two distinct fresh successful checks',()=>{
 const checkedAt=new Date(now-1000).toISOString();
 const successful=[
  {provider:'gpt',status:'RESEARCH_FORECAST',checkedAt},
  {provider:'deepseek',status:'RESEARCH_FORECAST',checkedAt}
 ];
 const omega={checkedAt,status:'SHADOW_RESEARCH',providersConfigured:2,providerStatus:successful};
 const healthy=omegaLiveHealth(heartbeat,now,omega);
 assert.equal(healthy.omegaLiveResearchRunning,true);
 assert.equal(healthy.omegaExternalProvidersRunning,true);
 assert.equal(healthy.realOrdersAuthorized,false);
 assert.equal(omegaLiveHealth(heartbeat,now,{...omega,providersConfigured:0}).omegaExternalProvidersRunning,false);
 assert.equal(omegaLiveHealth(heartbeat,now,{...omega,providerStatus:[]}).omegaExternalProvidersRunning,false);
 assert.equal(omegaLiveHealth(heartbeat,now,{...omega,providerStatus:[successful[0],successful[0]]}).omegaExternalProvidersRunning,false);
 assert.equal(omegaLiveHealth(heartbeat,now,{...omega,providerStatus:[successful[0],{...successful[1],status:'PROVIDER_ERROR'}]}).omegaExternalProvidersRunning,false);
 const stale={...successful[1],checkedAt:new Date(now-180000).toISOString()};
 assert.equal(omegaLiveHealth(heartbeat,now,{...omega,providerStatus:[successful[0],stale]}).omegaExternalProvidersRunning,false);
 assert.equal(omegaLiveHealth(heartbeat,now,{...omega,checkedAt:new Date(now-180000).toISOString()}).omegaExternalProvidersRunning,false);
});

test('malformed persisted provider diagnostics do not crash public OMEGA health',()=>{
 const checkedAt=new Date(now-1000).toISOString();
 const omega={checkedAt,status:'SHADOW_RESEARCH',providersConfigured:2,providerStatus:[
  null,false,'corrupt',[],{provider:'claude',status:'RESEARCH_FORECAST',checkedAt},
  {provider:'gpt',status:'PROVIDER_ERROR',checkedAt,httpStatus:429}
 ]};
 const result=omegaLiveHealth(heartbeat,now,omega);
 assert.equal(result.status,'COLLECTOR_FRESH');
 assert.equal(result.omegaLiveResearchRunning,true);
 assert.equal(result.omegaExternalProvidersRunning,false);
 assert.equal(result.omegaProviderStatus.length,2);
 assert.deepEqual(result.omegaProviderStatus.map(x=>x.provider),['claude','gpt']);
 assert.equal(result.realOrdersAuthorized,false);
});
