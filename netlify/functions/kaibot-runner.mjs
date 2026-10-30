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
 const stats=performance(ledger.trades);
 await s.setJSON('performance',stats);
 if(!state?.running){ledger.updatedAt=now;await s.setJSON('ledger',ledger);await s.setJSON('last-run',{at:now,running:false});return new Response(null,{status:204});}
 const research={model:await hdb.get('training/model',{type:'json'}),status:training};
 const open=new Set(ledger.trades.filter(x=>x.status==='OPEN').map(x=>x.asset));
 const recentlyTraded=new Set(ledger.trades.filter(x=>Number(x.at)>now-15*60*1000).map(x=>x.asset));
 for(const [asset,series] of Object.entries(SERIES)){
  try{
   const d=await get(base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'50'}));
   const ms=(d.markets||[]).map(m=>({...m,_e:Date.parse(m.expected_expiration_time||m.expiration_time||m.close_time||'')})).filter(m=>Number.isFinite(m._e)&&m._e-now>=360000&&m._e-now<=930000).sort((a,b)=>a._e-b._e);const m=ms[0];if(!m||open.has(asset)||recentlyTraded.has(asset)||ledger.trades.some(t=>t.ticker===m.ticker))continue;
   const listed=await hdb.list({prefix:'samples/'+asset+'/',limit:30}),records=(await Promise.all(listed.blobs.map(b=>hdb.get(b.key,{type:'json'})))).filter(x=>x?.ticker===m.ticker).sort((a,b)=>a.t-b.t).slice(-8);
   // Read the same paper-only signal rules as the dashboard; preserve execution as a separate step.
   const signal=gatePaperEntry({...paperSignal(m,records,null,now,research),asset},stats);
   await hdb.setJSON('signals/'+asset,{...signal,asset,updatedAt:now});
   if(signal.action!=='BUY UP'&&signal.action!=='BUY DOWN')continue;
   // Conservative paper-only quality gate: require stronger agreement and narrow spreads.
   if(Number(signal.score)<75||Number(signal.ask)>65)continue;
   const side=signal.side,ask=signal.ask;
   // BTC remains disabled for automatic paper entries pending independent validation.
   if(asset==='BTC')continue;
   const max=Math.min(20,Math.max(1,Number(state.maxSpend)||20)),qty=Math.floor(Math.min(max,ledger.cash)/(ask/100)),cost=Math.round(qty*ask)/100;if(qty<1||cost<=0||cost>ledger.cash)continue;
   ledger.cash=Math.round((ledger.cash-cost)*100)/100;ledger.trades.push({id:'srv_'+now+'_'+asset,asset,ticker:m.ticker,side,qty,ask,cost,at:now,status:'OPEN',source:'SERVER KAIBOT PAPER',signalQuality:{sharedEngine:true,score:signal.score,reason:signal.reason,validation:signal.validation,secondsLeft:(m._e-now)/1000}});
  }catch{}
 }
 ledger.updatedAt=now;await s.setJSON('ledger',ledger);await s.setJSON('last-run',{at:now,running:true});
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};