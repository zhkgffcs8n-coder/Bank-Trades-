import test from 'node:test';
import assert from 'node:assert/strict';
import {probeProductionEvidence,summarizeHealth,summarizePaper,evidenceSummary} from '../scripts/probe-production-evidence.mjs';

test('only GETs the two public read-only endpoints and preserves verified counts',async()=>{
 const requested=[];
 const fetchImpl=async(url,options)=>{
  requested.push({url,options});
  if(url.endsWith('omega-live-health'))return new Response(JSON.stringify({
   status:'COLLECTOR_FRESH',collectorStatus:'COMPLETED',collectorAgeSeconds:35,
   sampledAssetCount:8,trainingSucceeded:true,collectorLastRunCounts:{trained:2,newPendingPredictions:3},
   omegaStatus:'SHADOW_RESEARCH',omegaAgeSeconds:20,omegaLiveResearchRunning:true,
   omegaExternalProvidersRunning:false,omegaProvidersConfigured:2,
   omegaPaperMonitoring:{open:1,exits:1,holds:2,settled:0,unpriced:0,backfilled:0},
   paperLastAction:'PAPER_EXIT',realOrdersAuthorized:false
  }),{status:200});
  return new Response(JSON.stringify({
   status:'COMPLETE_INSPECTED_ARCHIVE',historyTruncated:false,invalidPositions:0,
   inspectedPositions:2,openPositions:1,simulatedBidExits:1,officiallySettledPositions:0,
   realizedPositions:1,realizedNetDollars:-0.17,maxRealizedDrawdownDollars:0.17,
   ordersAuthorized:false
  }),{status:200});
 };
 const result=await probeProductionEvidence({fetchImpl,origin:'https://example.test',now:new Date('2026-11-09T20:00:00Z')});
 assert.equal(requested.length,2);
 assert.ok(requested.every(x=>x.options.method==='GET'&&x.options.redirect==='error'));
 assert.deepEqual(requested.map(x=>new URL(x.url).pathname).sort(),
  ['/.netlify/functions/omega-live-health','/.netlify/functions/omega-paper-summary']);
 assert.equal(result.health.collectorLastRunCounts.trained,2);
 assert.equal(result.health.omegaExternalProvidersRunning,false);
 assert.equal(result.paper.realizedNetDollars,-0.17);
 assert.equal(result.paper.officiallySettledPositions,0);
 assert.match(evidenceSummary(result),/unverified|false/);
});

test('incomplete paper history never exposes a partial total as realized P&L',()=>{
 const p=summarizePaper({status:'INCOMPLETE_PAPER_HISTORY',historyTruncated:true,
  invalidPositions:0,realizedNetDollars:9000,ordersAuthorized:false});
 assert.equal(p.status,'NOT_VERIFIED');
 assert.equal(p.realizedNetDollars,null);
});

test('malformed and missing health evidence cannot be marked fresh',()=>{
 assert.equal(summarizeHealth(null).status,'INVALID_RESPONSE');
 const h=summarizeHealth({status:'COLLECTOR_FRESH',collectorAgeSeconds:-5,
  omegaExternalProvidersRunning:'true',realOrdersAuthorized:false});
 assert.equal(h.collectorAgeSeconds,null);
 assert.equal(h.omegaExternalProvidersRunning,null);
 assert.equal(h.collectorLastRunCounts.trained,null);
 assert.equal(summarizeHealth({}).realOrdersAuthorized,null);
});

test('transport failure is recorded as unavailable without leaking exception text',async()=>{
 const result=await probeProductionEvidence({fetchImpl:async()=>{throw Error('SECRET_TOKEN=never-print');}});
 assert.equal(result.health.status,'UNAVAILABLE');
 assert.equal(result.paper.status,'UNAVAILABLE');
 assert.doesNotMatch(JSON.stringify(result),/SECRET_TOKEN/);
});

test('HTTP errors and invalid JSON cannot be mistaken for running providers or profitable paper',async()=>{
 const result=await probeProductionEvidence({fetchImpl:async url=>
  url.endsWith('omega-live-health')?new Response('unavailable',{status:503}):
  new Response('not json',{status:200})});
 assert.equal(result.health.status,'UNAVAILABLE');
 assert.equal(result.health.httpStatus,503);
 assert.equal(result.paper.status,'UNAVAILABLE');
 assert.equal(result.verifiedProfitableTrading,false);
});

test('sanitized production probe exposes only known OMEGA quote gates',()=>{
 const health=summarizeHealth({omegaObservationGate:'INDEPENDENT_QUOTE_UNAVAILABLE'});
 assert.equal(health.omegaObservationGate,'INDEPENDENT_QUOTE_UNAVAILABLE');
 assert.equal(summarizeHealth({omegaObservationGate:'raw network secret'}).omegaObservationGate,'NOT_VERIFIED');
 const report={checkedAt:'2026-11-09T21:00:00Z',health,paper:{status:'NOT_VERIFIED'}};
 assert.match(evidenceSummary(report),/OMEGA quote gate.*INDEPENDENT_QUOTE_UNAVAILABLE/);
});


