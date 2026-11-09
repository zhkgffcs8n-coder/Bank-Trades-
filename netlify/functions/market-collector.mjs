import {randomUUID} from 'node:crypto';
import {auditScalpEntry,earlyScalpSignals} from '../../src/scalp-entry-audit.mjs';
import {normalizeCoinbaseTape,freezePredatorSample,scorePredatorSamples} from '../../src/predator-forward.mjs';
import {hunterEngines,openHunterPaper,monitorHunterPaper,settleHunterPaper} from '../../src/scalp-hunter-paper.mjs';
import {observeScalpHunter,collectComparableRounds,mergeComparableRounds,profileComparableRounds,forecastScalpHunter,scoreScalpHunter} from '../../src/scalp-hunter.mjs';
import {replayScalperExits} from '../../src/scalper-v8-exits.mjs';
import {evaluateScalperV8,parseDepthV8,scalperQuoteFromDepth,scoreScalperV8} from '../../src/scalper-v8.mjs';
import {blobWindow} from '../../src/blob-window.mjs';
import {selectEligibleRound} from '../../src/select-eligible-round.mjs';
import {freezeForecast,scoreFrozenForecast,summarizeForecastResearch} from '../../src/forecast-shadow-learning.mjs';
import {paperSignal} from './lib/shared-paper-signals.mjs';
import {analyzeBrain} from '../../src/primal-shadow-brain.mjs';
import {recentContractSamples} from '../../src/recent-contract-samples.mjs';
import {validCollectorQuote,parseCollectorPrice} from '../../src/collector-quote.mjs';
import {pairedShadow,resolvePairedShadow,originalMomentumShadow} from '../../src/paired-shadow.mjs';
import {initialModel,predict,learn,learningReport,modelValidated,multiWindowMomentum} from '../../src/research-model.mjs';
import {pendingTrainingReview,frozenTrainingTargets,validCommittedTrainingMarker,trainingWriteIntent,claimTrainingIntent} from '../../src/training-provenance.mjs';
import {verifiedFinalizedBinaryOutcome,trustedStoredFinalizedOutcome,SETTLEMENT_VERIFICATION} from '../../src/official-settlement.mjs';
import {edgeResearch} from '../../src/edge-research.mjs';
import {earlyExitAudit} from '../../src/early-exit-audit.mjs';
import {costAwarePairedAudit} from '../../src/cost-aware-paired-audit.mjs';
import {verifiedComparisonEvidence} from '../../src/verified-comparison-evidence.mjs';
import {getStore} from '@netlify/blobs';
import {scanBlobPage} from '../../src/paged-blob-scan.mjs';

const SERIES={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const base='https://api.elections.kalshi.com/trade-api/v2';
const store=()=>getStore({name:'bank-trades-market-history',consistency:'strong'});
const price=parseCollectorPrice;
async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}finally{clearTimeout(t)}}
// Retry only transient series-list failures. Keep settlement reads and the
// per-cycle request budget independent from this retry.
export async function readCollectorSeries(url,{fetchImpl=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 for(let attempt=0;attempt<2;attempt++){
  let delay=400;
  try{
   const response=await fetchImpl(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(4000)});
   if(response.ok){
    const data=await response.json();
    if(!Array.isArray(data?.markets))throw Error('Invalid Kalshi market list');
    return data;
   }
   if(response.status!==429&&response.status<500)return null;
   const retryAfter=response.headers?.get('retry-after');
   if(retryAfter){
    const seconds=Number(retryAfter);
    const retryMs=Number.isFinite(seconds)?seconds*1000:Date.parse(retryAfter)-Date.now();
    if(!Number.isFinite(retryMs)||retryMs>1500)return null;
    delay=Math.max(delay,retryMs);
   }
  }catch{
   // Transport errors and malformed responses get a single retry.
  }
  if(attempt===0)await wait(delay);
 }
 return null;
}
function expiry(m,now){return [m.expected_expiration_time,m.expiration_time,m.close_time].map(Date.parse).filter(x=>Number.isFinite(x)&&x>now).sort((a,b)=>a-b)[0]||null}
const TITAN='titan/v7/';
const titanPrefix=asset=>asset==='BTC'?TITAN:TITAN+asset+'/';
const titanDay=at=>new Date(at).toISOString().slice(0,10);
const titanCost=ask=>Math.ceil(7*ask*(1-ask))/100+.01;

// A frozen per-market settlement challenger built from causal, same-contract quotes.
export function freezeTitan(record,history){
 const {ticker,observedAt:at,expiresAt,yesBid,yesAsk,noBid,noAsk}=record;
 if(!Object.hasOwn(SERIES,record.asset)||!ticker?.startsWith(SERIES[record.asset]+'-')||![at,expiresAt,yesBid,yesAsk,noBid,noAsk].every(Number.isFinite)||
    expiresAt-at<90000||expiresAt-at>900000||yesBid<=0||noBid<=0||yesAsk>=1||noAsk>=1||yesBid>yesAsk||noBid>noAsk)return null;
 const byMinute=new Map(history.filter(row=>row.ticker===ticker&&Number.isFinite(row.t)&&
    Number.isFinite(row.observedAt)&&row.observedAt<at&&at-row.observedAt<=240000&&
    Number.isFinite(row.yesMid)&&row.yesMid>0&&row.yesMid<1).map(row=>[row.t,row]));
 const prior=[...byMinute.values()].sort((a,b)=>a.observedAt-b.observedAt);
 if(prior.length<2)return null;
 const baseline=(yesBid+yesAsk+2-noBid-noAsk)/4;
 const last=prior.at(-1).yesMid,first=prior[0].yesMid;
 if(Math.abs((yesBid+yesAsk)/2-(1-(noBid+noAsk)/2))>.03)return null;
 const momentum=(baseline-first)*.6+(baseline-last)*.4;
 const swing=Math.max(...prior.map(r=>r.yesMid),baseline)-Math.min(...prior.map(r=>r.yesMid),baseline);
 const uncertainty=Math.min(.04,swing*.15);
 const probability=Math.max(.01,Math.min(.99,baseline+Math.max(-.12,Math.min(.12,momentum*.45))));
 const upEdge=probability-yesAsk-titanCost(yesAsk)-uncertainty;
 const downEdge=1-probability-noAsk-titanCost(noAsk)-uncertainty;
 const edge=Math.max(upEdge,downEdge),spread=Math.max(yesAsk-yesBid,noAsk-noBid);
 const decision=spread>.030001||edge<.02?'SKIP':upEdge>=downEdge?'UP':'DOWN';
 const ask=decision==='UP'?yesAsk:decision==='DOWN'?noAsk:null;
 return {ticker,at,expiresAt,baseline,probability,uncertainty,spread,edge,decision,ask,cost:ask===null?null:titanCost(ask),
  reason:spread>.030001?'WIDE_SPREAD':edge<.02?'INSUFFICIENT_COST_ADJUSTED_EDGE':'QUALIFIED_SHADOW',status:'PENDING'};
}
export function scoreTitan(row,official,now){
 if(row?.status!=='PENDING'||!trustedStoredFinalizedOutcome(official,row.ticker)||
    ![now,row.at,row.expiresAt,row.baseline,row.probability].every(Number.isFinite)||
    row.at>=row.expiresAt||now<row.expiresAt||!['UP','DOWN','SKIP'].includes(row.decision)||
    (row.decision!=='SKIP'&&![row.ask,row.cost].every(Number.isFinite)))return null;
 const labeledAt=official.labeledAt,settledAt=Date.parse(official.settledAt);
 if(!Number.isFinite(labeledAt)||labeledAt<row.expiresAt||labeledAt>now||
    (Number.isFinite(settledAt)&&(settledAt<row.expiresAt||settledAt>now)))return null;
 const outcome=official.result==='yes'?1:0;
 const traded=row.decision!=='SKIP';
 const won=traded?(row.decision==='UP')===Boolean(outcome):null;
 return {...row,status:'SCORED',resolvedAt:now,outcome,won,verification:SETTLEMENT_VERIFICATION,
  baselineBrier:(row.baseline-outcome)**2,brier:(row.probability-outcome)**2,
  simulatedNetPnl:traded?Number(((won?1:0)-row.ask-row.cost).toFixed(6)):0};
}
function titanReport(rows,now,truncated){
 const scored=rows.filter(row=>row.status==='SCORED'&&row.verification===SETTLEMENT_VERIFICATION)
  .sort((a,b)=>a.at-b.at);
 const trades=scored.filter(row=>row.decision!=='SKIP');
 let net=0,peak=0,drawdown=0,grossWin=0,grossLoss=0;
 for(const row of trades){
  const pnl=row.simulatedNetPnl;
  net+=pnl;peak=Math.max(peak,net);drawdown=Math.max(drawdown,peak-net);
  grossWin+=Math.max(0,pnl);grossLoss+=Math.max(0,-pnl);
 }
 const n=scored.length,wins=trades.filter(row=>row.simulatedNetPnl>0).length;
 return {at:now,mode:'SETTLEMENT_SHADOW',observed:rows.length,scored:n,pending:rows.length-n,truncated,
  trades:trades.length,skipped:n-trades.length,wins,winRate:trades.length?wins/trades.length:null,
  simulatedNetPnl:net,maxDrawdown:drawdown,profitFactor:grossLoss?grossWin/grossLoss:null,
  averageNet:trades.length?net/trades.length:null,
  brier:n?scored.reduce((sum,r)=>sum+r.brier,0)/n:null,
  marketBrier:n?scored.reduce((sum,r)=>sum+r.baselineBrier,0)/n:null,
  latest:rows.reduce((latest,row)=>!latest||row.at>latest.at?row:latest,null),promoted:false,
  note:'UTC today and yesterday, paired versus frozen market probability. One hypothetical contract held to settlement. Estimated costs and quote-based entries; no exchange fills.'};
}

