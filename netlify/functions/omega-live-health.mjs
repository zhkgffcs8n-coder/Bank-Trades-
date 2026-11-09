// Public read-only heartbeat: never report a configured schedule as proof of live operation.
import {getStore} from '@netlify/blobs';
export function omegaLiveHealth(heartbeat,nowMs=Date.now(),omegaHeartbeat=null,paperHeartbeat=null,forecastResearch=null){
 const raw=heartbeat?.completedAt;
 const completed=typeof raw==='number'?raw:typeof raw==='string'?Date.parse(raw):NaN;
 // A clock-skewed future heartbeat is not a zero-age successful collection.
 const ageSeconds=Number.isFinite(completed)&&completed<=nowMs?Math.floor((nowMs-completed)/1000):null;
 const sampled=Array.isArray(heartbeat?.sampledAssets)?heartbeat.sampledAssets:[];
 // Eight samples are not eight markets if a corrupted heartbeat repeats one
 // asset. Require the actual collector's complete distinct market coverage.
 const expectedAssets=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
 const distinctSampled=new Set(sampled.filter(asset=>typeof asset==='string'));
 // Require the collector's complete exact sample set and its own recorded
 // count/failure diagnostics, not merely eight distinct names among extras.
 const fullCoverage=sampled.length===expectedAssets.length&&
  distinctSampled.size===expectedAssets.length&&
  expectedAssets.every(asset=>distinctSampled.has(asset))&&
  heartbeat?.sampledAssetCount===expectedAssets.length&&
  Array.isArray(heartbeat?.failedAssets)&&heartbeat.failedAssets.length===0;
 const fresh=ageSeconds!==null&&completed<=nowMs&&ageSeconds<=150;
 const healthy=fresh&&heartbeat?.status==='COMPLETED'&&fullCoverage&&heartbeat?.trainingSucceeded===true;
 const omegaAt=Date.parse(omegaHeartbeat?.checkedAt||'');
 const omegaAgeSeconds=Number.isFinite(omegaAt)&&omegaAt<=nowMs?Math.floor((nowMs-omegaAt)/1000):null;
 const omegaRunning=omegaAgeSeconds!==null&&omegaAgeSeconds<=150&&omegaHeartbeat?.status==='SHADOW_RESEARCH';
 // A fresh scheduler heartbeat alone does not prove any external provider
 // actually returned a forecast. Require two distinct recent successful
 // provider checks; configured keys and stale successes are not activity.
 const activeProviders=new Set((Array.isArray(omegaHeartbeat?.providerStatus)?omegaHeartbeat.providerStatus:[])
  .filter(entry=>{
   const checkedAt=Date.parse(entry?.checkedAt||'');
   return typeof entry?.provider==='string'&&entry.provider.length>0&&
    entry.status==='RESEARCH_FORECAST'&&Number.isFinite(checkedAt)&&
    checkedAt<=nowMs&&nowMs-checkedAt<=150000;
  }).map(entry=>entry.provider));
 const externalProvidersRunning=omegaRunning&&
  Number.isSafeInteger(omegaHeartbeat?.providersConfigured)&&omegaHeartbeat.providersConfigured>=2&&
  activeProviders.size>=2;
 return {status:healthy?'COLLECTOR_FRESH':'NOT_VERIFIED',collectorStatus:heartbeat?.status||'UNKNOWN',
  collectorAgeSeconds:ageSeconds,sampledAssetCount:distinctSampled.size,sampledAssets:sampled,
  trainingSucceeded:heartbeat?.trainingSucceeded===true,expectedIntervalSeconds:60,
  // These are counts for the LAST collector invocation, never lifetime totals.
  collectorLastRunCounts:Object.fromEntries([
   ['newPendingPredictions','newPendingPredictions'],['trained','trainedThisRun'],
   ['trainingReviews','trainingReviewCount'],['settlementFailures','settlementFailures'],
   ['researchFailures','researchFailures']
  ].map(([label,key])=>[label,Number.isSafeInteger(heartbeat?.[key])&&heartbeat[key]>=0?heartbeat[key]:null])),
  omegaExternalProvidersRunning:externalProvidersRunning,omegaLiveResearchRunning:omegaRunning,
  omegaStatus:omegaHeartbeat?.status||'NOT_VERIFIED',omegaAgeSeconds,
   omegaObservationGate:omegaAgeSeconds!==null&&omegaAgeSeconds<=150&&
    ['COLLECTOR_SAMPLE_VALID','COLLECTOR_SAMPLE_UNAVAILABLE',
     'INDEPENDENT_QUOTE_UNAVAILABLE','INDEPENDENT_QUOTE_VERIFIED',
     'INDEPENDENT_QUOTE_REJECTED'].includes(omegaHeartbeat?.observationGate)?
    omegaHeartbeat.observationGate:'NOT_VERIFIED',
  omegaReasons:Array.isArray(omegaHeartbeat?.reasons)?omegaHeartbeat.reasons:[],
  omegaProviderCheckedAt:omegaHeartbeat?.lastProviderCheckAt||null,
  omegaProviderStatus:Array.isArray(omegaHeartbeat?.providerStatus)?omegaHeartbeat.providerStatus
   .filter(x=>x&&typeof x==='object'&&!Array.isArray(x))
   .map(x=>({provider:x.provider,status:x.status,...(x.checkedAt?{checkedAt:x.checkedAt}:{}),...(Number.isInteger(x.httpStatus)?{httpStatus:x.httpStatus}:{}),...(x.errorCode?{errorCode:x.errorCode}:{})})):[],
  omegaProvidersConfigured:omegaHeartbeat?.providersConfigured??0,
  omegaPaperMonitoring:Object.fromEntries(['open','exits','holds','settled','unpriced','backfilled'].map(k=>
   [k,Number.isSafeInteger(omegaHeartbeat?.paperMonitoring?.[k])&&omegaHeartbeat.paperMonitoring[k]>=0?
    omegaHeartbeat.paperMonitoring[k]:null])),
  // A future-dated or timestamp-free record cannot establish a completed
  // paper action. Never surface its net dollars as realized paper profit.
  paperLastAction:(()=>{
   const at=paperHeartbeat?.updatedAtMs;
   if(!Number.isSafeInteger(at)||at<=0||at>nowMs)return 'NONE_VERIFIED';
   if(['PAPER_ENTRY','PAPER_EXIT'].includes(paperHeartbeat?.action))return paperHeartbeat.action;
   return paperHeartbeat?.action==='PAPER_SETTLED'?'PAPER_SETTLEMENT_UNVERIFIED':'NONE_VERIFIED';
  })(),
  paperLastActionAtMs:Number.isSafeInteger(paperHeartbeat?.updatedAtMs)&&paperHeartbeat.updatedAtMs>0&&paperHeartbeat.updatedAtMs<=nowMs&&
   ['PAPER_ENTRY','PAPER_EXIT','PAPER_SETTLED'].includes(paperHeartbeat?.action)?paperHeartbeat.updatedAtMs:null,
  // A self-reported settlement heartbeat is diagnostic only; expose it as
  // unverified even when it carries an officiallySettled flag. The read-only
  // paper summary must independently reconcile the persisted official outcome.
  // A standalone PAPER_SETTLED heartbeat is not independent official
  // settlement evidence: the position and the separate outcomes/ticker
  // record must agree before realized settlement P&L is reported. Only
  // expose the last simulated bid-exit amount here. Official settlement
  // P&L belongs to the independently reconciled omega-paper-summary.
  // Neither figure is a cumulative trading result.
  paperLastActionNetDollars:paperHeartbeat?.action==='PAPER_EXIT'&&
   Number.isSafeInteger(paperHeartbeat?.updatedAtMs)&&paperHeartbeat.updatedAtMs>0&&paperHeartbeat.updatedAtMs<=nowMs&&
   Number.isFinite(paperHeartbeat?.netDollars)?paperHeartbeat.netDollars:null,
  forecastShadow:(()=>{
   const age=Number.isSafeInteger(forecastResearch?.at)&&forecastResearch.at<=nowMs?Math.floor((nowMs-forecastResearch.at)/1000):null;
   if(forecastResearch?.version!==2||forecastResearch?.mode!=='SHADOW_ONLY'||age===null||age>150)return {status:'NOT_VERIFIED',ageSeconds:age};
   const n=forecastResearch.n,wins=forecastResearch.wins,losses=forecastResearch.losses;
   if(![n,wins,losses].every(x=>Number.isSafeInteger(x)&&x>=0)||wins+losses!==n)return {status:'INVALID_REPORT',ageSeconds:age};
   return {status:'BOUNDED_VERIFIED_RESEARCH',ageSeconds:age,verifiedResolved:n,wins,losses,
    scope:forecastResearch.scope==='ALL_OBSERVED'&&forecastResearch.truncated===false?'ALL_OBSERVED':'FIRST_PAGE_ONLY',
    hypotheticalNetDollars:Number.isFinite(forecastResearch.simulatedNetPnl)?forecastResearch.simulatedNetPnl:null,
    excludedUnverified:Number.isSafeInteger(forecastResearch.excludedUnverified)?forecastResearch.excludedUnverified:null,
    conflictingTickers:Number.isSafeInteger(forecastResearch.conflictingTickers)?forecastResearch.conflictingTickers:null,
    notice:'Frozen hypothetical research with assumed costs, not actual fills or proven model improvement'};
  })(),
  titanShadows:Object.fromEntries(Object.entries(forecastResearch?.titanReports??{}).filter(([asset,report])=>
   /^(ETH|SOL|XRP|DOGE|BNB|HYPE|ZEC)$/.test(asset)&&report?.mode==='SETTLEMENT_SHADOW'&&
   Number.isSafeInteger(report.at)&&report.at<=nowMs&&nowMs-report.at<=600000)),
  titanShadow:forecastResearch?.titan?.mode==='SETTLEMENT_SHADOW'&&
   Number.isSafeInteger(forecastResearch.titan.at)&&forecastResearch.titan.at<=nowMs&&nowMs-forecastResearch.titan.at<=420000
   ?forecastResearch.titan:null,
  realOrdersAuthorized:false,
  notice:'Fresh collector observations do not prove OMEGA external provider integration or verified trading accuracy.'};
}
export default async req=>{
 if(req.method!=='GET')return new Response(JSON.stringify({error:'GET only'}),{status:405,headers:{'content-type':'application/json'}});
 try{
  const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
  const [heartbeat,omegaHeartbeat,paperHeartbeat,forecastResearch]=await Promise.all([
   db.get('collector/heartbeat',{type:'json'}),db.get('omega/heartbeat',{type:'json'}),db.get('omega/paper/latest',{type:'json'}),db.get('forecast-shadow/report-v1',{type:'json'})]);
  return new Response(JSON.stringify(omegaLiveHealth(heartbeat,Date.now(),omegaHeartbeat,paperHeartbeat,forecastResearch)),{headers:{'content-type':'application/json','cache-control':'no-store'}});
 }catch{
  return new Response(JSON.stringify(omegaLiveHealth(null)),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
};
