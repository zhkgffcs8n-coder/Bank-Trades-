import test from 'node:test';
import assert from 'node:assert/strict';
import {probeProductionEvidence,summarizeHealth,summarizePaper,summarizeDemo,summarizeVersion,evidenceSummary} from '../scripts/probe-production-evidence.mjs';

test('only GETs the four public read-only endpoints and preserves verified counts',async()=>{
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
  if(url.endsWith('build-version.json'))return new Response(JSON.stringify({version:'2bc1bfcaceef04c3b5fd27a3706ebe5b8bd19892'}),{status:200});
  if(url.endsWith('kalshi-demo-status'))return new Response(JSON.stringify({
   savedBalanceProbe:{status:'KALSHI_HTTP_401',checkedAt:'2026-11-11T12:00:00Z',commit:'3489e5b',operation:'GET_PORTFOLIO_BALANCE',durationMs:101},
   lifecycleTest:{status:'DEMO_LIFECYCLE_FAILED',stage:'ACCOUNT_SNAPSHOT',error:'DEMO_SNAPSHOT_BALANCE_READ_FAILED',snapshotCause:'KALSHI_HTTP_401'}
  }),{status:200});
  return new Response(JSON.stringify({
   status:'COMPLETE_INSPECTED_ARCHIVE',historyTruncated:false,invalidPositions:0,
   inspectedPositions:2,openPositions:1,simulatedBidExits:1,officiallySettledPositions:0,
   realizedPositions:1,realizedNetDollars:-0.17,maxRealizedDrawdownDollars:0.17,
   ordersAuthorized:false
  }),{status:200});
 };
 const result=await probeProductionEvidence({fetchImpl,origin:'https://example.test',now:new Date('2026-11-09T20:00:00Z')});
 assert.equal(requested.length,4);
 assert.ok(requested.every(x=>x.options.method==='GET'&&x.options.redirect==='error'));
 assert.deepEqual(requested.map(x=>new URL(x.url).pathname).sort(),
  ['/.netlify/functions/kalshi-demo-status','/.netlify/functions/omega-live-health','/.netlify/functions/omega-paper-summary','/build-version.json']);
 assert.equal(result.health.collectorLastRunCounts.trained,2);
 assert.equal(result.health.omegaExternalProvidersRunning,false);
 assert.equal(result.paper.realizedNetDollars,-0.17);
 assert.equal(result.paper.officiallySettledPositions,0);
 assert.equal(result.version.commit,'2bc1bfcaceef04c3b5fd27a3706ebe5b8bd19892');
 assert.equal(result.demo.savedBalanceProbe.status,'KALSHI_HTTP_401');
 assert.equal(result.demo.lifecycle.failureCode,'DEMO_SNAPSHOT_BALANCE_READ_FAILED');
 assert.equal(result.demo.verifiedNewFills,null);
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
 assert.equal(result.demo.status,'UNAVAILABLE');
 assert.doesNotMatch(JSON.stringify(result),/SECRET_TOKEN/);
});

test('HTTP errors and invalid JSON cannot be mistaken for running providers or profitable paper',async()=>{
 const result=await probeProductionEvidence({fetchImpl:async url=>
  url.endsWith('omega-live-health')?new Response('unavailable',{status:503}):
  new Response('not json',{status:200})});
 assert.equal(result.health.status,'UNAVAILABLE');
 assert.equal(result.health.httpStatus,503);
 assert.equal(result.paper.status,'UNAVAILABLE');
 assert.equal(result.demo.status,'UNAVAILABLE');
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
 assert.ok(evidenceSummary({checkedAt:'2026-11-10T08:00:00Z',health:partial,paper:{status:'NOT_VERIFIED'}}).includes('2/8; missing: SOL, XRP'));
 for(const sampledAssets of [['BTC','BTC'],['BTC','SECRET_TOKEN=hidden'],['BTC','ETH','SOL'], 'BTC',null]){
  const invalid=summarizeHealth({sampledAssetCount:2,sampledAssets});
  assert.equal(invalid.collectorSampledAssets,null);
  assert.equal(invalid.collectorMissingAssets,null);
  assert.doesNotMatch(JSON.stringify(invalid),/SECRET_TOKEN/);
 }
 const full=summarizeHealth({sampledAssetCount:8,sampledAssets:['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC']});
 assert.deepEqual(full.collectorMissingAssets,[]);
});