export default async()=>{
 const db=store(),now=Date.now(),bucket=Math.floor(now/60000)*60000;
 const collection={sampled:new Set(),newPredictions:0,errors:new Set(),trainingSucceeded:false,trainingError:null,trainingReviewCount:0,settlementFailures:0,researchFailures:0,researchErrors:[]};
 const researchFailure=(scope,error,asset=null)=>{
  collection.researchFailures++;
  if(collection.researchErrors.length<16)collection.researchErrors.push({scope,asset,error:String(error).slice(0,160)});
 };
 const previousHeartbeat=await db.get('collector/heartbeat',{type:'json'});
 await db.setJSON('collector/heartbeat',{...previousHeartbeat,startedAt:now,status:'RUNNING',mode:'PAPER RESEARCH',expectedIntervalSeconds:60});
 await Promise.all(Object.entries(SERIES).map(async([asset,series])=>{try{
  const d=await readCollectorSeries(base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'100'}));
  if(!d)throw Error('Kalshi series list unavailable');
  const markets=(d.markets||[]).map(m=>({...m,_expiry:expiry(m,now)})).filter(m=>m._expiry&&m._expiry-now<=16*60000).sort((a,b)=>a._expiry-b._expiry);
  const selection=selectEligibleRound(markets,now);
  if(!selection){
   await db.setJSON('scalp-hunter/diagnostics/'+asset,{at:Date.now(),stage:markets.length?'NO_EXECUTABLE_CONTRACT':'NO_OPEN_CONTRACT'});
   await db.setJSON('telemetry/'+asset,{at:Date.now(),asset,valid:false,error:markets.length?'No eligible contract with executable binary quote':'No verified open contract'});return;}
  const {market:m,yesBid,yesAsk,noBid,noAsk}=selection;
  const record={asset,ticker:m.ticker,t:bucket,observedAt:Date.now(),expiresAt:m._expiry,yesBid,yesAsk,noBid,noAsk,yesMid:(yesBid+yesAsk)/2,spread:Math.max(yesAsk-yesBid,noAsk-noBid),source:'Kalshi public API scheduled sample'};
  // Include the contract ticker in the immutable sample key. Two contracts
  // observed in the same minute must not silently share one training sample.
  const sampleKey='samples/'+asset+'/'+bucket+'/'+m.ticker;
  const existing=await db.get(sampleKey,{type:'json'});
  // One immutable training sample per asset/minute. A fast UI refresh is not new training evidence.
  if(!existing)await db.setJSON(sampleKey,record);
  await db.setJSON('latest/'+asset,record);
  // Maintain a bounded per-asset rolling snapshot; signal readers avoid expensive blob listings.
  let recent=[];
  try{
   const key='recent/'+asset;
   const prior=await db.get(key,{type:'json'});
   recent=(Array.isArray(prior)?prior:[]).filter(x=>x?.ticker===m.ticker&&Number.isFinite(x.t)&&x.t>=now-12*60000&&x.t!==record.t);
   // Preserve the first immutable observation in each minute bucket.
   // Repeated scheduled invocations must not silently rewrite historical momentum.
   recent.push(existing&&existing.ticker===m.ticker?existing:record);
   await db.setJSON(key,recent.slice(-12));
  }catch(e){researchFailure('recent-snapshot',e,asset);console.warn('Recent snapshot update failed',asset,String(e));}
  await db.setJSON('telemetry/'+asset,{at:now,asset,ticker:m.ticker,sourceAgeMs:Date.now()-record.observedAt,sampleDuplicate:!!existing,quoteSpread:record.spread,valid:true,multiWindowResearch:multiWindowMomentum(recent,now)});
  collection.sampled.add(asset);
  if(!existing){
   try{
    const v8Key='scalper-v8/pending/'+m.ticker;
    const pending=await db.get(v8Key,{type:'json'});
    const candidate=evaluateScalperV8(record,recent);
    const trackExit=pending&&['A','B','C'].some(name=>pending.engines[name].decision!=='SKIP');
    const paperKey='scalp-hunter/paper/open/'+m.ticker;
    const open=await db.get(paperKey,{type:'json'});
    const diagnosticsKey='scalp-hunter/diagnostics/'+asset;
    if(!candidate)await db.setJSON(diagnosticsKey,{at:Date.now(),ticker:m.ticker,stage:'WAIT_SAME_ROUND_HISTORY'});
    if(asset==='BTC'||trackExit||candidate||Object.values(open||{}).some(position=>!position.closedAt)){
     const tapeRead=fetch('https://api.exchange.coinbase.com/products/'+asset+'-USD/trades?limit=100',
      {signal:AbortSignal.timeout(1600)}).then(r=>r.ok?r.json():null).catch(()=>null);
     let depth=null,depthStatus='ORDERBOOK_UNAVAILABLE';
     try{
      const response=await fetch(base+'/markets/'+encodeURIComponent(m.ticker)+'/orderbook?depth=1',
       {signal:AbortSignal.timeout(1600)});
      depthStatus='ORDERBOOK_HTTP_'+response.status;
      if(response.ok){
       depth=parseDepthV8(await response.json(),m.ticker,Date.now());
       depthStatus='INVALID_OR_ONE_SIDED_BOOK';
      }
     }catch{} // Quotes without depth cannot be used to simulate an early fill.
     const bookQuote=scalperQuoteFromDepth(record,depth);
     const payload=await tapeRead;
     if(asset==='BTC'){
      try{
       const observedAt=Date.now();
       const observation=freezePredatorSample({ticker:m.ticker,now:observedAt,bookAt:depth?.at,
        remaining:(record.expiresAt-observedAt)/1000,expiresAt:record.expiresAt,
        yes:bookQuote?depth.yes:null,no:bookQuote?depth.no:null,trades:normalizeCoinbaseTape(payload,observedAt)});
       if(bookQuote&&!Array.isArray(payload))observation.stage='COINBASE_UNAVAILABLE';
       const recentKey='predator-v11/recent';
       const previous=await db.get(recentKey,{type:'json'})||[];
       await db.setJSON('predator-v11/samples/'+m.ticker+'/'+bucket,observation,{onlyIfNew:true});
       for(const result of scorePredatorSamples(previous,observation)){
        await db.setJSON('predator-v11/results/'+result.ticker+'/'+result.at+'/'+result.horizon,result,{onlyIfNew:true});
       }
       await db.setJSON(recentKey,[...previous.filter(row=>row.ticker===m.ticker&&row.at<observedAt),observation].slice(-4));
       await db.setJSON('predator-v11/latest',observation);
      }catch(e){researchFailure('predator-v11',e,asset)}
     }
     if(depth&&!bookQuote)depthStatus='BOOK_STALE_OR_CROSSED';
     const snapshot=bookQuote?evaluateScalperV8(bookQuote,recent.filter(row=>row.t!==record.t),depth):candidate;
     if(bookQuote){

      if(open){
       for(const [name,position] of Object.entries(open)){
        if(position.closedAt)continue;
        open[name]=monitorHunterPaper(position,depth);
        if(open[name].closedAt)await db.setJSON('scalp-hunter/paper/closed/'+m.ticker+'/'+name,open[name],{onlyIfNew:true});
       }
       await db.setJSON('scalp-hunter/paper/open/'+m.ticker,open);
      }
     }
     if(candidate&&(!depth||snapshot?.at!==depth.at))
      await db.setJSON(diagnosticsKey,{at:Date.now(),ticker:m.ticker,stage:bookQuote?'WAIT_BOOK_HISTORY':depthStatus});
     if(bookQuote&&snapshot?.imbalance!==null&&snapshot?.at===depth.at){
      const trades=normalizeCoinbaseTape(payload,snapshot.at).filter(row=>row.time>=snapshot.at-3000);
      const volume=trades.reduce((sum,row)=>sum+Math.abs(row.flow),0);
      const flow=trades.length>=4&&volume>0?trades.reduce((sum,row)=>sum+row.flow,0)/volume:null;
      snapshot.early=earlyScalpSignals(snapshot,flow);
      snapshot.entryTelemetry={flow,spotTrades:trades.length,spotAgeMs:trades.length?snapshot.at-trades.at(-1).time:null,
       spread:snapshot.spread,imbalance:snapshot.imbalance,velocity:snapshot.velocity,
       acceleration:snapshot.acceleration,regime:snapshot.regime,remainingMs:snapshot.expiresAt-snapshot.at};
      const tapeKey='scalp-hunter/tape/'+asset;
      const tape=await db.get(tapeKey,{type:'json'})||[];
      const archiveKey='scalp-hunter/comparable-rounds/v1/'+asset;
      const saved=await db.get(archiveKey,{type:'json'});
      const history=saved?tape.filter(row=>row.at>=snapshot.at-480000):tape;
      const archive=mergeComparableRounds(saved?.cells||{},collectComparableRounds(history,snapshot.at),snapshot.at);
      const profile=profileComparableRounds(archive);
      await db.setJSON(archiveKey,{at:snapshot.at,cells:archive});
      const checks={},experimental={};
      const ideas=forecastScalpHunter(snapshot,depth,profile,checks,experimental);
      if(Object.keys(experimental).length){
       await db.setJSON('scalp-hunter/experimental/predictions/'+m.ticker+'/'+bucket,
        {asset,ticker:m.ticker,at:snapshot.at,experimental},{onlyIfNew:true});
      }
      for(const outcome of scoreScalpHunter(tape,depth,'experimental')){
       await db.setJSON('scalp-hunter/experimental/outcomes/'+outcome.ticker+'/'+outcome.entryAt+'/'+outcome.name,
        outcome,{onlyIfNew:true});
      }
      const assessment={at:snapshot.at,ticker:m.ticker,stage:'EVALUATED',
       samples:tape.length,archiveRows:Object.values(archive).reduce((sum,rows)=>sum+rows.length,0),
       experimental:Object.keys(experimental),profileCells:Object.keys(profile).length,
       matureCells:Object.values(profile).filter(cell=>cell.n>=12).length,qualified:hunterEngines.filter(name=>ideas[name]),checks};
      await db.setJSON(diagnosticsKey,assessment);
      await db.setJSON('scalp-hunter/assessments/'+m.ticker+'/'+bucket,assessment,{onlyIfNew:true});
      const positions=open||{};
      if(Object.values(ideas).some(Boolean)){
       for(const name of hunterEngines){
        if(ideas[name]?.mode==='SHADOW_ONLY'&&ideas[name].sampleSize>=12&&!positions[name]){
         const position=openHunterPaper(name,snapshot,ideas[name],depth);
         if(position)positions[name]=position;
        }
       }
       await db.setJSON(paperKey,positions);
       await db.setJSON('scalp-hunter/predictions/'+m.ticker+'/'+bucket,
        {asset,ticker:m.ticker,at:snapshot.at,ideas},{onlyIfNew:true});
      }
      for(const outcome of scoreScalpHunter(tape,depth)){
       await db.setJSON('scalp-hunter/outcomes/'+outcome.ticker+'/'+outcome.entryAt+'/'+outcome.name,
        outcome,{onlyIfNew:true});
      }
      const auditKey='scalp-hunter/entry-audit/v15/'+m.ticker;
      const priorAudit=await db.get(auditKey,{type:'json'});
      await db.setJSON(auditKey,auditScalpEntry(priorAudit,snapshot,depth,checks,positions));
      await db.setJSON(tapeKey,observeScalpHunter(tape,snapshot,depth,ideas,experimental));
      await db.setJSON('scalp-hunter/latest/'+asset,{ticker:m.ticker,at:snapshot.at,ideas,experimental,positions});
     }
     if(!pending&&snapshot&&!await db.get('scalper-v8/resolved/'+m.ticker,{type:'json'})){
      await db.setJSON(v8Key,snapshot,{onlyIfNew:true});
     }else if(trackExit&&bookQuote&&depth.at<pending.expiresAt){
      await db.setJSON('scalper-v8/depth/'+m.ticker+'/'+bucket,depth,{onlyIfNew:true});
     }
    }
   }catch(e){researchFailure('scalper-v8-freeze',e,asset)}
   try{
    const titan=freezeTitan(record,recent);
    if(titan)await db.setJSON(titanPrefix(asset)+titanDay(titan.at)+'/'+m.ticker,titan,{onlyIfNew:true});
   }catch(e){researchFailure('titan-freeze',e,asset)}
  }
  // Freeze the first forecast before settlement. Never overwrite on later flips.
  try{
   const key='forecast-shadow/v1/'+m.ticker;
   if(!await db.get(key,{type:'json'})){
    const frozen=freezeForecast({ticker:m.ticker,asset,at:record.observedAt,expiresAt:m._expiry,yesBid,yesAsk,noBid,noAsk});
    if(frozen)await db.setJSON(key,frozen);
   }
  }catch(e){researchFailure('forecast-freeze',e,asset)}
  // One immutable late-window observation per contract, scored independently
  // by A and B on the same fetched quote. Research only, never an order.
  try{
   if(m._expiry-now<=420000&&m._expiry-now>180000){
    const key='paired-shadow/pending/v1/'+m.ticker;
    const resolvedKey='paired-shadow/resolved/v1/'+m.ticker;
    if(!await db.get(key,{type:'json'})&&!await db.get(resolvedKey,{type:'json'})){
     const sameContract=recentContractSamples(recent,m.ticker,now);
     // Freeze only after enough distinct same-contract history exists for Engine B.
     // An early WAIT would otherwise become an immutable, uninformative pair.
     const distinct=new Set(sameContract.map(r=>r.t));
     const span=sameContract.length?sameContract.at(-1).t-sameContract[0].t:0;
     if(distinct.size>=4&&span>=180000){
      await db.setJSON(key,pairedShadow(m,sameContract,now));
     }
    }
   }
  }catch(e){researchFailure('paired-shadow-snapshot',e,asset);console.warn('Paired A/B shadow snapshot unavailable',asset,String(e))}
  // Independently journal one Primal research decision per contract, including abstentions.
  // Never promote this shadow output into live/paper execution without prospective proof.
  try{
   const key='primal-brain/shadow/v1/'+m.ticker;
   if(!await db.get(key,{type:'json'})){
    const snapshot=recentContractSamples(recent,m.ticker,now);
    // Do not permanently freeze an early insufficient-history WAIT.
    // Evaluate at the first adequately sampled opportunity, or in the late window
    // once at least four distinct same-contract minutes have been observed.
    const distinct=new Set(snapshot.map(r=>r.t));
    const span=snapshot.length?snapshot.at(-1).t-snapshot[0].t:0;
    if(distinct.size>=4&&span>=180000&&m._expiry-now<=540000&&m._expiry-now>180000){
     await db.setJSON(key,{...analyzeBrain(m,snapshot,now),asset,expiresAt:m._expiry,status:'PENDING'});
    }
   }
  }catch(e){researchFailure('primal-shadow-snapshot',e,asset);console.warn('Primal shadow brain observation unavailable',asset,String(e))}
  // Parallel shadow comparison: immutable per-market entry decisions; never place orders.
  try{
   const comparisonKey='comparison/v1/'+m.ticker;
   if(!await db.get(comparisonKey,{type:'json'})){
    // Use the same fresh contract snapshot as the live signal path. Blob list's
    // first 30 historical keys are not the latest 30 after the archive grows.
    const records=recentContractSamples(recent,m.ticker,now);
    // Research-only Original A remains measurable even while unvalidated
    // live/paper BUY recommendations correctly stay paused. Do not route this
    // shadow hypothesis to an order, position, or user-facing entry alert.
    const candidate=originalMomentumShadow(m,records,now);
    if(candidate.shadowOnly===true&&['BUY UP','BUY DOWN'].includes(candidate.action)){
     const a={action:candidate.action,side:candidate.side,ask:candidate.ask,score:candidate.score};
     const b=Number(candidate.score)>=75&&Number(candidate.ask)<=65?{...a}:{action:'WAIT',reason:'Upgraded conservative quality gate'};
     await db.setJSON(comparisonKey,{ticker:m.ticker,asset,at:now,expiresAt:m._expiry,engines:{original:a,upgraded:b},status:'PENDING',version:1,mode:'SHADOW_ONLY',authorized:false});
    }
   }
  }catch(e){researchFailure('comparison-snapshot',e,asset);console.warn('Shadow comparison collection failed',asset,String(e))}

  // One immutable, explicitly hypothetical paper direction per contract round.
  // Record both sides and their entry costs even if the live recommendation is WAIT.
  try{
   const key='round-paper/v1/'+m.ticker;
   if(!await db.get(key,{type:'json'})){
    const baseline=Math.max(.01,Math.min(.99,record.yesMid));
    const model=await db.get('training/model/'+asset,{type:'json'})||await db.get('training/model',{type:'json'})||initialModel();
    const features=[Math.max(-1,Math.min(1,(baseline-.5)*2)),Math.max(-1,Math.min(1,record.spread*10)),Math.max(-1,Math.min(1,(m._expiry-now)/900000)),Math.max(-1,Math.min(1,yesBid-noBid))];
    const probability=predict(model,baseline,features);
    const edgeShadow=edgeResearch({probability,yesAsk,noAsk,yesBid,noBid,quoteAgeMs:Math.max(0,Date.now()-record.observedAt),fee:0,slippage:0,minEdge:.04});
    const upCost=yesAsk,downCost=noAsk;
    const direction=probability>=0.5?'UP':'DOWN';
    await db.setJSON(key,{ticker:m.ticker,asset,at:now,expiresAt:m._expiry,source:'hypothetical paper-only round forecast',direction,probability,edgeShadow,modelVersion:model.version||null,up:{ask:upCost,maxLoss:upCost,winProfit:1-upCost,expectedValue:probability-upCost},down:{ask:downCost,maxLoss:downCost,winProfit:1-downCost,expectedValue:(1-probability)-downCost},status:'PENDING',feeExcluded:true});
   }
  }catch(e){researchFailure('round-forecast',e,asset);console.warn('Round paper forecast failed',asset,String(e))}
  // Forward-only, read-only audit of the already frozen round forecast.
  // Never pick an entry retrospectively or issue an order.
  try{
   const frozen=await db.get('round-paper/v1/'+m.ticker,{type:'json'});
   if(frozen&&Number.isFinite(frozen.at)&&['UP','DOWN'].includes(frozen.direction)){
    const side=frozen.direction==='UP'?'yes':'no';
    const quotePath=recentContractSamples(recent,m.ticker,now).map(q=>({
     t:q.observedAt,ask:q[side+'Ask'],bid:q[side+'Bid']
    }));
    const first=quotePath.find(q=>q.t>=frozen.at&&q.t<=frozen.at+65000);
    const audit=earlyExitAudit([{id:m.ticker,signalAt:first?.t,expiresAt:m._expiry,quotes:quotePath}]);
    await db.setJSON('early-exit/shadow/current/'+m.ticker,{
     at:Date.now(),asset,ticker:m.ticker,frozenPredictionAt:frozen.at,
     direction:frozen.direction,mode:'SHADOW_ONLY',audit,
     note:'Research-only provisional quote path; incomplete until round closes. No actual trade or guaranteed fill.'
    });
   }
  }catch(e){researchFailure('early-exit-shadow',e,asset);console.warn('Early-exit shadow audit unavailable',asset,String(e))}
  const pendingKey='pending/'+m.ticker;
  if(!await db.get(pendingKey,{type:'json'})){
   const assetModelForPrediction=await db.get('training/model/'+asset,{type:'json'})||initialModel();
   const globalModelForPrediction=await db.get('training/model',{type:'json'})||initialModel();
   const model=assetModelForPrediction;
   const baseline=Math.max(.02,Math.min(.98,record.yesMid));
   const features=[Math.max(-1,Math.min(1,(record.yesMid-.5)*2)),Math.max(-1,Math.min(1,record.spread*10)),Math.max(-1,Math.min(1,(m._expiry-now)/900000)),Math.max(-1,Math.min(1,yesBid-noBid))];
   await db.setJSON(pendingKey,{ticker:m.ticker,asset,expiresAt:m._expiry,at:now,features,baseline,prediction:predict(model,baseline,features),assetPrediction:predict(assetModelForPrediction,baseline,features),globalPrediction:predict(globalModelForPrediction,baseline,features)});
   collection.newPredictions++;
  }
 }catch(e){collection.errors.add(asset);console.error('Collector asset failed',asset,String(e));try{await db.setJSON('telemetry/'+asset,{at:Date.now(),asset,valid:false,error:String(e).slice(0,240)})}catch(writeError){console.error('Collector telemetry failed',asset,String(writeError))}}}));
 // These counters must remain in scope for the final heartbeat, even if training fails.
 let trainedThisRun=0;
 const trainedByAsset={};
 // Track every sampled contract, not just the latest contract for each asset.
 // This prevents a new 15-minute round from hiding the previous round's settlement.
 try{
  // Process bounded, resumable settlement pages to avoid exceeding scheduled
  // function runtime or starving new contracts behind older pending keys.
  let model=await db.get('training/model',{type:'json'})||initialModel();
  const assetModels={};
  await scanBlobPage(db,{prefix:'pending/',cursorKey:'scan-cursors/pending-settlements-v1',limit:4},async item=>{
   const rec=await db.get(item.key,{type:'json'});
   if(!rec?.ticker||!Number.isFinite(rec.expiresAt)||rec.expiresAt>now-60000)return;
   const labelKey='outcomes/'+rec.ticker;
   const cached=await db.get(labelKey,{type:'json'});
   // Reverify legacy labels instead of discarding pending records on sight.
   const trustedCached=trustedStoredFinalizedOutcome(cached,rec.ticker);
   if(trustedCached){
    // A previously finalized outcome must never silently lose its pending prediction.
    // The historical ledger does not prove whether its gradient was already applied.
    // Quarantine for reconciliation rather than replaying an unsafe duplicate update.
    const learnedMarker=await db.get('training/learned/v1/'+rec.ticker,{type:'json'});
    const priorIntent=await db.get('training/intent/v1/'+rec.ticker,{type:'json'});
    if(validCommittedTrainingMarker(learnedMarker,rec,trustedCached,priorIntent)){
     await db.delete('pending/'+rec.ticker);return;
    }
    await db.setJSON('training-review/v1/'+rec.ticker,pendingTrainingReview(rec,trustedCached,learnedMarker?'CONFLICTING_LEARNED_MARKER':priorIntent?'INTERRUPTED_TRAINING_INTENT':'CACHED_FINALIZED_OUTCOME',now));
    collection.trainingReviewCount++;
    await db.delete('pending/'+rec.ticker);return;
   }
   try{
    const d=await get(base+'/markets/'+encodeURIComponent(rec.ticker)),m=d.market;
    const result=verifiedFinalizedBinaryOutcome(m,rec.ticker);
    if(result){
     await db.setJSON(labelKey,{ticker:rec.ticker,asset:rec.asset,result,settledAt:m.settlement_ts||null,labeledAt:now,source:'Kalshi finalized market record',verification:SETTLEMENT_VERIFICATION});
     // Existing legacy labels may already have trained weights. Never count them twice.
     const targets=frozenTrainingTargets(rec);
     const learnedMarker=await db.get('training/learned/v1/'+rec.ticker,{type:'json'});
     const priorIntent=await db.get('training/intent/v1/'+rec.ticker,{type:'json'});
     // A missing cached label is not proof this observation was never learned.
     // Preserve valid committed evidence; quarantine contradictory or partial state.
     if(validCommittedTrainingMarker(learnedMarker,rec,result,priorIntent)){
      await db.delete('pending/'+rec.ticker);return;
     }
     if(!cached&&!learnedMarker&&!priorIntent&&(targets.global||targets.asset)){
      const assetKey=String(rec.asset||'UNKNOWN');
      const assetModel=assetModels[assetKey]||await db.get('training/model/'+assetKey,{type:'json'})||initialModel();
      // Claim the per-contract write-ahead intent atomically before touching
      // model weights. A concurrent collector that loses this conditional
      // create must not train or delete the winner's pending record.
      // Separate model keys still require reconciliation after interruptions.
      const intent=trainingWriteIntent(rec,result,targets,model,assetModel,now);
      const claimId=randomUUID();
      const claimed=await claimTrainingIntent(db,'training/intent/v1/'+rec.ticker,intent,claimId);
      if(!claimed)return;
      // The global model must be scored against its OWN prediction frozen
      // before settlement, not the separate asset model's prediction.
      if(targets.global){
       model=learn(model,{...rec,prediction:rec.globalPrediction},result==='yes'?1:0);
       await db.setJSON('training/model',model);
      }
      // Do not score an asset model using a global fallback forecast.
      // Only an asset-specific prediction frozen before settlement is valid.
      if(targets.asset){
       assetModels[assetKey]=learn(assetModel,{...rec,prediction:rec.assetPrediction},result==='yes'?1:0);
      }else{
       assetModels[assetKey]=assetModel;
      }
      if(targets.asset)await db.setJSON('training/model/'+assetKey,assetModels[assetKey]);
      // Persist idempotency evidence after both models have been updated.
      await db.setJSON('training/learned/v1/'+rec.ticker,{version:2,ticker:rec.ticker,result,asset:assetKey,learnedAt:Date.now(),observationDigest:intent.observationDigest,intentStartedAt:intent.startedAt,claimId,globalUpdated:targets.global,assetUpdated:targets.asset,globalCount:model.count,assetCount:assetModels[assetKey].count});
      // Count only fully committed training markers, not interrupted partial writes.
      trainedThisRun++;
      trainedByAsset[assetKey]=(trainedByAsset[assetKey]||0)+1;

     }else{
      await db.setJSON('training-review/v1/'+rec.ticker,pendingTrainingReview(rec,result,learnedMarker?'CONFLICTING_LEARNED_MARKER':priorIntent?'INTERRUPTED_TRAINING_INTENT':cached?'PREEXISTING_UNTRUSTED_LABEL':'INVALID_PREDICTION',now));
      collection.trainingReviewCount++;
     }
     await db.delete('pending/'+rec.ticker);
    }
   }catch(e){collection.settlementFailures++;console.warn('Pending settlement lookup unavailable',rec.ticker,String(e))}
  });
  // Resolve frozen forecasts only against officially verified finalized outcomes.
  try{
   await scanBlobPage(db,{prefix:'forecast-shadow/v1/',cursorKey:'scan-cursors/forecast-shadow-v1',limit:8},async item=>{
    const row=await db.get(item.key,{type:'json'});
    if(row?.status!=='PENDING'||row.expiresAt>now-60000)return;
    const official=await db.get('outcomes/'+row.ticker,{type:'json'});
    if(!trustedStoredFinalizedOutcome(official,row.ticker))return;
    const scored=scoreFrozenForecast(row,official.result,now);
    if(scored)await db.setJSON(item.key,{...scored,outcomeVerification:SETTLEMENT_VERIFICATION});
   });
  }catch(e){researchFailure('forecast-settlement-scoring',e)}
  // Bounded verified forecast report. Never imply complete history if paginated.
  try{
   const page=await blobWindow(db,{prefix:'forecast-shadow/v1/',limit:40});
   const rows=(await Promise.all(page.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
   const alternatives=Object.keys(SERIES).filter(asset=>asset!=='BTC');
   const updateAsset=alternatives[Math.floor(now/60000)%alternatives.length];
   const titanReports=Object.fromEntries(await Promise.all(Object.keys(SERIES).map(async asset=>{
    const prefix=titanPrefix(asset);
    let titan=null;
    try{
    titan=await db.get(prefix+'report',{type:'json'});
    if((asset==='BTC'||asset===updateAsset)&&(!titan||now-titan.at>=300000)){
    const pages=await Promise.all([now,now-86400000].map(at=>blobWindow(db,{prefix:prefix+titanDay(at)+'/',limit:100})));
    const titanRows=(await Promise.all(pages.flatMap(page=>page.blobs).map(async blob=>{
     const row=await db.get(blob.key,{type:'json'});
     if(row?.status!=='PENDING'||now<row.expiresAt+60000)return row;
     const official=await db.get('outcomes/'+row.ticker,{type:'json'});
     const scored=scoreTitan(row,official,now);
     if(!scored)return row;
     await db.setJSON(blob.key,scored);
     return scored;
    }))).filter(Boolean);
     titan=titanReport(titanRows,now,pages.some(page=>!!page.cursor));
     await db.setJSON(prefix+'report',titan);
    }
    }catch(e){researchFailure('titan-report',e,asset)}
    return [asset,titan];
   })));
   await db.setJSON('forecast-shadow/report-v1',{at:now,...summarizeForecastResearch(rows,{truncated:!!page.cursor}),titan:titanReports.BTC,titanReports});
  }catch(e){researchFailure('forecast-summary',e)}
  try{
   await scanBlobPage(db,{prefix:'scalper-v8/pending/',cursorKey:'scan-cursors/scalper-v8',limit:16},async blob=>{
    const row=await db.get(blob.key,{type:'json'});
    if(!row||row.expiresAt>now)return;
    const resolved=scoreScalperV8(row,await db.get('outcomes/'+row.ticker,{type:'json'}),now);
    if(!resolved)return;
    if(['A','B','C'].some(name=>resolved.engines[name].won!==null)){
     const page=await blobWindow(db,{prefix:'scalper-v8/depth/'+row.ticker+'/',limit:20});
     if(!page.cursor){
      const quotes=await Promise.all(page.blobs.map(blob=>db.get(blob.key,{type:'json'})));
      resolved.exitReplay=replayScalperExits(resolved,quotes);
     }
    }
    await db.setJSON('scalper-v8/resolved/'+row.ticker,resolved,{onlyIfNew:true});
    await db.delete(blob.key);
   });
  }catch(e){researchFailure('scalper-v8-scoring',e)}
  try{
   await scanBlobPage(db,{prefix:'scalp-hunter/paper/open/',cursorKey:'scan-cursors/scalp-hunter-paper',limit:16},async blob=>{
    const positions=await db.get(blob.key,{type:'json'});
    if(!positions)return;
    const rows=Object.values(positions);
    if(!rows.length||rows.some(row=>row.expiresAt>now))return;
    const label=await db.get('outcomes/'+rows[0].ticker,{type:'json'});
    for(const row of rows){
     const closed=row.closedAt?row:settleHunterPaper(row,label,now);
     if(!closed)return;
     await db.setJSON('scalp-hunter/paper/closed/'+row.ticker+'/'+row.name,closed,{onlyIfNew:true});
    }
    await db.delete(blob.key);
   });
  }catch(e){researchFailure('scalp-hunter-paper-settlement',e)}
  // Label the first scheduled signal decision per contract against official outcomes.
  // WAIT is evaluated counterfactually, never counted as an executed trade.
  try{
   // Advance through bounded pages; old unresolved rows cannot starve new contracts.
   await scanBlobPage(db,{prefix:'signal-observations/v1/',cursorKey:'scan-cursors/signal-observations-v1',limit:8},async item=>{
    const rec=await db.get(item.key,{type:'json'});
    if(!rec||rec.status!=='PENDING'||rec.expiresAt>now-60000)return;
    const outcome=await db.get('outcomes/'+rec.ticker,{type:'json'});
    if(!trustedStoredFinalizedOutcome(outcome,rec.ticker))return;
    const yesWon=outcome.result==='yes';
    rec.status='RESOLVED';rec.outcome=outcome.result;rec.resolvedAt=now;
    rec.counterfactual={
     upPnl:Number(((yesWon?100:0)-Number(rec.quote.yesAsk)).toFixed(2)),
     downPnl:Number(((yesWon?0:100)-Number(rec.quote.noAsk)).toFixed(2)),
     unit:'cents per hypothetical contract; no fees, slippage or fills'
    };
    await db.setJSON(item.key,rec);
   });
   const listing=await blobWindow(db,{prefix:'signal-observations/v1/',limit:40});
   const observations=(await Promise.all(listing.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
   const resolved=observations.filter(x=>x.status==='RESOLVED'&&x.counterfactual);
   const summary={at:now,version:1,observed:observations.length,resolved:resolved.length,pending:observations.length-resolved.length,truncated:Boolean(listing.cursor),scope:listing.cursor?'FIRST_PAGE_ONLY':'ALL_OBSERVED',
    qualified:{n:0,wins:0,losses:0,pnlCents:0},abstained:{n:0,avoidedLosses:0,missedWins:0},
    note:'Retrospective first-observation comparison only; no actual fills and no causal proof of strategy improvement.'};
   for(const rec of resolved){
    if(rec.decision==='QUALIFIED'){
     const pnl=rec.action==='BUY UP'?rec.counterfactual.upPnl:rec.counterfactual.downPnl;
     summary.qualified.n++;summary.qualified.wins+=pnl>0?1:0;summary.qualified.losses+=pnl<=0?1:0;summary.qualified.pnlCents+=pnl;
    }else{
     summary.abstained.n++;
     // Counterfactual is the cheaper quoted side; it is not a model prediction.
     const hypothetical=Math.min(Number(rec.quote.yesAsk),Number(rec.quote.noAsk))===Number(rec.quote.yesAsk)?rec.counterfactual.upPnl:rec.counterfactual.downPnl;
     summary.abstained.avoidedLosses+=hypothetical<=0?1:0;
     summary.abstained.missedWins+=hypothetical>0?1:0;
    }
   }
   summary.qualified.pnlCents=Number(summary.qualified.pnlCents.toFixed(2));
   await db.setJSON('signal-observations/report-v1',summary);
  }catch(e){researchFailure('signal-outcome-scoring',e);console.warn('Signal outcome comparison unavailable',String(e))}
  // Score the shadow brain only after official settlement. Never rewrite its earlier decision.
  try{
   await scanBlobPage(db,{prefix:'primal-brain/shadow/v1/',cursorKey:'scan-cursors/primal-brain-v1',limit:8},async item=>{
    const row=await db.get(item.key,{type:'json'});
    if(!row||row.status!=='PENDING'||row.expiresAt>now-60000)return;
    const outcome=await db.get('outcomes/'+row.ticker,{type:'json'});
    if(!trustedStoredFinalizedOutcome(outcome,row.ticker))return;
    const direction=row.candidateDirection;
    const cost=Number(row.metrics?.ask);
    const evaluated=row.eligible===true&&['up','down'].includes(direction)&&Number.isFinite(cost)&&cost>0&&cost<1;
    const correct=evaluated?((direction==='up')===(outcome.result==='yes')):null;
    row.status='RESOLVED';row.resolvedAt=now;row.outcome=outcome.result;
    row.evaluation={evaluated,correct,grossPnl:evaluated?Number(((correct?1:0)-cost).toFixed(4)):null,netPnl:null,feeExcluded:true,source:'Official finalized binary outcome; hypothetical one-contract entry only'};
    await db.setJSON(item.key,row);
   });
  }catch(e){researchFailure('primal-shadow-scoring',e);console.warn('Primal shadow settlement scoring unavailable',String(e))}
  // Resolve the same observed contracts for both strategies using official finalized outcomes.
  await scanBlobPage(db,{prefix:'comparison/v1/',cursorKey:'scan-cursors/comparison-v1',limit:8},async item=>{
   const rec=await db.get(item.key,{type:'json'});
   if(!rec||rec.status!=='PENDING'||rec.expiresAt>now-60000)return;
   const outcome=await db.get('outcomes/'+rec.ticker,{type:'json'});
   if(!trustedStoredFinalizedOutcome(outcome,rec.ticker))return;
   for(const engine of Object.values(rec.engines||{})){
    if(!['up','down'].includes(engine.side)||engine.action==='WAIT')continue;
    const won=(engine.side==='up')===(outcome.result==='yes');
    engine.pnl=Number(((won?1:0)-Number(engine.ask)/100).toFixed(4));
    engine.won=won;engine.resolved=true;
   }
   rec.status='RESOLVED';rec.outcome=outcome.result;rec.resolvedAt=now;
   // A trusted finalized label was checked above; freeze provenance for cost-aware audits.
   rec.outcomeVerification=SETTLEMENT_VERIFICATION;
   await db.setJSON(item.key,rec);
  });
  // Persist a transparent side-by-side report; one hypothetical contract per BUY.
  const all=await blobWindow(db,{prefix:'comparison/v1/',limit:40});
  const rows=(await Promise.all(all.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
  // Legacy RESOLVED labels without official provenance are not evidence of wins,
  // losses, lessons, or a better paper gate. Quarantine contradictory tickers.
  const evidence=verifiedComparisonEvidence(rows);
  const report={at:now,version:1,totalObserved:rows.length,pending:rows.filter(r=>r.status==='PENDING').length,truncated:!!all.cursor,scope:all.cursor?'FIRST_PAGE_ONLY':'ALL_OBSERVED',verifiedResolved:evidence.rows.length,excludedFromVerifiedComparison:evidence.rejected,conflictingMarketCount:evidence.conflictingMarketCount,engines:{}};
  for(const name of ['original','upgraded']){
   const trades=evidence.rows.filter(r=>r.engines?.[name]?.resolved).sort((a,b)=>a.at-b.at);
   let equity=0,peak=0,maxDrawdown=0;
   for(const row of trades){equity+=row.engines[name].pnl;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity)}
   const pnl=trades.reduce((sum,row)=>sum+row.engines[name].pnl,0);
   const invested=trades.reduce((sum,row)=>sum+Number(row.engines[name].ask)/100,0);
   report.engines[name]={trades:trades.length,wins:trades.filter(row=>row.engines[name].won).length,losses:trades.filter(row=>!row.engines[name].won).length,winRate:trades.length?trades.filter(row=>row.engines[name].won).length/trades.length:null,netPnl:Number(pnl.toFixed(4)),roi:invested?Number((pnl/invested).toFixed(4)):null,maxDrawdown:Number(maxDrawdown.toFixed(4)),method:'One hypothetical contract per signal; binary settlement, entry ask; excludes fees, slippage and early exits'};
  }
  // Cost-stressed comparison uses only prospective matched markets with explicit
  // finalized-outcome provenance. Legacy rows without provenance are excluded.
  report.costAwareMatched=costAwarePairedAudit(rows,{archiveComplete:!all.cursor});
  await db.setJSON('comparison/report-v1',report);
  // Settle only frozen, late-window paired predictions against independently
  // verified official binary outcomes. Separate resolved keys prevent recounting.
  try{
   await scanBlobPage(db,{prefix:'paired-shadow/pending/v1/',cursorKey:'scan-cursors/paired-shadow-v1',limit:8},async blob=>{
    const row=await db.get(blob.key,{type:'json'});
    if(!row||!Number.isFinite(row.expiresAt)||row.expiresAt>now-60000)return;
    const resolvedKey='paired-shadow/resolved/v1/'+row.ticker;
    if(await db.get(resolvedKey,{type:'json'})){await db.delete(blob.key);return;}
    const outcome=await db.get('outcomes/'+row.ticker,{type:'json'});
    const resolved=resolvePairedShadow(row,outcome,now);
    if(resolved){
     await db.setJSON(resolvedKey,resolved);
     await db.delete(blob.key);
    }
   });
  }catch(e){researchFailure('paired-shadow-scoring',e);console.warn('Paired A/B settlement evaluation unavailable',String(e))}
  // Shared loss review: update a conservative research-only threshold from resolved
  // outcomes. The original strategy remains frozen as an unbiased baseline.
  // Never retrain on unresolved outcomes or automatically loosen risk limits.
  const resolved=evidence.rows.slice().sort((a,b)=>a.at-b.at);
  // Never select a research candidate from the oldest 1,000 rows if newer rows are excluded.
  const training=all.cursor||evidence.conflictingMarketCount?[]:resolved.slice(0,-30),holdout=all.cursor||evidence.conflictingMarketCount?[]:resolved.slice(-30);
  const candidates=[{score:70,maxAsk:65},{score:75,maxAsk:65},{score:80,maxAsk:60},{score:85,maxAsk:55}];
  const evaluate=(set,gate)=>{
   const selected=set.filter(r=>Number(r.engines.original.score)>=gate.score&&Number(r.engines.original.ask)<=gate.maxAsk);
   const pnl=selected.reduce((n,r)=>n+Number(r.engines.original.pnl),0);
   const spent=selected.reduce((n,r)=>n+Number(r.engines.original.ask)/100,0);
   return {trades:selected.length,roi:spent?pnl/spent:null,pnl};
  };
  const scored=candidates.map(g=>({...g,train:evaluate(training,g),holdout:evaluate(holdout,g)}));
  const eligible=scored.filter(g=>g.train.trades>=30&&g.holdout.trades>=15&&g.train.roi>0&&g.holdout.roi>0);
  eligible.sort((a,b)=>b.holdout.roi-a.holdout.roi);
  const chosen=eligible[0]||null;
  // Cross-engine mistake analysis: evaluate disagreement, abstentions, and loss patterns.
  // Analysis is retrospective and cannot silently change either engine's live rules.
  const breakdown={at:now,version:1,mode:'AUTOMATED PAPER RESEARCH',assets:{},entryBands:{},scoreBands:{},disagreements:{originalOnly:0,bothEntered:0},recentLosses:[],recommendations:[]};
  for(const row of resolved){
   const a=row.engines.original,b=row.engines.upgraded;
   const band=Number(a.ask)<45?'under45':Number(a.ask)<60?'45to59':'60plus';
   const scoreBand=Number(a.score)<75?'under75':Number(a.score)<85?'75to84':'85plus';
   for(const [target,key] of [[breakdown.assets,row.asset||'UNKNOWN'],[breakdown.entryBands,band],[breakdown.scoreBands,scoreBand]]){
    const v=target[key]||(target[key]={n:0,wins:0,losses:0,pnl:0});
    v.n++;v.wins+=a.won?1:0;v.losses+=a.won?0:1;v.pnl+=Number(a.pnl);
   }
   if(b?.resolved)breakdown.disagreements.bothEntered++;
   else breakdown.disagreements.originalOnly++;
   if(!a.won)breakdown.recentLosses.push({ticker:row.ticker,asset:row.asset,at:row.at,ask:a.ask,score:a.score,pnl:a.pnl,upgradedSkipped:!b?.resolved});
  }
  breakdown.recentLosses=breakdown.recentLosses.slice(-25);
  for(const [asset,v] of Object.entries(breakdown.assets)){
   v.pnl=Number(v.pnl.toFixed(4));
   if(v.n>=20&&v.pnl<0)breakdown.recommendations.push({type:'REVIEW_ASSET',asset,reason:asset+' has negative historical simulated returns over '+v.n+' observations; confirm on new outcomes before changing rules'});
  }
  for(const [band,v] of Object.entries(breakdown.entryBands)){
   v.pnl=Number(v.pnl.toFixed(4));
   if(v.n>=20&&v.pnl<0)breakdown.recommendations.push({type:'REVIEW_ENTRY_BAND',band,reason:'Negative simulated returns in '+band+' entry band; research only'});
  }
  await db.setJSON('comparison/mistake-analysis-v1',breakdown);
  // Durable lesson journal: one immutable outcome review per resolved contract.
  // Capture both engines' choices, including correctly avoided losing trades.
  for(const row of resolved.slice(-150)){
   const key='comparison/lessons/v1/'+row.ticker;
   if(await db.get(key,{type:'json'}))continue;
   const original=row.engines.original,upgraded=row.engines.upgraded;
   const upgradedEntered=upgraded?.resolved===true;
   const lesson={ticker:row.ticker,asset:row.asset,signalAt:row.at,verifiedAt:row.resolvedAt,
    officialOutcome:row.outcome,entry:{ask:original.ask,score:original.score,side:original.side},
    original:{entered:true,won:original.won,pnl:original.pnl},
    upgraded:{entered:upgradedEntered,won:upgradedEntered?upgraded.won:null,pnl:upgradedEntered?upgraded.pnl:null},
    interpretation:original.won?(upgradedEntered?'BOTH_CORRECT':'UPGRADED_MISSED_WIN'):(upgradedEntered?'BOTH_LOST':'UPGRADED_AVOIDED_LOSS'),
    source:'Official finalized binary market outcome; simulated ask entry, no fees/slippage',version:1};
   await db.setJSON(key,lesson);
  }
  const lessons=resolved.map(row=>({originalWon:row.engines.original.won,upgradedEntered:row.engines.upgraded?.resolved===true}));
  await db.setJSON('comparison/lesson-summary-v1',{at:now,total:lessons.length,bothWon:lessons.filter(x=>x.originalWon&&x.upgradedEntered).length,
   bothLost:lessons.filter(x=>!x.originalWon&&x.upgradedEntered).length,
   avoidedLosses:lessons.filter(x=>!x.originalWon&&!x.upgradedEntered).length,
   missedWins:lessons.filter(x=>x.originalWon&&!x.upgradedEntered).length,
   note:'Research labels are not independent model training; future outcomes determine whether proposed changes help.'});

  // Prospective candidate registration: freeze each proposal before future outcomes.
  // A candidate is never promoted from the same observations that selected it.
  const registryKey='comparison/prospective-candidate-v1';
  let registry=await db.get(registryKey,{type:'json'});
  if(!registry&&chosen){
   registry={createdAt:now,after:resolved.length,afterAt:now,gate:{score:chosen.score,maxAsk:chosen.maxAsk},status:'COLLECTING',version:1};
   await db.setJSON(registryKey,registry);
  }
  if(registry&&!all.cursor&&!evidence.conflictingMarketCount){
   const future=Number.isFinite(registry.afterAt)?resolved.filter(x=>x.at>registry.afterAt):resolved.slice(registry.after);
   const evalGate=evaluate(future,registry.gate);
   const baseline=evaluate(future,{score:0,maxAsk:100});
   const ready=future.length>=100&&evalGate.trades>=30;
   const better=ready&&evalGate.roi!==null&&baseline.roi!==null&&evalGate.roi>baseline.roi&&evalGate.pnl>0;
   const winsFor=(set,gate)=>{const selected=set.filter(r=>Number(r.engines.original.score)>=gate.score&&Number(r.engines.original.ask)<=gate.maxAsk);return {trades:selected.length,wins:selected.filter(r=>r.engines.original.won).length,losses:selected.filter(r=>!r.engines.original.won).length,winRate:selected.length?selected.filter(r=>r.engines.original.won).length/selected.length:null}};
   const candidateAccuracy=winsFor(future,registry.gate),baselineAccuracy=winsFor(future,{score:75,maxAsk:65});
   const accuracyImproved=ready&&candidateAccuracy.trades>=30&&baselineAccuracy.trades>=30&&candidateAccuracy.winRate>baselineAccuracy.winRate;
   const evaluation={at:now,version:1,accuracy:{candidate:candidateAccuracy,baseline:baselineAccuracy,improved:accuracyImproved,verified:ready&&candidateAccuracy.trades>=30&&baselineAccuracy.trades>=30,method:'Prospective official finalized market labels; selection effects and sample uncertainty remain'},status:ready?(better?'PASSED_RESEARCH_CHECK':'FAILED_RESEARCH_CHECK'):'COLLECTING',futureObservations:future.length,candidate:evalGate,baseline,gate:registry.gate,automaticExecution:false,automaticPromotion:false,notes:'Prospective holdout; no live strategy changes. Fees and slippage are not modeled, so paper promotion is disabled pending independent cost-aware validation.'};
   await db.setJSON('comparison/prospective-evaluation-v1',evaluation);
   // Automatic promotion affects simulated KaiBot entries only. The original stays unchanged.
   // Only allow a strictly tighter gate than the existing 75 score / 65c ceiling.
   const safe=Number(registry.gate.score)>=75&&Number(registry.gate.maxAsk)<=65;
   const activeKey='comparison/active-paper-gate-v1';
   const active=await db.get(activeKey,{type:'json'});
   // Gross hypothetical returns exclude fees, slippage and fill quality.
   // Preserve forward evaluation but block automatic paper gate activation.
   const independentCostValidation=false;
   if(independentCostValidation&&better&&safe&&!active){
    await db.setJSON(activeKey,{gate:registry.gate,activatedAt:now,afterAt:now,status:'ACTIVE',source:'prospective-verified',mode:'PAPER ONLY'});
   }else if(active?.status==='ACTIVE'){
    const post=resolved.filter(x=>x.at>active.afterAt);
    const candidatePost=evaluate(post,active.gate),baselinePost=evaluate(post,{score:75,maxAsk:65});
    if(post.length>=50&&(candidatePost.pnl<0||(candidatePost.trades>=15&&baselinePost.roi!==null&&candidatePost.roi<baselinePost.roi))){
     await db.setJSON(activeKey,{...active,status:'ROLLED_BACK',rolledBackAt:now,reason:'Negative or weaker forward paper performance'});
    }
   }

  }

  await db.setJSON('comparison/research-gate-v1',{
   at:now,mode:'RESEARCH ONLY',baseline:'original unchanged',trainingCount:training.length,holdoutCount:holdout.length,
   candidates:scored,proposed:chosen?{score:chosen.score,maxAsk:chosen.maxAsk}:null,
   note:all.cursor||evidence.conflictingMarketCount?'Incomplete or conflicting archive: candidate selection and forward evaluation paused until evidence is reconciled. No automatic execution or promotion.':'Uses prospectively recorded, strictly verified finalized observations; rolling holdout is reused for candidate selection and is not an independent final validation. No automatic execution or strategy promotion.'
  });

  const perAsset={};
  for(const asset of Object.keys(SERIES)){
   const am=assetModels[asset]||await db.get('training/model/'+asset,{type:'json'});
   if(am?.count){
    const report=learningReport(am);
    perAsset[asset]={count:am.count,brier:report.modelBrier,baselineBrier:report.baselineBrier,
     relativeBrierImprovement:report.relativeBrierImprovement,
     validated:report.validated,status:report.status,
     warning:report.validated?'Aggregate prequential improvement only; independent future validation still required':'Do not use this model to justify a BUY signal'};
   }
  }
  await db.setJSON('training/status',{trainedThisRun,trainedByAsset,at:now,measuredLearning:learningReport(model),count:model.count,brier:model.count?model.brier/model.count:null,baselineBrier:model.count?model.baselineBrier/model.count:null,validated:modelValidated(model),perAsset,mode:'PAPER RESEARCH',method:'Prequential finalized-outcome calibration; per-asset validation uses the same 100-outcome threshold as the live model gate.'});
  collection.trainingSucceeded=true;
 }catch(e){collection.trainingError=String(e).slice(0,240);console.error('Training update failed',String(e))}
 // Mark completion independently of the KaiBot paper runner, including research-only collection.
 await db.setJSON('collector/heartbeat',{startedAt:now,completedAt:Date.now(),status:collection.sampled.size===Object.keys(SERIES).length&&!collection.errors.size&&collection.trainingSucceeded&&collection.settlementFailures===0&&collection.trainingReviewCount===0&&collection.researchFailures===0?'COMPLETED':'DEGRADED',mode:'PAPER RESEARCH',expectedIntervalSeconds:60,sampledAssets:[...collection.sampled],sampledAssetCount:collection.sampled.size,failedAssets:[...collection.errors],newPendingPredictions:collection.newPredictions,trainedThisRun,trainedByAsset,trainingReviewCount:collection.trainingReviewCount,settlementFailures:collection.settlementFailures,researchFailures:collection.researchFailures,researchErrors:collection.researchErrors,trainingSucceeded:collection.trainingSucceeded,trainingError:collection.trainingError,note:'A fresh heartbeat alone does not prove every market was sampled or every prediction was verified.'});
 // Retention is enforced lazily by the read API; keys are minute buckets and bounded reads are used.
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};
