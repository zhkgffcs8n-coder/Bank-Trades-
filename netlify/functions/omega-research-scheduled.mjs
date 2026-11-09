// Scheduled, server-side OMEGA shadow research over the existing Kalshi collector.
// At most two configured providers and one asset per minute to bound API spending.
// Research is stored before settlement; no real or paper orders are executed.
import {randomUUID} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {runOmegaResearchRound} from '../../src/omega-orchestrator.mjs';
import {omegaProviderStatus} from '../../src/omega-provider-adapters.mjs';
import {omegaPaperSignal,advanceOmegaPaperStored,settleOmegaPaperStored,fetchOmegaLiveQuote} from './lib/omega-auto-paper.mjs';
import {scanBlobPage} from '../../src/paged-blob-scan.mjs';
import {validCollectorQuote} from '../../src/collector-quote.mjs';
const ASSETS=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
export function selectOmegaObservation({latest,nowMs,asset}){
 if(!latest||latest.asset!==asset||typeof latest.ticker!=='string'||!latest.ticker||
 !Number.isSafeInteger(latest.observedAt)||latest.observedAt>nowMs||nowMs-latest.observedAt>120000||
 !Number.isFinite(latest.expiresAt)||latest.expiresAt<=nowMs||
 !validCollectorQuote(latest))
 return null;
 const mid=(latest.yesBid+latest.yesAsk)/2;
 return {marketTicker:latest.ticker,roundId:latest.ticker,marketSnapshot:{
  yesBid:latest.yesBid,yesAsk:latest.yesAsk,noBid:latest.noBid,noAsk:latest.noAsk,
  expiresAt:latest.expiresAt,observedAt:latest.observedAt},
  marketBaseline:{marketTicker:latest.ticker,roundId:latest.ticker,upProbability:mid,observedAtMs:latest.observedAt}};
}
export async function runOmegaScheduled({nowMs=Date.now(),db,env=process.env,fetchImpl=fetch,clock=()=>nowMs}={}){
 const minute=Math.floor(nowMs/60000),preferredAsset=ASSETS[minute%ASSETS.length];
 const configured=omegaProviderStatus(env).filter(x=>x.configured).map(x=>x.provider);
 const previous=await db.get('omega/heartbeat',{type:'json'});
 // A malformed persisted heartbeat must not prevent monitoring open paper positions.
 // Ignore invalid provider diagnostics rather than crashing the scheduled run.
 const priorChecks=Array.isArray(previous?.providerStatus)?previous.providerStatus:[];
 const checks=new Map(priorChecks.filter(entry=>entry&&typeof entry.provider==='string'&&
  configured.includes(entry.provider)).map(entry=>[entry.provider,entry]));
 const available=configured.filter(provider=>{
  const retryAt=checks.get(provider)?.retryAtMs;
  return !Number.isSafeInteger(retryAt)||retryAt<=nowMs;
 });
 const offset=minute%Math.max(1,available.length);
 const selectedProviders=[...available.slice(offset),...available.slice(0,offset)].slice(0,2);
 // Monitor already-open paper positions independently of provider availability and asset rotation.
 // Only active contracts with independently fetched executable quotes can be exited.
 const paperMonitoring={open:0,exits:0,holds:0,settled:0,unpriced:0,backfilled:0};
 const monitoredTickers=new Set();
 const latestByAsset=new Map();
 async function monitorOpenTicker(ticker,{indexed=false}={}){
  if(typeof ticker!=='string'||!/^[A-Z0-9-]{3,100}$/.test(ticker)||monitoredTickers.has(ticker))return;
  monitoredTickers.add(ticker);
  const stored=await db.get('omega/paper/v1/'+ticker,{type:'json'});
  const position=stored?.state?.positions?.[ticker];
  if(!position){
   // A missing/unreadable ledger is not evidence of a closed position.
   // Keep its durable open marker for a later retry or reconciliation.
   if(indexed)paperMonitoring.unpriced++;
   return;
  }
  if(position.status!=='OPEN'){
   // Clear the marker only after observing a persisted terminal position.
   // Malformed states are not proof of closure and must remain recoverable.
   if(['CLOSED','SETTLED'].includes(position.status)&&typeof db.delete==='function')
    await db.delete('omega/paper/open/v1/'+ticker);
   else if(indexed)paperMonitoring.unpriced++;
   return;
  }
  paperMonitoring.open++;
  const quote=await fetchOmegaLiveQuote({ticker,nowMs,fetchImpl,clock});
  if(!quote){
   const settled=await settleOmegaPaperStored({db,ticker,nowMs});
   if(settled.status==='PAPER_SETTLED')paperMonitoring.settled++;
   else paperMonitoring.unpriced++;
   return;
  }
  // The Kalshi quote is stamped when the HTTP response arrives. Use a
  // post-receipt decision clock; the scheduler's start time predates the quote
  // and would reject every legitimate simulated exit as future-dated.
  const pricedAtMs=clock();
  const action=await advanceOmegaPaperStored({db,ticker,roundId:ticker,signal:null,quote,nowMs:pricedAtMs});
  if(action.status==='PAPER_EXIT')paperMonitoring.exits++;
  else if(action.status==='PAPER_HOLD')paperMonitoring.holds++;
  else paperMonitoring.unpriced++;
 }
 // Durable per-ticker open markers survive asset rotation. Bound every scan to
 // keep scheduled function costs predictable; cursors resume on later minutes.
 if(typeof db.list==='function'){
  await scanBlobPage(db,{prefix:'omega/paper/open/v1/',cursorKey:'omega/paper/scan/open-v1',limit:4},
   async ({key})=>monitorOpenTicker(key.slice('omega/paper/open/v1/'.length),{indexed:true}));
  // Recover positions opened before the marker index was introduced (or before
  // an interrupted marker write). Never mark them closed without a valid quote.
  await scanBlobPage(db,{prefix:'omega/paper/v1/',cursorKey:'omega/paper/scan/backfill-v1',limit:2},
   async ({key})=>{
    const ticker=key.slice('omega/paper/v1/'.length);
    if(!/^[A-Z0-9-]{3,100}$/.test(ticker))return;
    const stored=await db.get(key,{type:'json'});
    if(stored?.state?.positions?.[ticker]?.status!=='OPEN')return;
    const marker='omega/paper/open/v1/'+ticker;
    if(!await db.get(marker,{type:'json'})){
     await db.setJSON(marker,{ticker,backfilledAtMs:nowMs,realOrdersAuthorized:false});
     paperMonitoring.backfilled++;
    }
    await monitorOpenTicker(ticker);
   });
 }
 // Fast path: current collector contracts are monitored every minute, even
 // when a bounded archive scan has not yet reached their marker.
 for(const monitoredAsset of ASSETS){
  const snapshot=await db.get('latest/'+monitoredAsset,{type:'json'});
  latestByAsset.set(monitoredAsset,snapshot);
  await monitorOpenTicker(snapshot?.ticker);
 }
 // Rotate the first choice, but do not waste the entire minute when that
 // asset has no eligible collector quote. Reuse snapshots already read for
 // paper monitoring; select at most ONE valid market for research this run.
 // All candidates still require independent Kalshi quote verification.
 const preferredIndex=minute%ASSETS.length;
 const candidates=[...ASSETS.slice(preferredIndex),...ASSETS.slice(0,preferredIndex)];
 let asset=preferredAsset,latest=latestByAsset.get(preferredAsset)||null;
 let observation=selectOmegaObservation({latest,nowMs,asset});
 if(!observation){
  for(const candidate of candidates.slice(1)){
   const candidateLatest=latestByAsset.get(candidate);
   const selected=selectOmegaObservation({latest:candidateLatest,nowMs,asset:candidate});
   if(!selected)continue;
   asset=candidate;latest=candidateLatest;observation=selected;
   break;
  }
 }
 // A bounded, non-sensitive diagnostic explains why a scheduled research round
 // skipped; never relax the independent quote or freshness gates.
 let observationGate=observation?'COLLECTOR_SAMPLE_VALID':'COLLECTOR_SAMPLE_UNAVAILABLE';
 let freshQuote=null;
 if(observation&&configured.length>=2&&selectedProviders.length){
  // Check expiry against the clock AFTER the network read. A response that
  // arrives after close must not trigger paid provider calls or research.
  freshQuote=await fetchOmegaLiveQuote({ticker:observation.marketTicker,nowMs,fetchImpl,clock});
  const observationAtMs=clock();
  observation=freshQuote?selectOmegaObservation({asset,nowMs:observationAtMs,latest:{...latest,observedAt:freshQuote.asOfMs,yesBid:freshQuote.yesBidDollars,yesAsk:freshQuote.yesAskDollars,noBid:freshQuote.noBidDollars,noAsk:freshQuote.noAskDollars}}):null;
  observationGate=!freshQuote?'INDEPENDENT_QUOTE_UNAVAILABLE':
   observation?'INDEPENDENT_QUOTE_VERIFIED':'INDEPENDENT_QUOTE_REJECTED';
 }
 let report;
 if(!observation)report={status:'NO_FRESH_MARKET_OBSERVATION',asset,providersConfigured:configured.length,ordersAuthorized:false};
 else if(configured.length<2)report={status:'PROVIDERS_UNCONFIGURED',asset,ticker:observation.marketTicker,providersConfigured:configured.length,ordersAuthorized:false};
 else if(!selectedProviders.length)report={status:'PROVIDERS_COOLING_DOWN',asset,ticker:observation.marketTicker,providersConfigured:configured.length,ordersAuthorized:false};
 else{
  const result=await runOmegaResearchRound({...observation,nowMs:clock(),env,fetchImpl,providers:selectedProviders});
  report={status:result.status,asset,ticker:observation.marketTicker,providersConfigured:configured.length,
   providerStatus:result.providerStatus,reasons:result.fusion?.reasons||[],accepted:result.fusion?.accepted||[],baseline:result.fusion?.marketBaseline??null,
   disagreement:result.fusion?.modelDisagreement??null,observedAtMs:observation.marketSnapshot.observedAt,
   // Freeze the contract expiry alongside the prediction so a settlement
   // scorer can reject forecasts recorded after the market already closed.
   expiresAtMs:latest.expiresAt,recordedAtMs:clock(),ordersAuthorized:false};
  // Provider responses may arrive long after research began. The fusion
  // validator checked freshness against the earlier request clock, so check
  // every accepted observation again at the durable forecast freeze time.
  // Never archive or paper-enter a forecast that aged out during API latency.
  const freshAtFreeze=result.status==='SHADOW_RESEARCH'&&
   Array.isArray(result.fusion?.accepted)&&result.fusion.accepted.length>=2&&
   result.fusion.accepted.every(entry=>Number.isSafeInteger(entry.observedAtMs)&&
    entry.observedAtMs>0&&entry.observedAtMs<=report.recordedAtMs&&
    report.recordedAtMs-entry.observedAtMs<=15000);
  if(result.status==='SHADOW_RESEARCH'&&!freshAtFreeze){
   report.status='STALE_PROVIDER_RESEARCH';
   report.paperStatus='FORECAST_STALE_BEFORE_FREEZE';
  }
  // Persist the prospective forecast before attempting simulated execution.
  if(freshAtFreeze&&latest.expiresAt>report.recordedAtMs){
   const key='omega/predictions/v1/'+observation.marketTicker+'/'+minute;
   // The immutable prospective forecast must be durably visible before paper
   // execution. A duplicate scheduled invocation must not trade against its
   // new, unrecorded forecast if another invocation already froze this minute.
   const frozen={...report,freezeId:randomUUID()};
   await db.setJSON(key,frozen,{onlyIfNew:true});
   const persisted=await db.get(key,{type:'json'});
   if(persisted?.freezeId!==frozen.freezeId||persisted?.ticker!==frozen.ticker||
    persisted?.recordedAtMs!==frozen.recordedAtMs){
    report.paperStatus='FORECAST_NOT_NEWLY_PERSISTED';
   }else{
    const quote=await fetchOmegaLiveQuote({ticker:observation.marketTicker,nowMs:clock(),fetchImpl,clock});
    const executionAtMs=clock();
    if(quote&&executionAtMs<latest.expiresAt){
     const paper=await advanceOmegaPaperStored({db,ticker:observation.marketTicker,roundId:observation.roundId,
      signal:omegaPaperSignal(result,quote),quote,nowMs:executionAtMs});
     report.paperStatus=paper.status;
    }else report.paperStatus='NO_FRESH_EXECUTABLE_QUOTE';
   }
  }
 }
 // Keep the last actual provider check visible on runs that skip forecasts.
 const checkedAt=new Date(nowMs).toISOString(), checked=report.providerStatus||[];
 for(const entry of checked){
  const permanentFailure=entry.status==='INVALID_KEY_FORMAT'||[401,403].includes(entry.httpStatus)||
   ['insufficient_quota','API_KEY_INVALID','BILLING_DISABLED'].includes(entry.errorCode);
  const cooldown=permanentFailure?15*60000:2*60000;
  const retry=entry.status==='RESEARCH_FORECAST'?{}:{retryAtMs:nowMs+cooldown};
  checks.set(entry.provider,{...entry,checkedAt,...retry});
 }
 report.lastProviderCheckAt=checked.length?checkedAt:previous?.lastProviderCheckAt||null;
 report.providerStatus=configured.map(provider=>checks.get(provider)||{provider,status:'AWAITING_CHECK'});
 report.observationGate=observationGate;
 report.paperMonitoring=paperMonitoring;
 await db.setJSON('omega/heartbeat',{...report,checkedAt:new Date(nowMs).toISOString(),expectedIntervalSeconds:60,
  coverage:'One rotating asset per minute; not every market every second',realOrdersAuthorized:false});
 return report;
}
export default async()=>{
 try{const db=getStore({name:'bank-trades-market-history',consistency:'strong'});await runOmegaScheduled({db,clock:Date.now});return new Response(null,{status:204});}
 catch(e){console.error('OMEGA scheduled research failed',String(e).slice(0,160));return new Response(null,{status:500});}
};
export const config={schedule:'* * * * *'};