test('missing asset reasons are allowlisted and never expose raw exceptions or forged assets',()=>{
 const health=summarizeHealth({sampledAssetCount:6,
  sampledAssets:['ETH','SOL','XRP','DOGE','BNB','HYPE'],
  collectorFailureReasons:{BTC:'SERIES_UNAVAILABLE',ZEC:'SECRET_TOKEN=leak',FAKE:'NO_OPEN_CONTRACT'}});
 assert.deepEqual(health.collectorMissingAssets,['BTC','ZEC']);
 assert.deepEqual(health.collectorFailureReasons,{BTC:'SERIES_UNAVAILABLE',ZEC:'UNCLASSIFIED'});
 const report={checkedAt:'2026-11-10T09:00:00Z',health,paper:{status:'NOT_VERIFIED'}};
 assert.match(evidenceSummary(report),/BTC:SERIES_UNAVAILABLE/);
 assert.doesNotMatch(JSON.stringify(report),/SECRET_TOKEN|FAKE/);
 assert.equal(summarizeHealth({sampledAssetCount:2,sampledAssets:['BTC','BTC'],
  collectorFailureReasons:{ETH:'SERIES_UNAVAILABLE'}}).collectorFailureReasons,null);
});

test('Demo diagnostics only retain allowlisted fields and never expose account or credential data',()=>{
 const demo=summarizeDemo({
  savedBalanceProbe:{status:'KALSHI_HTTP_429',checkedAt:'2026-11-11T12:00:00Z',
   commit:'3489e5b5e60d02b4f9dffc7c8e9102706d695817',operation:'GET_PORTFOLIO_BALANCE',
   durationMs:750,secret:'SECRET_TOKEN=never-emit',requestId:'private'},
  lifecycleTest:{status:'DEMO_LIFECYCLE_FAILED',stage:'ACCOUNT_SNAPSHOT',
   error:'DEMO_SNAPSHOT_BALANCE_READ_FAILED',snapshotCause:'KALSHI_HTTP_429',
   orders:[{orderId:'private-order-id'}],key:'SECRET_TOKEN=never-emit'}
 });
 assert.equal(demo.savedBalanceProbe.status,'KALSHI_HTTP_429');
 assert.equal(demo.lifecycle.snapshotCause,'KALSHI_HTTP_429');
 assert.equal(demo.verifiedNewFills,null);
 assert.doesNotMatch(JSON.stringify(demo),/SECRET_TOKEN|private-order-id|requestId/);
 const invalid=summarizeDemo({
  savedBalanceProbe:{status:'SECRET_TOKEN=leak',commit:'SECRET_TOKEN=leak',durationMs:-1,
   operation:'POST_ORDER',checkedAt:'not-a-date'},
  lifecycleTest:{status:'SECRET_TOKEN=leak',stage:'SECRET_TOKEN=leak',
   error:'SECRET_TOKEN=leak',snapshotCause:'SECRET_TOKEN=leak'}
 });
 assert.equal(invalid.savedBalanceProbe.status,'NOT_VERIFIED');
 assert.equal(invalid.savedBalanceProbe.commit,null);
 assert.equal(invalid.savedBalanceProbe.durationMs,null);
 assert.equal(invalid.lifecycle.snapshotCause,'NOT_VERIFIED');
 assert.doesNotMatch(JSON.stringify(invalid),/SECRET_TOKEN/);
 assert.equal(summarizeDemo(null).status,'INVALID_RESPONSE');
});

test('Demo endpoint unavailable does not block independent OMEGA or paper evidence',async()=>{
 const result=await probeProductionEvidence({fetchImpl:async url=>
  url.endsWith('kalshi-demo-status')?new Response('unavailable',{status:503}):
  new Response('{}',{status:200})});
 assert.equal(result.demo.status,'UNAVAILABLE');
 assert.equal(result.demo.httpStatus,503);
 assert.equal(result.health.status,'NOT_VERIFIED');
 assert.equal(result.paper.status,'NOT_VERIFIED');
 assert.equal(result.verifiedProfitableTrading,false);
});