test('known insufficient or stale OMEGA research remains diagnostic, not verified success',()=>{
 for(const status of ['INSUFFICIENT_DATA','STALE_PROVIDER_RESEARCH']){
  const health=summarizeHealth({omegaStatus:status,omegaObservationGate:'INDEPENDENT_QUOTE_VERIFIED',
   omegaLiveResearchRunning:false,omegaExternalProvidersRunning:false,realOrdersAuthorized:false});
  assert.equal(health.omegaStatus,status);
  assert.equal(health.omegaLiveResearchRunning,false);
  assert.equal(health.omegaExternalProvidersRunning,false);
  assert.match(evidenceSummary({checkedAt:'2026-11-09T22:00:00Z',health,paper:{status:'NOT_VERIFIED'}}),new RegExp(status));
 }
 assert.equal(summarizeHealth({omegaStatus:'API_KEY=secret'}).omegaStatus,'NOT_VERIFIED');
});

test('degraded collector and insufficient OMEGA research preserve safe actionable diagnostics',()=>{
 const health=summarizeHealth({
  status:'NOT_VERIFIED',collectorStatus:'DEGRADED',sampledAssetCount:8,
  omegaStatus:'INSUFFICIENT_DATA',omegaObservationGate:'INDEPENDENT_QUOTE_VERIFIED',
  omegaReasons:['At least two distinct fresh research forecasts required','SECRET_TOKEN=do-not-print'],
  omegaProviderStatus:[
   {provider:'gpt',status:'PROVIDER_ERROR',httpStatus:429,errorCode:'insufficient_quota',checkedAt:'2026-11-10T00:08:00Z',key:'SECRET_TOKEN=do-not-print'},
   {provider:'claude',status:'RESEARCH_FORECAST',checkedAt:'2026-11-10T00:08:00Z'},
   {provider:'evil=SECRET_TOKEN',status:'RESEARCH_FORECAST'},
   {provider:'gemini',status:'SECRET_TOKEN=do-not-print',errorCode:'SECRET_TOKEN=do-not-print',httpStatus:999}
  ],realOrdersAuthorized:false
 });
 assert.equal(health.collectorStatus,'DEGRADED');
 assert.deepEqual(health.omegaReasons,['At least two distinct fresh research forecasts required']);
 assert.equal(health.omegaProviderStatus.length,3);
 assert.equal(health.omegaProviderStatus[0].status,'PROVIDER_ERROR');
 assert.equal(health.omegaProviderStatus[0].httpStatus,429);
 assert.equal(health.omegaProviderStatus[0].errorCode,'insufficient_quota');
 assert.equal(health.omegaProviderStatus[2].status,'NOT_VERIFIED');
 assert.equal(health.omegaProviderStatus[2].httpStatus,null);
 assert.equal(health.omegaProviderStatus[2].errorCode,null);
 const report={checkedAt:'2026-11-10T00:09:00Z',health,paper:{status:'NOT_VERIFIED'}};
 assert.match(evidenceSummary(report),/gpt:PROVIDER_ERROR HTTP 429/);
 assert.match(evidenceSummary(report),/At least two distinct fresh research forecasts required/);
 assert.doesNotMatch(JSON.stringify(report),/SECRET_TOKEN/);
 assert.equal(health.realOrdersAuthorized,false);
});

test('provider diagnostics reject malformed lists and duplicate or forged provider identities',()=>{
 assert.deepEqual(summarizeHealth({omegaProviderStatus:'SECRET_TOKEN'}).omegaProviderStatus,[]);
 const result=summarizeHealth({omegaProviderStatus:[
  null,{},'unsafe',[],{provider:'gpt',status:'RESEARCH_FORECAST'},
  {provider:'gpt',status:'PROVIDER_ERROR',httpStatus:401},
  {provider:'claude',status:'INVALID_KEY_FORMAT',checkedAt:'not-a-date'},
  {provider:'gemini',status:'PROVIDER_UNAVAILABLE',httpStatus:-1}
 ]});
 assert.deepEqual(result.omegaProviderStatus.map(x=>x.provider),['gpt','claude','gemini']);
 assert.equal(result.omegaProviderStatus[0].status,'RESEARCH_FORECAST');
 assert.equal(result.omegaProviderStatus[1].checkedAt,null);
 assert.equal(result.omegaProviderStatus[2].httpStatus,null);
});


test('collector coverage evidence names only validated missing assets and rejects forged values',()=>{
 const partial=summarizeHealth({status:'NOT_VERIFIED',collectorStatus:'DEGRADED',
  sampledAssetCount:2,sampledAssets:['BTC','ETH'],realOrdersAuthorized:false});
 assert.deepEqual(partial.collectorSampledAssets,['BTC','ETH']);
 assert.deepEqual(partial.collectorMissingAssets,['SOL','XRP','DOGE','BNB','HYPE','ZEC']);
 assert.match(evidenceSummary({checkedAt:'2026-11-10T08:00:00Z',health:partial,paper:{status:'NOT_VERIFIED'}}),/Collector coverage.*2\\/8; missing: SOL, XRP/);
 for(const sampledAssets of [['BTC','BTC'],['BTC','SECRET_TOKEN=hidden'],['BTC','ETH','SOL'], 'BTC',null]){
  const invalid=summarizeHealth({sampledAssetCount:2,sampledAssets});
  assert.equal(invalid.collectorSampledAssets,null);
  assert.equal(invalid.collectorMissingAssets,null);
  assert.doesNotMatch(JSON.stringify(invalid),/SECRET_TOKEN/);
 }
 const full=summarizeHealth({sampledAssetCount:8,sampledAssets:['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC']});
 assert.deepEqual(full.collectorMissingAssets,[]);
});
