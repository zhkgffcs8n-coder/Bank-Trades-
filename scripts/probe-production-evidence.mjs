// Independent, read-only evidence snapshot. Never treats HTTP success as proof of model performance.
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const PRODUCTION_ORIGIN='https://neon-gecko-046bff.netlify.app';
const HEALTH_PATH='/.netlify/functions/omega-live-health';
const PAPER_PATH='/.netlify/functions/omega-paper-summary';
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const money=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const bool=x=>typeof x==='boolean'?x:null;
const state=(x,allowed)=>allowed.includes(x)?x:'NOT_VERIFIED';
const KNOWN_ASSETS=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
function safeCollectorCoverage(assets,reportedCount){
 if(!Array.isArray(assets)||assets.length>KNOWN_ASSETS.length||
  !assets.every(asset=>KNOWN_ASSETS.includes(asset))||
  new Set(assets).size!==assets.length||reportedCount!==assets.length)
  return {collectorSampledAssets:null,collectorMissingAssets:null};
 return {collectorSampledAssets:[...assets],
  collectorMissingAssets:KNOWN_ASSETS.filter(asset=>!assets.includes(asset))};
}
const KNOWN_PROVIDERS=['gpt','grok','deepseek','qwen','mistral','kimi','perplexity','claude','gemini'];
const PROVIDER_STATES=['RESEARCH_FORECAST','AWAITING_CHECK','PROVIDER_ERROR','PROVIDER_UNAVAILABLE','INVALID_RESPONSE','INVALID_KEY_FORMAT','UNCONFIGURED','INVALID_INPUT'];
const FUSION_REASONS=['Missing fresh Kalshi baseline','At least two distinct fresh research forecasts required','Missing market, round or evaluation timestamp'];
const ERROR_CODES=['invalid_api_key','authentication_error','insufficient_quota','model_not_found','permission_error','RESOURCE_EXHAUSTED','INVALID_ARGUMENT','PERMISSION_DENIED','UNAUTHENTICATED','NOT_FOUND','API_KEY_INVALID','API_KEY_SERVICE_BLOCKED','BILLING_DISABLED','CLAUDE_REFUSAL','CLAUDE_TRUNCATED'];
function safeProviderDiagnostics(entries){
 if(!Array.isArray(entries))return [];
 const seen=new Set(),safe=[];
 for(const entry of entries){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||!KNOWN_PROVIDERS.includes(entry.provider)||seen.has(entry.provider))continue;
  seen.add(entry.provider);
  const at=typeof entry.checkedAt==='string'?Date.parse(entry.checkedAt):NaN;
  safe.push({provider:entry.provider,status:state(entry.status,PROVIDER_STATES),
   checkedAt:Number.isFinite(at)&&at>0?new Date(at).toISOString():null,
   httpStatus:Number.isSafeInteger(entry.httpStatus)&&entry.httpStatus>=100&&entry.httpStatus<=599?entry.httpStatus:null,
   errorCode:ERROR_CODES.includes(entry.errorCode)?entry.errorCode:null});
  if(safe.length===KNOWN_PROVIDERS.length)break;
 }
 return safe;
}

export function summarizeHealth(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return {status:'INVALID_RESPONSE'};
 return {
  status:state(body.status,['COLLECTOR_FRESH','NOT_VERIFIED']),
  collectorStatus:state(body.collectorStatus,['COMPLETED','DEGRADED','RUNNING','FAILED','UNKNOWN']),
  collectorAgeSeconds:count(body.collectorAgeSeconds),
  sampledAssetCount:count(body.sampledAssetCount),
  ...safeCollectorCoverage(body.sampledAssets,body.sampledAssetCount),
  trainingSucceeded:bool(body.trainingSucceeded),
  collectorLastRunCounts:Object.fromEntries(
   ['newPendingPredictions','trained','trainingReviews','settlementFailures','researchFailures']
    .map(k=>[k,count(body.collectorLastRunCounts?.[k])])),
  omegaStatus:state(body.omegaStatus,['SHADOW_RESEARCH','INSUFFICIENT_DATA','STALE_PROVIDER_RESEARCH','NOT_VERIFIED','PROVIDERS_UNCONFIGURED','NO_FRESH_MARKET_OBSERVATION','PROVIDERS_COOLING_DOWN']),
  omegaObservationGate:state(body.omegaObservationGate,['COLLECTOR_SAMPLE_VALID','COLLECTOR_SAMPLE_UNAVAILABLE','INDEPENDENT_QUOTE_UNAVAILABLE','INDEPENDENT_QUOTE_VERIFIED','INDEPENDENT_QUOTE_REJECTED']),
  omegaAgeSeconds:count(body.omegaAgeSeconds),
  omegaLiveResearchRunning:bool(body.omegaLiveResearchRunning),
  omegaExternalProvidersRunning:bool(body.omegaExternalProvidersRunning),
  omegaProvidersConfigured:count(body.omegaProvidersConfigured),
  omegaReasons:Array.isArray(body.omegaReasons)?[...new Set(body.omegaReasons.filter(x=>FUSION_REASONS.includes(x)))].slice(0,3):[],
  omegaProviderStatus:safeProviderDiagnostics(body.omegaProviderStatus),
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
 const orders=(h.realOrdersAuthorized===true||p.realOrdersAuthorized===true)?'TRUE - REVIEW':
  (h.realOrdersAuthorized===false&&p.realOrdersAuthorized===false)?'false (both endpoints)':'unverified';
 const value=x=>x===null||x===undefined?'unverified':String(x);
 return [
  '## BANK TRADES PRO independent production evidence',
  'Checked (UTC): '+report.checkedAt,
  '',
  '| Check | Observed |',
  '| --- | --- |',
  '| Collector | '+value(h.status)+' (age '+value(h.collectorAgeSeconds)+'s) |',
  '| OMEGA scheduler | '+value(h.omegaStatus)+' (age '+value(h.omegaAgeSeconds)+'s) |',
  '| OMEGA quote gate | '+value(h.omegaObservationGate)+' |',
  '| Collector run state | '+value(h.collectorStatus)+' |',
  '| Collector coverage | '+value(h.sampledAssetCount)+'/8; missing: '+(Array.isArray(h.collectorMissingAssets)?(h.collectorMissingAssets.join(', ')||'none'):'unverified')+' |',
  '| OMEGA fusion blockers | '+(h.omegaReasons?.length?h.omegaReasons.join('; '):'none verified')+' |',
  '| Provider diagnostics | '+(h.omegaProviderStatus?.length?h.omegaProviderStatus.map(x=>x.provider+':'+x.status+(x.httpStatus?' HTTP '+x.httpStatus:'')).join('; '):'none verified')+' |',
  '| Two external providers active | '+value(h.omegaExternalProvidersRunning)+' |',
  '| OMEGA paper monitoring: exits | '+value(h.omegaPaperMonitoring?.exits)+' |',
  '| Paper archive | '+value(p.status)+' |',
  '| Officially settled paper positions | '+value(p.officiallySettledPositions)+' |',
  '| Net modeled paper P&L after recorded costs | '+value(p.realizedNetDollars)+' |',
  '| Real-money authorization (must be false) | '+orders+' |',
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