test('read-only Demo evidence flags old completed tests without claiming fresh fills',async()=>{
 const fetchImpl=async url=>new Response(JSON.stringify(url.endsWith('kalshi-demo-status')?{
  savedBalanceProbe:{status:'DEMO_AUTHENTICATED',checkedAt:'2026-11-11T13:16:00Z',operation:'GET_PORTFOLIO_BALANCE'},
  lifecycleTest:{status:'DEMO_EXECUTION_TEST_VERIFIED',checkedAt:Date.parse('2026-11-11T11:03:05Z')}
 }:{}),{status:200});
 const report=await probeProductionEvidence({fetchImpl,now:new Date('2026-11-11T13:20:00Z')});
 assert.equal(report.demo.savedBalanceProbeFresh,true);
 assert.equal(report.demo.savedBalanceProbeAgeSeconds,240);
 assert.equal(report.demo.lifecycleFresh,false);
 assert.equal(report.demo.lifecycleAgeSeconds,8215);
 assert.equal(report.demo.verifiedNewFills,null);
 assert.match(evidenceSummary(report),/Demo lifecycle freshness.*false/);
 assert.doesNotMatch(JSON.stringify(report),/orderId|privateKey/);
});
test('missing and future-dated Demo evidence is never considered fresh',async()=>{
 const fetchImpl=async url=>new Response(JSON.stringify(url.endsWith('kalshi-demo-status')?{
  savedBalanceProbe:{status:'DEMO_AUTHENTICATED',checkedAt:'2026-11-11T13:21:00Z'},
  lifecycleTest:{status:'DEMO_EXECUTION_TEST_VERIFIED'}
 }:{}),{status:200});
 const report=await probeProductionEvidence({fetchImpl,now:new Date('2026-11-11T13:20:00Z')});
 assert.equal(report.demo.savedBalanceProbeFresh,false);
 assert.equal(report.demo.savedBalanceProbeAgeSeconds,null);
 assert.equal(report.demo.lifecycleFresh,false);
 assert.equal(report.demo.lifecycleAgeSeconds,null);
 assert.equal(report.demo.verifiedNewFills,null);
});

test('public build-version evidence rejects local builds and secret-bearing values',()=>{
 assert.equal(summarizeVersion({version:'local-build'}).commit,null);
 assert.equal(summarizeVersion({version:'SECRET_TOKEN=never-print'}).commit,null);
 assert.equal(summarizeVersion(null).commit,null);
 assert.equal(summarizeVersion({version:'89b1f44'}).commit,'89b1f44');
 assert.doesNotMatch(JSON.stringify(summarizeVersion({version:'SECRET_TOKEN=never-print'})),/SECRET_TOKEN/);
});

test('read-only champion wake is timestamped, sanitized and never proof of a Demo fill',async()=>{
 const received=Date.parse('2026-11-11T15:19:40Z'),completed=received+900;
 const response={championWake:{
  status:'SHADOW_PARITY_MATCH',ticker:'KXBTC15M-26NOV111130-30',action:'BUY UP',
  observedAt:received-100,receivedAt:received,completedAt:completed,httpStatus:204,
  lifecycleStatus:'DEMO_PREVIOUS_RUN_FINISHED',secret:'SECRET_TOKEN=never-emit',
  orders:[{orderId:'private-order-id'}],snapshotCause:'SECRET_TOKEN=never-emit'
 },lifecycleTest:{status:'DEMO_EXECUTION_TEST_VERIFIED',checkedAt:Date.parse('2026-11-11T11:03:05Z')}};
 const fetchImpl=async url=>new Response(JSON.stringify(url.endsWith('kalshi-demo-status')?response:{}),{status:200});
 const report=await probeProductionEvidence({fetchImpl,now:new Date('2026-11-11T15:20:00Z')});
 assert.equal(report.demo.championWake.status,'SHADOW_PARITY_MATCH');
 assert.equal(report.demo.championWake.action,'BUY UP');
 assert.equal(report.demo.championWake.ticker,'KXBTC15M-26NOV111130-30');
 assert.equal(report.demo.championWake.lifecycleStatus,'DEMO_PREVIOUS_RUN_FINISHED');
 assert.equal(report.demo.championWakeFresh,true);
 assert.equal(report.demo.championWakeAgeSeconds,19);
 assert.equal(report.demo.lifecycleFresh,false);
 assert.equal(report.demo.verifiedNewFills,null);
 assert.match(evidenceSummary(report),/Champion wake freshness.*true/);
 assert.doesNotMatch(JSON.stringify(report),/SECRET_TOKEN|private-order-id|orders/);
});

