import {getStore} from '@netlify/blobs';
import {paperSignal} from './lib/shared-paper-signals.mjs';
import {performance,gatePaperEntry} from './lib/paper-performance.mjs';
import {buildCommitteeSnapshot} from '../../src/engine-team.mjs';
import {assessCollectorHealth} from '../../src/collector-health.mjs';
const assets={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const expiry=(m,now)=>[m?.expected_expiration_time,m?.expiration_time,m?.close_time].map(v=>Date.parse(v||'')).filter(v=>Number.isFinite(v)&&v>now).sort((a,b)=>a-b)[0]||null;
const timed=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(label+' timeout')),ms))]);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export default async req=>{
 if(req.method!=='GET')return json({error:'GET only'},405);
 const now=Date.now();
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
 const learning={mode:'AUTOMATIC PAPER RESEARCH',model:research.status,
  status:research.status?.validated?'MODEL RESEARCH CHECK PASSED':'COLLECTING VERIFIED OUTCOMES',
  liveRuleAutoPromotion:false,
  paperRuleAutoPromotion:false,
  pipeline:['LIVE OBSERVATION','OFFICIAL SETTLEMENT','ONLINE MODEL UPDATE','PROSPECTIVE PAPER VALIDATION','MANUAL REVIEW BEFORE ANY PROMOTION'],
  details:'Scheduled collector performs learning; live endpoint consumes the latest model without re-reading historical reports on every refresh'};
 const results=await Promise.all(Object.entries(assets).map(async([asset,series])=>{
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
   let response;try{response=await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'100'}),{signal:controller.signal});}finally{clearTimeout(timer)}
   if(!response.ok)throw Error('Market HTTP '+response.status);
   const data=await response.json();
   const markets=(data.markets||[]).map(m=>({...m,_expiry:expiry(m,now)})).filter(m=>m._expiry&&m._expiry>now&&m._expiry<=now+960000).sort((a,b)=>a._expiry-b._expiry);
   const position=openPositions.filter(t=>t.asset===asset).sort((a,b)=>b.at-a.at)[0];
   const market=markets[0];
   if(!market)return {asset,action:'WAIT',reason:'No verified active contract',ticker:null,committeeInput:{status:'MISSING_INPUT',missing:['verified active contract ticker']}};
   const activePosition=position?.ticker===market.ticker?position:null;
   let records=[];
   try{
    const recent=await timed(db.get('recent/'+asset,{type:'json'}),2200,'recent samples');
    records=(Array.isArray(recent)?recent:[]).filter(x=>x?.ticker===market.ticker);
   }catch(e){return {asset,action:'WAIT',score:0,ticker:market.ticker,reason:'Recent sample read unavailable: '+e.message,committeeInput:{status:'MISSING_INPUT',missing:['scheduled same-contract samples unavailable: '+String(e.message)]}};}
   const rawSignal=paperSignal(market,records,activePosition,now,research);
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
   const quote=k=>market[k+'_dollars']!=null?Number(market[k+'_dollars']):market[k]!=null?Number(market[k])/100:NaN;
   const upAsk=quote('yes_ask'),downAsk=quote('no_ask'),upBid=quote('yes_bid'),downBid=quote('no_bid');
   const fairUp=Number.isFinite(upBid)&&Number.isFinite(upAsk)?(upBid+upAsk)/2:NaN;
   const valid=Number.isFinite(upAsk)&&Number.isFinite(downAsk)&&upAsk>0&&downAsk>0&&upAsk<1&&downAsk<1;
   const forecast=valid?{direction:signal.action==='BUY UP'?'UP':signal.action==='BUY DOWN'?'DOWN':Number.isFinite(fairUp)?fairUp>=.5?'UP':'DOWN':null,method:signal.action.startsWith('BUY')?'qualified experimental entry':'quote-implied direction only; not a predictive edge',up:{askCents:Math.round(upAsk*1000)/10,maxProfitPerContract:Math.round((1-upAsk)*1000)/1000,maxLossPerContract:upAsk},down:{askCents:Math.round(downAsk*1000)/10,maxProfitPerContract:Math.round((1-downAsk)*1000)/1000,maxLossPerContract:downAsk},expiresAt:market._expiry,actionable:signal.action.startsWith('BUY')}:null;
   // Separate a round-level research direction from a qualified trade recommendation.
   // This field is non-actionable and never bypasses paper entry gates or sends orders.
   const researchDirection=Number.isFinite(fairUp)&&valid
    ?{direction:fairUp>=.5?'UP':'DOWN',method:'Current quote midpoint, not validated predictive signal',mode:'SHADOW_ONLY',actionable:false,roundTicker:market.ticker,asOf:now}
    :{direction:null,method:'Insufficient valid quotes',mode:'SHADOW_ONLY',actionable:false,roundTicker:market.ticker,asOf:now};
   return {asset,...signal,entryGate,researchDirection,committeeInput,forecast,roundAssessment,position:activePosition?{side:activePosition.side,ask:activePosition.ask,qty:activePosition.qty,ticker:activePosition.ticker,source:'server paper ledger'}:null};
  }catch(e){return {asset,action:'WAIT',score:0,reason:'Feed unavailable: '+String(e.message),ticker:null,committeeInput:{status:'MISSING_INPUT',missing:['market feed unavailable: '+String(e.message)]}}}
 }));
 return json({fetched_at:new Date().toISOString(),source:'Shared read-only Kalshi paper research signals',performance:performanceStatus.state==='AVAILABLE'?stats:null,performanceStatus,collectorHealth:assessCollectorHealth(research.heartbeat,now),research:research.status,learning,results});
};
