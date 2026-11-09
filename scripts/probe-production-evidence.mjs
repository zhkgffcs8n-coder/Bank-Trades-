// Independent, read-only evidence snapshot. Never treats HTTP success as proof of model performance.
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const PRODUCTION_ORIGIN='https://neon-gecko-046bff.netlify.app';
const HEALTH_PATH='/.netlify/functions/omega-live-health';
const PAPER_PATH='/.netlify/functions/omega-paper-summary';
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const money=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const bool=x=>x===true;
const state=(x,allowed)=>allowed.includes(x)?x:'NOT_VERIFIED';

export function summarizeHealth(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return {status:'INVALID_RESPONSE'};
 return {
  status:state(body.status,['COLLECTOR_FRESH','NOT_VERIFIED']),
  collectorStatus:state(body.collectorStatus,['COMPLETED','FAILED','UNKNOWN']),
  collectorAgeSeconds:count(body.collectorAgeSeconds),
  sampledAssetCount:count(body.sampledAssetCount),
  trainingSucceeded:bool(body.trainingSucceeded),
  collectorLastRunCounts:Object.fromEntries(
   ['newPendingPredictions','trained','trainingReviews','settlementFailures','researchFailures']
    .map(k=>[k,count(body.collectorLastRunCounts?.[k])])),
  omegaStatus:state(body.omegaStatus,['SHADOW_RESEARCH','NOT_VERIFIED','PROVIDERS_UNCONFIGURED','NO_FRESH_MARKET_OBSERVATION','PROVIDERS_COOLING_DOWN']),
  omegaAgeSeconds:count(body.omegaAgeSeconds),
  omegaLiveResearchRunning:bool(body.omegaLiveResearchRunning),
  omegaExternalProvidersRunning:bool(body.omegaExternalProvidersRunning),
  omegaProvidersConfigured:count(body.omegaProvidersConfigured),
  omegaPaperMonitoring:Object.fromEntries(['open','exits','holds','settled','unpriced','backfilled']
   .map(k=>[k,count(body.omegaPaperMonitoring?.[k])])),
  paperLastAction:state(body.paperLastAction,['PAPER_ENTRY','PAPER_EXIT','PAPER_SETTLEMENT_UNVERIFIED','NONE_VERIFIED']),
  forecastShadowStatus:state(body.forecastShadow?.status,['BOUNDED_VERIFIED_RESEARCH','NOT_VERIFIED','INVALID_REPORT']),
  realOrdersAuthorized:bool(body.realOrdersAuthorized)
 };
}
export function summarizePaper(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return {status:'INVALID_RESPONSE'};
 const complete=body.status==='COMPLETE_INSPECTED_ARCHIVE'&&body.historyTruncated===false&&body.invalidPositions===0;
 return {
  status:complete?'COMPLETE_INSPECTED_ARCHIVE':'NOT_VERIFIED',
  inspectedPositions:count(body.inspectedPositions),
  historyTruncated:body.historyTruncated===true,
  invalidPositions:count(body.invalidPositions),
  openPositions:count(body.openPositions),
  simulatedBidExits:count(body.simulatedBidExits),
  officiallySettledPositions:count(body.officiallySettledPositions),
  realizedPositions:count(body.realizedPositions),
  realizedNetDollars:complete?money(body.realizedNetDollars):null,
  maxRealizedDrawdownDollars:complete?money(body.maxRealizedDrawdownDollars):null,
  realOrdersAuthorized:bool(body.ordersAuthorized)
 };
}
async function readEndpoint(path,summarize,{fetchImpl,origin}){
 try{
  const response=await fetchImpl(origin+path,{
   method:'GET',headers:{accept:'application/json'},redirect:'error',
   signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)return {status:'UNAVAILABLE',httpStatus:response.status};
  const value=summarize(await response.json());
  return value.status==='INVALID_RESPONSE'?{status:'INVALID_RESPONSE'}:value;
 }catch{
  // Do not include raw URLs, exception messages, headers, tokens, or response bodies in artifacts.
  return {status:'UNAVAILABLE',reason:'NETWORK_TIMEOUT_OR_INVALID_JSON'};
 }
}
export async function probeProductionEvidence({fetchImpl=fetch,origin=PRODUCTION_ORIGIN,now=new Date()}={}){
 const [health,paper]=await Promise.all([
  readEndpoint(HEALTH_PATH,summarizeHealth,{fetchImpl,origin}),
  readEndpoint(PAPER_PATH,summarizePaper,{fetchImpl,origin})
 ]);
 return {checkedAt:now.toISOString(),mode:'READ_ONLY_EVIDENCE',health,paper,
  verifiedProfitableTrading:false,
  notice:'Endpoint diagnostics are not proof of exchange fills, official learning, or improved strategy performance.'};
}
export function evidenceSummary(report){
 const h=report.health,p=report.paper;
 const value=x=>x===null||x===undefined?'unverified':String(x);
 return [
  '## BANK TRADES PRO independent production evidence',
  'Checked (UTC): '+report.checkedAt,
  '',
  '| Check | Observed |',
  '| --- | --- |',
  '| Collector | '+value(h.status)+' (age '+value(h.collectorAgeSeconds)+'s) |',
  '| OMEGA scheduler | '+value(h.omegaStatus)+' (age '+value(h.omegaAgeSeconds)+'s) |',
  '| Two external providers active | '+value(h.omegaExternalProvidersRunning)+' |',
  '| OMEGA paper monitoring: exits | '+value(h.omegaPaperMonitoring?.exits)+' |',
  '| Paper archive | '+value(p.status)+' |',
  '| Officially settled paper positions | '+value(p.officiallySettledPositions)+' |',
  '| Net modeled paper P&L after recorded costs | '+value(p.realizedNetDollars)+' |',
  '| Real-money authorization (must be false) | '+value(h.realOrdersAuthorized||p.realOrdersAuthorized)+' |',
  '',
  'A completed probe is **not** a health certification. Missing, stale or partial evidence is not a verified trading result.'
 ].join('\n')+'\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await probeProductionEvidence();
 await mkdir('evidence',{recursive:true});
 await writeFile('evidence/production-evidence.json',JSON.stringify(report,null,2)+'\n');
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,evidenceSummary(report));
 console.log('Production evidence: collector='+report.health.status+' paper='+report.paper.status);
}