test('forged, stale and future wake receipts fail closed and never authorize fills',async()=>{
 const forged=summarizeDemo({championWake:{
  status:'SECRET_TOKEN=bad',ticker:'BTC;SECRET_TOKEN=bad',action:'BUY LIVE',
  receivedAt:-10,completedAt:'now',httpStatus:900,lifecycleStatus:'SECRET_TOKEN=bad',
  failureStage:'SECRET_TOKEN=bad',failureCode:'SECRET_TOKEN=bad',
  marketRejectionReason:'SECRET_TOKEN=bad',snapshotCause:'SECRET_TOKEN=bad'
 }});
 assert.equal(forged.championWake.status,'NOT_VERIFIED');
 assert.equal(forged.championWake.ticker,null);
 assert.equal(forged.championWake.httpStatus,null);
 assert.equal(forged.championWake.completedAt,null);
 assert.equal(forged.verifiedNewFills,null);
 assert.doesNotMatch(JSON.stringify(forged),/SECRET_TOKEN/);
 const fetchImpl=async url=>new Response(JSON.stringify(url.endsWith('kalshi-demo-status')?{
  championWake:{status:'SHADOW_PARITY_MATCH',completedAt:Date.parse('2026-11-11T15:21:00Z'),
   lifecycleStatus:'DEMO_CHAMPION_ROUND_TRIP_VERIFIED'}
 }:{}),{status:200});
 const future=await probeProductionEvidence({fetchImpl,now:new Date('2026-11-11T15:20:00Z')});
 assert.equal(future.demo.championWakeFresh,false);
 assert.equal(future.demo.championWakeAgeSeconds,null);
 assert.equal(future.demo.verifiedNewFills,null);
 const stale=await probeProductionEvidence({fetchImpl,now:new Date('2026-11-11T15:30:00Z')});
 assert.equal(stale.demo.championWakeFresh,false);
 assert.equal(stale.demo.championWakeAgeSeconds,540);
 assert.equal(stale.demo.verifiedNewFills,null);
});

test('Demo balance transport causes are allowlisted, independent of terminal lifecycle, and never leak secrets',()=>{
 const demo=summarizeDemo({
  savedBalanceProbe:{status:'DEMO_TRANSPORT_ERROR',transportCause:'DEMO_REQUEST_TIMEOUT',
   checkedAt:'2026-11-11T19:00:00Z',operation:'GET_PORTFOLIO_BALANCE',
   secret:'SECRET_PRIVATE_KEY_VALUE'},
  lifecycleTest:{status:'DEMO_EXECUTION_TEST_VERIFIED',checkedAt:1794394985834}
 });
 assert.equal(demo.savedBalanceProbe.transportCause,'DEMO_REQUEST_TIMEOUT');
 assert.equal(demo.verifiedNewFills,null);
 assert.match(evidenceSummary({checkedAt:'2026-11-11T19:00:00Z',health:{},paper:{},demo}),/transport DEMO_REQUEST_TIMEOUT/);
 assert.equal(summarizeDemo({savedBalanceProbe:{status:'DEMO_TRANSPORT_ERROR',
  transportCause:'SECRET_PRIVATE_KEY_VALUE'}}).savedBalanceProbe.transportCause,'NOT_VERIFIED');
 assert.equal(summarizeDemo({savedBalanceProbe:{status:'DEMO_AUTHENTICATED',
  transportCause:'DEMO_REQUEST_TIMEOUT'}}).savedBalanceProbe.transportCause,null);
 assert.doesNotMatch(JSON.stringify(demo),/SECRET_PRIVATE_KEY_VALUE/);
});
