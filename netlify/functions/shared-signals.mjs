import {getStore} from '@netlify/blobs';
import {paperSignal} from './lib/shared-paper-signals.mjs';
import {performance,gatePaperEntry} from './lib/paper-performance.mjs';
import {buildCommitteeSnapshot} from '../../src/engine-team.mjs';
import {assessCollectorHealth} from '../../src/collector-health.mjs';
import {selectEligibleRound} from '../../src/select-eligible-round.mjs';
import {evaluateScalperV8} from '../../src/scalper-v8.mjs';
import {learningReport} from '../../src/research-model.mjs';
const assets={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const expiry=(m,now)=>[m?.expected_expiration_time,m?.expiration_time,m?.close_time].map(v=>Date.parse(v||'')).filter(v=>Number.isFinite(v)&&v>now).sort((a,b)=>a-b)[0]||null;
const timed=(promise,ms,label)=>{
 let timeout;
 return Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error(label+' timeout')),ms)})])
  .finally(()=>clearTimeout(timeout));
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export default async req=>{
 if(req.method!=='GET')return json({error:'GET only'},405);
 const requestStartedAt=Date.now();
 let db=null,paperDb=null;
 try{db=getStore({name:'bank-trades-market-history',consistency:'strong'});paperDb=getStore({name:'bank-trades-server-kaibot',consistency:'strong'});}catch(e){return json({fetched_at:new Date().toISOString(),results:Object.keys(assets).map(asset=>({asset,action:'WAIT',reason:'Signal storage initialization failed: '+String(e.message||e)})),error:'storage_initialization_failed'});}
 let openPositions=[],stats=performance([]),performanceStatus={state:'UNAVAILABLE',reason:'Paper ledger not loaded',updatedAt:null};
 try{
  const ledger=await timed(paperDb.get('ledger',{type:'json'}),1800,'ledger');
  if(ledger&&Array.isArray(ledger.trades)){
   stats=performance(ledger.trades);
   openPositions=ledger.trades.filter(t=>t.status==='OPEN'&&t.ticker&&['up','down'].includes(t.side)&&Number.isFinite(Number(t.ask)));
   performanceStatus={state:'AVAILABLE',reason:null,updatedAt:ledger.updatedAt||null,recordedTrades:ledger.trades.length};
  }else{
   performanceStatus={state:'UNAVAILABLE',reason:'No server paper ledger found',updatedAt:null};
  }
 }catch(e){
  console.error('Server paper performance read failed',e);
  performanceStatus={state:'ERROR',reason:'Server paper ledger read failed or timed out',updatedAt:null};
 }
 const research={model:null,status:null,heartbeat:null};
 await Promise.all([timed(db.get('training/model',{type:'json'}),1800,'model').then(v=>research.model=v).catch(()=>{}),timed(db.get('training/status',{type:'json'}),1800,'status').then(v=>research.status=v).catch(()=>{}),timed(db.get('collector/heartbeat',{type:'json'}),1800,'collector heartbeat').then(v=>research.heartbeat=v).catch(()=>{})]);
 // Learning continues in the scheduled collector. Keep optional reports out of
 // the latency-critical signal endpoint to avoid overwhelming Netlify Blobs.
 const collector=assessCollectorHealth(research.heartbeat,Date.now());
 const collectionDiagnostics={lastStartedAt:research.heartbeat?.startedAt||null,
  lastCompletedAt:research.heartbeat?.completedAt||null,
  sampledAssets:research.heartbeat?.sampledAssets||[],
  sampledAssetCount:research.heartbeat?.sampledAssetCount??null,
  failedAssets:research.heartbeat?.failedAssets||[],
  trainingSucceeded:research.heartbeat?.trainingSucceeded??null,
  trainingError:research.heartbeat?.trainingError||null,
  settlementFailures:research.heartbeat?.settlementFailures??null,
  trainingReviewCount:research.heartbeat?.trainingReviewCount??null,
  newPendingPredictions:research.heartbeat?.newPendingPredictions??null,
  collectorHealth:collector};
 const learning={mode:'AUTOMATIC PAPER RESEARCH',model:research.status,
  status:research.status?.validated?'MODEL RESEARCH CHECK PASSED':'COLLECTING VERIFIED OUTCOMES',
  liveRuleAutoPromotion:false,
  paperRuleAutoPromotion:false,
  pipeline:['LIVE OBSERVATION','OFFICIAL SETTLEMENT','ONLINE MODEL UPDATE','PROSPECTIVE PAPER VALIDATION','MANUAL REVIEW BEFORE ANY PROMOTION'],
  details:'Scheduled collector performs learning; live endpoint consumes the latest model without re-reading historical reports on every refresh'};
 // Use each asset's trained model for research forecasts, falling back to global.
 // Previously the live signal path only loaded the global model.
 const assetModels=Object.fromEntries(await Promise.all(Object.keys(assets).map(async asset=>{
  try{return [asset,await timed(db.get('training/model/'+asset,{type:'json'}),1800,'asset model')]}
  catch{return [asset,null]}
 })));
 const results=await Promise.all(Object.entries(assets).map(async([asset,series])=>{
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
   const quoteRequestedAt=Date.now();
   const marketRead=(async()=>{
    try{
     const response=await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'100'}),{signal:controller.signal});
     if(!response.ok)throw Error('Market HTTP '+response.status);
     return {data:await response.json(),quoteReceivedAt:Date.now()};
    }finally{clearTimeout(timer)}
   })();
   const recentRead=timed(db.get('recent/'+asset,{type:'json'}),2200,'recent samples').catch(()=>null);
   const [{data,quoteReceivedAt},recent]=await Promise.all([marketRead,recentRead]);
   const now=Date.now();
   const markets=(data.markets||[]).map(m=>({...m,_expiry:expiry(m,now)})).filter(m=>m._expiry&&m._expiry>now&&m._expiry<=now+960000).sort((a,b)=>a._expiry-b._expiry);
   const selected=selectEligibleRound(markets,now);
   const timing={quoteReceivedAt,exchangeEventAt:null,quoteFetchMs:quoteReceivedAt-quoteRequestedAt,decisionAt:now};
   if(!selected)return {asset,action:'WAIT',reason:markets.length?'No active contract with valid binary quotes':'No verified active contract',ticker:null,timing,committeeInput:{status:'MISSING_INPUT',missing:['verified active contract with valid quotes']}};
   const {market,yesAsk:upAsk,noAsk:downAsk,yesBid:upBid,noBid:downBid}=selected;
   if(!Array.isArray(recent))return {asset,ticker:market.ticker,action:'WAIT',reason:'Recent sample history unavailable',timing,committeeInput:{status:'MISSING_INPUT',missing:['scheduled same-contract samples unavailable']}};
   const records=recent.filter(x=>x?.ticker===market.ticker);
   const activePosition=openPositions.filter(t=>t.asset===asset&&t.ticker===market.ticker).sort((a,b)=>b.at-a.at)[0]||null;
   const v8=evaluateScalperV8({ticker:market.ticker,observedAt:quoteReceivedAt,expiresAt:market._expiry,
    yesAsk:upAsk,noAsk:downAsk,yesBid:upBid,noBid:downBid},records);
   const rawSignal=paperSignal(market,records,activePosition,now,{...research,model:assetModels[asset]||research.model});
   const signal=gatePaperEntry({...rawSignal,asset},stats);
   // Keep the underlying direction and the post-performance veto visible.
   // Never promote a rejected signal into a live BUY.
   const entryGate={rawAction:rawSignal.action,finalAction:signal.action,
    blockedByPerformance:rawSignal.action.startsWith('BUY')&&signal.action==='WAIT',
    validation:signal.validation||null,reason:signal.reason,
    sampleCount:rawSignal.sampleCount??null};
   // A shadow committee receives real same-contract features and normalized ask,
   // even when the actionable paper signal correctly remains WAIT.
   const committeeInput=buildCommitteeSnapshot(market,records,now);
   const roundAssessment={ticker:market.ticker,asset,expiresAt:market._expiry,evaluatedAt:now,coverage:'EVALUATED',entryQualified:['BUY UP','BUY DOWN'].includes(signal.action),action:signal.action,reason:signal.reason};
   const fairUp=Number.isFinite(upBid)&&Number.isFinite(upAsk)?(upBid+upAsk)/2:NaN;
   const valid=Number.isFinite(upAsk)&&Number.isFinite(downAsk)&&upAsk>0&&downAsk>0&&upAsk<1&&downAsk<1;
   const forecast=valid?{direction:signal.action==='BUY UP'?'UP':signal.action==='BUY DOWN'?'DOWN':Number.isFinite(fairUp)?fairUp>=.5?'UP':'DOWN':null,method:signal.action.startsWith('BUY')?'qualified experimental entry':'quote-implied direction only; not a predictive edge',up:{askCents:Math.round(upAsk*1000)/10,maxProfitPerContract:Math.round((1-upAsk)*1000)/1000,maxLossPerContract:upAsk},down:{askCents:Math.round(downAsk*1000)/10,maxProfitPerContract:Math.round((1-downAsk)*1000)/1000,maxLossPerContract:downAsk},expiresAt:market._expiry,actionable:signal.action.startsWith('BUY')}:null;
   // Separate a round-level research direction from a qualified trade recommendation.
   // This field is non-actionable and never bypasses paper entry gates or sends orders.
   const observed=rawSignal.entryResearch;
   const researchDirection=observed&&['UP','DOWN'].includes(observed.side)
    ?{direction:observed.side,method:'Observed same-contract price momentum; not a validated forecast',mode:'SHADOW_ONLY',actionable:false,roundTicker:market.ticker,asOf:now}
    :{direction:null,method:'No qualified fresh directional momentum observation; quote prices alone do not predict movement',mode:'SHADOW_ONLY',actionable:false,roundTicker:market.ticker,asOf:now};
   // Always publish a separate directional round call when executable quotes exist.
   // This does not change the gated entry action or place an order.
   const roundCall=valid&&Number.isFinite(fairUp)
    ?{direction:researchDirection.direction||(fairUp>=.5?'UP':'DOWN'),
      basis:researchDirection.direction?'observed same-round momentum':'market-implied quote direction',
      confidencePercent:researchDirection.direction&&Number.isFinite(Number(observed?.agreement))?Math.round(Number(observed.agreement)*1000)/10:null,
      confidenceBasis:'Observed same-contract momentum agreement; uncalibrated signal strength, not win probability',
      marketImpliedUpPercent:Math.round(fairUp*1000)/10,
      marketImpliedDirectionPercent:Math.round((researchDirection.direction==='DOWN'||(!researchDirection.direction&&fairUp<.5)?1-fairUp:fairUp)*1000)/10,
      probabilityType:'Kalshi quote-implied percentage, not calibrated forecast accuracy',
      qualified:['BUY UP','BUY DOWN'].includes(signal.action),
      ticker:market.ticker,asOf:now}
    :null;
   // Feed the same visible forecast into the research committee as non-actionable context.
   // It is quote-implied or momentum-derived, not independently calibrated evidence.
   if(roundCall&&committeeInput&&typeof committeeInput==='object')committeeInput.displayForecast={direction:roundCall.direction,basis:roundCall.basis,asOf:roundCall.asOf,ticker:roundCall.ticker,confidencePercent:roundCall.confidencePercent,actionable:false,mode:'SHADOW_ONLY'};
   return {asset,...signal,timing,v8,roundCall,entryGate,researchDirection,committeeInput,forecast,roundAssessment,position:activePosition?{side:activePosition.side,ask:activePosition.ask,qty:activePosition.qty,ticker:activePosition.ticker,source:'server paper ledger'}:null};
  }catch(e){return {asset,action:'WAIT',score:0,reason:'Feed unavailable: '+String(e.message),ticker:null,committeeInput:{status:'MISSING_INPUT',missing:['market feed unavailable: '+String(e.message)]}}}
 }));
 return json({fetched_at:new Date().toISOString(),processingMs:Date.now()-requestStartedAt,source:'Shared read-only Kalshi paper research signals',performance:performanceStatus.state==='AVAILABLE'?stats:null,performanceStatus,collectorHealth:collector,collectionDiagnostics,research:research.status,learning,learningMetrics:learningReport(research.model),perAssetLearningMetrics:Object.fromEntries(Object.keys(assets).map(asset=>[asset,learningReport(assetModels[asset])])),results});
};
