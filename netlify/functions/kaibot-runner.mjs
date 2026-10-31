import {paperSignal} from './lib/shared-paper-signals.mjs';
import {performance,gatePaperEntry} from './lib/paper-performance.mjs';
import {getStore} from '@netlify/blobs';
const SERIES={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const base='https://api.elections.kalshi.com/trade-api/v2',db=()=>getStore({name:'bank-trades-server-kaibot',consistency:'strong'}),hist=()=>getStore({name:'bank-trades-market-history',consistency:'strong'});
const q=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:m?.[k]!=null?Number(m[k]):NaN;
async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}finally{clearTimeout(t)}}
export default async()=>{
 const s=db(),state=await s.get('state',{type:'json'});
 let ledger=await s.get('ledger',{type:'json'})||{cash:1000,trades:[],updatedAt:null};const now=Date.now(),hdb=hist();
 // Reconcile historical simulated early exits from recorded executable bids without paying cash twice.
 for(const t of ledger.trades.filter(x=>x.status==='CLOSED'&&!x.paperExitOnly)){
  if(Number.isFinite(Number(t.exitBid))&&Number.isFinite(Number(t.pnl))&&Number.isFinite(Number(t.cost))){
   t.paperExitOnly=true;t.settlement=Number(t.pnl)>0?'WIN':Number(t.pnl)<0?'LOSS':'TIE';t.settledAt=t.exitedAt||now;
  }
 }
 // Settle prior server paper positions only from official finalized labels.
 for(const t of ledger.trades.filter(x=>x.status==='OPEN'||(x.status==='CLOSED'&&!['WIN','LOSS'].includes(x.settlement)))){
  let o=await hdb.get('outcomes/'+t.ticker,{type:'json'});
  if(!['yes','no'].includes(String(o?.result||'').toLowerCase())){
   try{
    const official=await get(base+'/markets/'+encodeURIComponent(t.ticker));
    const market=official?.market;
    const result=String(market?.result||'').toLowerCase();
    if(['yes','no'].includes(result)&&['settled','finalized'].includes(String(market?.status||'').toLowerCase())){
     o={result,source:'Kalshi official finalized market',verifiedAt:now};
     await hdb.setJSON('outcomes/'+t.ticker,o);
    }
   }catch(e){console.warn('KaiBot settlement lookup unavailable',t.ticker,String(e))}
  }
  if(!['yes','no'].includes(String(o?.result||'').toLowerCase()))continue;
  const won=(t.side==='up'&&o.result==='yes')||(t.side==='down'&&o.result==='no'),payout=won?t.qty:0;
  if(t.status==='CLOSED'){
   // A simulated early exit has already returned its proceeds to cash. Never pay it twice.
   // Classify the actual paper exit P/L, not the later market outcome.
   if(!Number.isFinite(Number(t.pnl)))continue;
   t.settlement=Number(t.pnl)>0?'WIN':Number(t.pnl)<0?'LOSS':'TIE';
   t.marketResult=o.result;t.outcomeVerifiedAt=now;
  }else{
   ledger.cash=Math.round((ledger.cash+payout)*100)/100;
   t.status='SETTLED';t.marketResult=o.result;t.settlement=won?'WIN':'LOSS';
   t.pnl=Math.round((payout-t.cost)*100)/100;t.settledAt=now;
  }
 }
 // Paper-only exit simulation: use the executable bid, never the mid/ask.
 // This does not imply a real Kalshi order could fill at that price or quantity.
 for(const t of ledger.trades.filter(x=>x.status==='OPEN')){
  try{
   const result=await get(base+'/markets/'+encodeURIComponent(t.ticker)),m=result?.market;
   if(!m||!['open','active'].includes(String(m.status||'').toLowerCase()))continue;
   const bid=q(m,t.side==='up'?'yes_bid':'no_bid'),ask=q(m,t.side==='up'?'yes_ask':'no_ask');
   if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||bid>ask||ask-bid>5)continue;
   const roi=(bid-Number(t.ask))/Number(t.ask);
   const expiry=Date.parse(m.expected_expiration_time||m.expiration_time||m.close_time||'');
   const secondsLeft=(expiry-now)/1000;
   const reason=roi<=-.12?'PAPER STOP LOSS':roi>=.20?'PAPER TAKE PROFIT':secondsLeft>0&&secondsLeft<=90?'PAPER TIME EXIT':null;
   if(!reason)continue;
   const proceeds=Math.round(Number(t.qty)*bid)/100;
   t.status='CLOSED';t.exitReason=reason;t.exitBid=bid;t.exitedAt=now;
   t.pnl=Math.round((proceeds-Number(t.cost))*100)/100;
   t.paperExitOnly=true;t.settlement=t.pnl>0?'WIN':t.pnl<0?'LOSS':'TIE';t.settledAt=now;
   ledger.cash=Math.round((ledger.cash+proceeds)*100)/100;
  }catch(e){console.warn('Paper exit quote unavailable',t.ticker,String(e))}
 }
 const training=await hdb.get('training/status',{type:'json'});
 await s.setJSON('research-training-status',training||{count:0,validated:false,mode:'PAPER RESEARCH'});
 const adaptiveGate=await hdb.get('comparison/active-paper-gate-v1',{type:'json'});
 const paperScore=adaptiveGate?.status==='ACTIVE'?Math.max(75,Number(adaptiveGate.gate?.score)||75):75;
 const paperMaxAsk=adaptiveGate?.status==='ACTIVE'?Math.min(65,Number(adaptiveGate.gate?.maxAsk)||65):65;
 const stats=performance(ledger.trades);
 await s.setJSON('performance',stats);
 if(!state?.running){ledger.updatedAt=now;await s.setJSON('ledger',ledger);await s.setJSON('last-run',{at:now,running:false});return new Response(null,{status:204});}
 const research={model:await hdb.get('training/model',{type:'json'}),status:training};
 const open=new Set(ledger.trades.filter(x=>x.status==='OPEN').map(x=>x.asset));
 // Per-contract deduplication below prevents duplicate entries without skipping a new round.
 for(const [asset,series] of Object.entries(SERIES)){
  try{
   const d=await get(base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'50'}));
   const ms=(d.markets||[]).map(m=>({...m,_e:Date.parse(m.expected_expiration_time||m.expiration_time||m.close_time||'')})).filter(m=>Number.isFinite(m._e)&&m._e-now>=360000&&m._e-now<=930000).sort((a,b)=>a._e-b._e);const m=ms[0];if(!m||open.has(asset)||ledger.trades.some(t=>t.ticker===m.ticker))continue;
   const listed=await hdb.list({prefix:'samples/'+asset+'/',limit:30}),records=(await Promise.all(listed.blobs.map(b=>hdb.get(b.key,{type:'json'})))).filter(x=>x?.ticker===m.ticker).sort((a,b)=>a.t-b.t).slice(-8);
   // Paper-only coverage mode: make one bounded hypothetical entry per verified contract.
   // A quote-implied direction is not a validated edge and is never a real-money order.
   const yesAsk=q(m,'yes_ask'),noAsk=q(m,'no_ask'),yesBid=q(m,'yes_bid'),noBid=q(m,'no_bid');
   if(![yesAsk,noAsk,yesBid,noBid].every(Number.isFinite)||yesAsk<=0||noAsk<=0||yesAsk>=100||noAsk>=100||yesBid<0||noBid<0||yesBid>yesAsk||noBid>noAsk)continue;
   const fresh=records.length>0&&now-Number(records.at(-1)?.t)<120000;
   const validHistory=fresh&&records.length>=4&&records.every(x=>Number.isFinite(x.yesMid)&&Number.isFinite(x.t));
   const signal=validHistory?gatePaperEntry({...paperSignal(m,records,null,now,research),asset},stats):{action:'WAIT',score:0,reason:'Insufficient fresh training samples'};
   await hdb.setJSON('signals/'+asset,{...signal,asset,updatedAt:now});
   const modelUp=Number(signal.probability??signal.prediction);
   const chooseUp=signal.action==='BUY UP'?true:signal.action==='BUY DOWN'?false:Number.isFinite(modelUp)&&modelUp>=0&&modelUp<=1?modelUp>=0.5:yesAsk<=noAsk;
   const side=chooseUp?'up':'down',ask=chooseUp?yesAsk:noAsk;
   if(ask<=0||ask>=100)continue;
   const entryBasis=['BUY UP','BUY DOWN'].includes(signal.action)?'QUALIFIED PAPER SIGNAL':'UNVALIDATED QUOTE-BASED PAPER TEST';
   const max=Math.min(20,Math.max(1,Number(state.maxSpend)||20)),qty=Math.floor(Math.min(max,ledger.cash)/(ask/100)),cost=Math.round(qty*ask)/100;if(qty<1||cost<=0||cost>ledger.cash)continue;
   ledger.cash=Math.round((ledger.cash-cost)*100)/100;ledger.trades.push({id:'srv_'+now+'_'+asset,asset,ticker:m.ticker,side,qty,ask,cost,at:now,status:'OPEN',source:'SERVER KAIBOT PAPER',entryBasis,signalQuality:{sharedEngine:true,score:signal.score,reason:signal.reason,validation:signal.validation,secondsLeft:(m._e-now)/1000}});
  }catch{}
 }
 ledger.updatedAt=now;await s.setJSON('ledger',ledger);await s.setJSON('last-run',{at:now,running:true});
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};