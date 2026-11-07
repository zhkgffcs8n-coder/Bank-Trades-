// Scheduled, server-side OMEGA shadow research over the existing Kalshi collector.
// At most two configured providers and one asset per minute to bound API spending.
// Research is stored before settlement; no real or paper orders are executed.
import {getStore} from '@netlify/blobs';
import {runOmegaResearchRound} from '../../src/omega-orchestrator.mjs';
import {omegaProviderStatus} from '../../src/omega-provider-adapters.mjs';
import {omegaPaperSignal,advanceOmegaPaperStored,fetchOmegaLiveQuote} from './lib/omega-auto-paper.mjs';
import {scanBlobPage} from '../../src/paged-blob-scan.mjs';
const ASSETS=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
export function selectOmegaObservation({latest,nowMs,asset}){
 if(!latest||latest.asset!==asset||typeof latest.ticker!=='string'||!latest.ticker||
 !Number.isSafeInteger(latest.observedAt)||latest.observedAt>nowMs||nowMs-latest.observedAt>120000||
 !Number.isFinite(latest.expiresAt)||latest.expiresAt<=nowMs||
 ![latest.yesBid,latest.yesAsk,latest.noBid,latest.noAsk].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1))
 return null;
 const mid=(latest.yesBid+latest.yesAsk)/2;
 return {marketTicker:latest.ticker,roundId:latest.ticker,marketSnapshot:{
  yesBid:latest.yesBid,yesAsk:latest.yesAsk,noBid:latest.noBid,noAsk:latest.noAsk,
  expiresAt:latest.expiresAt,observedAt:latest.observedAt},
  marketBaseline:{marketTicker:latest.ticker,roundId:latest.ticker,upProbability:mid,observedAtMs:latest.observedAt}};
}
export async function runOmegaScheduled({nowMs=Date.now(),db,env=process.env,fetchImpl=fetch,clock=()=>nowMs}={}){
 const minute=Math.floor(nowMs/60000),asset=ASSETS[minute%ASSETS.length];
 const configured=omegaProviderStatus(env).filter(x=>x.configured).map(x=>x.provider);
 const offset=minute%Math.max(1,configured.length);
 const selectedProviders=[...configured.slice(offset),...configured.slice(0,offset)].slice(0,2);
 // Monitor already-open paper positions independently of provider availability and asset rotation.
 // Only active contracts with independently fetched executable quotes can be exited.
 const paperMonitoring={open:0,exits:0,holds:0,unpriced:0,backfilled:0};
 const monitoredTickers=new Set();
 async function monitorOpenTicker(ticker){
  if(typeof ticker!=='string'||!/^[A-Z0-9-]{3,100}$/.test(ticker)||monitoredTickers.has(ticker))return;
  monitoredTickers.add(ticker);
  const stored=await db.get('omega/paper/v1/'+ticker,{type:'json'});
  if(stored?.state?.positions?.[ticker]?.status!=='OPEN'){
   // A stale index marker must not resurrect a closed position.
   if(typeof db.delete==='function')await db.delete('omega/paper/open/v1/'+ticker);
   return;
  }
  paperMonitoring.open++;
  const quote=await fetchOmegaLiveQuote({ticker,nowMs,fetchImpl});
  if(!quote){paperMonitoring.unpriced++;return;}
  const action=await advanceOmegaPaperStored({db,ticker,roundId:ticker,signal:null,quote,nowMs});
  if(action.status==='PAPER_EXIT')paperMonitoring.exits++;
  else if(action.status==='PAPER_HOLD')paperMonitoring.holds++;
  else paperMonitoring.unpriced++;
 }
 // Durable per-ticker open markers survive asset rotation. Bound every scan to
 // keep scheduled function costs predictable; cursors resume on later minutes.
 if(typeof db.list==='function'){
  await scanBlobPage(db,{prefix:'omega/paper/open/v1/',cursorKey:'omega/paper/scan/open-v1',limit:4},
   async ({key})=>monitorOpenTicker(key.slice('omega/paper/open/v1/'.length)));
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
  await monitorOpenTicker(snapshot?.ticker);
 }
 const latest=await db.get('latest/'+asset,{type:'json'});
 let observation=selectOmegaObservation({latest,nowMs,asset});
 let freshQuote=null;
 if(observation&&configured.length>=2){
  freshQuote=await fetchOmegaLiveQuote({ticker:observation.marketTicker,nowMs,fetchImpl});
  observation=freshQuote?selectOmegaObservation({asset,nowMs,latest:{...latest,observedAt:freshQuote.asOfMs,yesBid:freshQuote.yesBidDollars,yesAsk:freshQuote.yesAskDollars,noBid:freshQuote.noBidDollars,noAsk:freshQuote.noAskDollars}}):null;
 }
 let report;
 if(!observation)report={status:'NO_FRESH_MARKET_OBSERVATION',asset,providersConfigured:configured.length,ordersAuthorized:false};
 else if(configured.length<2)report={status:'PROVIDERS_UNCONFIGURED',asset,ticker:observation.marketTicker,providersConfigured:configured.length,ordersAuthorized:false};
 else{
  const result=await runOmegaResearchRound({...observation,nowMs,env,fetchImpl,providers:selectedProviders});
  report={status:result.status,asset,ticker:observation.marketTicker,providersConfigured:configured.length,
   providerStatus:result.providerStatus,reasons:result.fusion?.reasons||[],accepted:result.fusion?.accepted||[],baseline:result.fusion?.marketBaseline??null,
   disagreement:result.fusion?.modelDisagreement??null,observedAtMs:observation.marketSnapshot.observedAt,recordedAtMs:clock(),ordersAuthorized:false};
  // Paper execution is separate from research. Never submit real orders.
  const quote=await fetchOmegaLiveQuote({ticker:observation.marketTicker,nowMs,fetchImpl});
  if(quote){
   const paper=await advanceOmegaPaperStored({db,ticker:observation.marketTicker,roundId:observation.roundId,
    signal:omegaPaperSignal(result),quote,nowMs});
   report.paperStatus=paper.status;
  }else report.paperStatus='NO_FRESH_EXECUTABLE_QUOTE';
  // Append-only round snapshot: do not overwrite a forecast after settlement.
  if(result.status==='SHADOW_RESEARCH'&&latest.expiresAt>report.recordedAtMs){
   const key='omega/predictions/v1/'+observation.marketTicker+'/'+minute;
   await db.setJSON(key,report,{onlyIfNew:true});
  }
 }
 // Keep the last actual provider check visible on runs that skip forecasts.
 const previous=await db.get('omega/heartbeat',{type:'json'});
 const checkedAt=new Date(nowMs).toISOString(), checked=report.providerStatus||[];
 const checks=new Map((previous?.providerStatus||[]).map(entry=>[entry.provider,entry]));
 for(const entry of checked)checks.set(entry.provider,{...entry,checkedAt});
 report.lastProviderCheckAt=checked.length?checkedAt:previous?.lastProviderCheckAt||null;
 report.providerStatus=configured.map(provider=>checks.get(provider)||{provider,status:'AWAITING_CHECK'});
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
