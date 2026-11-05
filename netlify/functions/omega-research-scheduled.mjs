// Scheduled, server-side OMEGA shadow research over the existing Kalshi collector.
// At most two configured providers and one asset per minute to bound API spending.
// Research is stored before settlement; no real or paper orders are executed.
import {getStore} from '@netlify/blobs';
import {runOmegaResearchRound} from '../../src/omega-orchestrator.mjs';
import {omegaProviderStatus} from '../../src/omega-provider-adapters.mjs';
import {omegaPaperSignal,advanceOmegaPaperStored,fetchOmegaLiveQuote} from './lib/omega-auto-paper.mjs';
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
export async function runOmegaScheduled({nowMs=Date.now(),db,env=process.env,fetchImpl=fetch}={}){
 const minute=Math.floor(nowMs/60000),asset=ASSETS[minute%ASSETS.length];
 const configured=omegaProviderStatus(env).filter(x=>x.configured).map(x=>x.provider).slice(0,2);
 const latest=await db.get('latest/'+asset,{type:'json'});
 const observation=selectOmegaObservation({latest,nowMs,asset});
 let report;
 if(!observation)report={status:'NO_FRESH_MARKET_OBSERVATION',asset,providersConfigured:configured.length,ordersAuthorized:false};
 else if(configured.length<2)report={status:'PROVIDERS_UNCONFIGURED',asset,ticker:observation.marketTicker,providersConfigured:configured.length,ordersAuthorized:false};
 else{
  const result=await runOmegaResearchRound({...observation,nowMs,env,fetchImpl,providers:configured});
  report={status:result.status,asset,ticker:observation.marketTicker,providersConfigured:configured.length,
   providerStatus:result.providerStatus,accepted:result.fusion?.accepted||[],baseline:result.fusion?.marketBaseline??null,
   disagreement:result.fusion?.modelDisagreement??null,observedAtMs:latest.observedAt,recordedAtMs:nowMs,ordersAuthorized:false};
  // Paper execution is separate from research. Never submit real orders.
  const quote=await fetchOmegaLiveQuote({ticker:observation.marketTicker,nowMs,fetchImpl});
  if(quote){
   const paper=await advanceOmegaPaperStored({db,ticker:observation.marketTicker,roundId:observation.roundId,
    signal:omegaPaperSignal(result),quote,nowMs});
   report.paperStatus=paper.status;
  }else report.paperStatus='NO_FRESH_EXECUTABLE_QUOTE';
  // Append-only round snapshot: do not overwrite a forecast after settlement.
  if(result.status==='SHADOW_RESEARCH'&&latest.expiresAt>nowMs){
   const key='omega/predictions/v1/'+observation.marketTicker+'/'+minute;
   if(!await db.get(key,{type:'json'}))await db.setJSON(key,report);
  }
 }
 await db.setJSON('omega/heartbeat',{...report,checkedAt:new Date(nowMs).toISOString(),expectedIntervalSeconds:60,
  coverage:'One rotating asset per minute; not every market every second',realOrdersAuthorized:false});
 return report;
}
export default async()=>{
 try{const db=getStore({name:'bank-trades-market-history',consistency:'strong'});await runOmegaScheduled({db});return new Response(null,{status:204});}
 catch(e){console.error('OMEGA scheduled research failed',String(e).slice(0,160));return new Response(null,{status:500});}
};
export const config={schedule:'* * * * *'};
