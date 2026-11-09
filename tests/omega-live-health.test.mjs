import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaLiveHealth} from '../netlify/functions/omega-live-health.mjs';
const now=Date.parse('2026-11-05T12:00:00Z');
const heartbeat={completedAt:new Date(now-60000).toISOString(),status:'COMPLETED',sampledAssets:['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'],sampledAssetCount:8,failedAssets:[],trainingSucceeded:true};
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
test('future collector timestamps never masquerade as zero-second-old data',()=>{
 for(const completedAt of [now+1,new Date(now+60000).toISOString()]){
  const result=omegaLiveHealth({...heartbeat,completedAt},now);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.equal(result.collectorAgeSeconds,null);
  assert.equal(result.realOrdersAuthorized,false);
 }
});
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
 assert.equal(result.paperLastAction,'PAPER_SETTLEMENT_UNVERIFIED');
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

test('public OMEGA collector health rejects extra duplicate samples, inconsistent counts and recorded failures',()=>{
 assert.equal(omegaLiveHealth({...heartbeat,sampledAssets:[...heartbeat.sampledAssets,'BTC']},now).status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth({...heartbeat,sampledAssetCount:7},now).status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth({...heartbeat,failedAssets:['ETH']},now).status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth({...heartbeat,failedAssets:null},now).status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth({...heartbeat,sampledAssetCount:8,failedAssets:[]},now).status,'COLLECTOR_FRESH');
});


test('future or missing paper action timestamps cannot publish realized profit',()=>{
 for(const invalid of [
  {action:'PAPER_EXIT',netDollars:4},
  {action:'PAPER_SETTLED',updatedAtMs:now+1,netDollars:4},
  {action:'PAPER_EXIT',updatedAtMs:'not-a-time',netDollars:4},
  {action:'UNKNOWN',updatedAtMs:now-1,netDollars:4}
 ]){
  const result=omegaLiveHealth(heartbeat,now,null,invalid);
  assert.equal(result.paperLastAction,'NONE_VERIFIED');
  assert.equal(result.paperLastActionAtMs,null);
  assert.equal(result.paperLastActionNetDollars,null);
 }
 const entry=omegaLiveHealth(heartbeat,now,null,{action:'PAPER_ENTRY',updatedAtMs:now-1,netDollars:4});
 assert.equal(entry.paperLastAction,'PAPER_ENTRY');
 assert.equal(entry.paperLastActionNetDollars,null);
 const exit=omegaLiveHealth(heartbeat,now,null,{action:'PAPER_EXIT',updatedAtMs:now-1,netDollars:-.42});
 assert.equal(exit.paperLastAction,'PAPER_EXIT');
 assert.equal(exit.paperLastActionAtMs,now-1);
 assert.equal(exit.paperLastActionNetDollars,-.42);
 assert.equal(exit.realOrdersAuthorized,false);
});


test('settlement heartbeat alone never publishes independently unverified paper profit',()=>{
 const settled={action:'PAPER_SETTLED',updatedAtMs:now-1000,netDollars:12.34,
  ticker:'KXBTC15M-UNRECONCILED',officiallySettled:true,realOrdersAuthorized:false};
 const result=omegaLiveHealth(heartbeat,now,null,settled);
 assert.equal(result.paperLastAction,'PAPER_SETTLEMENT_UNVERIFIED');
 assert.equal(result.paperLastActionAtMs,now-1000);
 assert.equal(result.paperLastActionNetDollars,null,
  'a self-reported settlement marker is not independent official outcome evidence');
 const simulatedExit=omegaLiveHealth(heartbeat,now,null,{...settled,action:'PAPER_EXIT',netDollars:-.42});
 assert.equal(simulatedExit.paperLastActionNetDollars,-.42);
 assert.equal(result.realOrdersAuthorized,false);
});


test('self-reported settlement flags cannot turn a heartbeat into verified official paper settlement',()=>{
 for(const claimed of [undefined,false,true]){
  const action={action:'PAPER_SETTLED',updatedAtMs:now-500,
   netDollars:99,officiallySettled:claimed,ticker:'KXBTC15M-NO-INDEPENDENT-OUTCOME'};
  const health=omegaLiveHealth(heartbeat,now,null,action);
  assert.equal(health.paperLastAction,'PAPER_SETTLEMENT_UNVERIFIED');
  assert.equal(health.paperLastActionAtMs,now-500);
  assert.equal(health.paperLastActionNetDollars,null);
  assert.equal(health.realOrdersAuthorized,false);
 }
});

test('OMEGA quote-gate diagnostics require a fresh heartbeat and known enum',()=>{
 const checkedAt=new Date(now-1000).toISOString();
 const report={checkedAt,status:'NO_FRESH_MARKET_OBSERVATION',
  observationGate:'INDEPENDENT_QUOTE_UNAVAILABLE'};
 assert.equal(omegaLiveHealth(heartbeat,now,report).omegaObservationGate,'INDEPENDENT_QUOTE_UNAVAILABLE');
 assert.equal(omegaLiveHealth(heartbeat,now,{...report,checkedAt:new Date(now-200000).toISOString()}).omegaObservationGate,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth(heartbeat,now,{...report,observationGate:'SECRET=invalid'}).omegaObservationGate,'NOT_VERIFIED');
});
