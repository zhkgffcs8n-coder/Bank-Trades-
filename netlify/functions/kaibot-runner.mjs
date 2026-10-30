import {paperSignal} from './lib/shared-paper-signals.mjs';
import {getStore} from '@netlify/blobs';
const SERIES={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const base='https://api.elections.kalshi.com/trade-api/v2',db=()=>getStore({name:'bank-trades-server-kaibot',consistency:'strong'}),hist=()=>getStore({name:'bank-trades-market-history',consistency:'strong'});
const q=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:m?.[k]!=null?Number(m[k]):NaN;
async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}finally{clearTimeout(t)}}
export default async()=>{
 const s=db(),state=await s.get('state',{type:'json'});
 let ledger=await s.get('ledger',{type:'json'})||{cash:1000,trades:[],updatedAt:null};const now=Date.now(),hdb=hist();
 // Settle prior server paper positions only from official finalized labels.
 for(const t of ledger.trades.filter(x=>x.status==='OPEN')){
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
  ledger.cash=Math.round((ledger.cash+payout)*100)/100;t.status='SETTLED';t.settlement=o.result;t.pnl=Math.round((payout-t.cost)*100)/100;t.settledAt=now;
 }
 if(!state?.running){ledger.updatedAt=now;await s.setJSON('ledger',ledger);await s.setJSON('last-run',{at:now,running:false});return new Response(null,{status:204});}
 const open=new Set(ledger.trades.filter(x=>x.status==='OPEN').map(x=>x.ticker));
 for(const [asset,series] of Object.entries(SERIES)){
  try{
   const d=await get(base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'50'}));
   const ms=(d.markets||[]).map(m=>({...m,_e:Date.parse(m.expected_expiration_time||m.expiration_time||m.close_time||'')})).filter(m=>Number.isFinite(m._e)&&m._e-now>=360000&&m._e-now<=930000).sort((a,b)=>a._e-b._e);const m=ms[0];if(!m||open.has(m.ticker))continue;
   const listed=await hdb.list({prefix:'samples/'+asset+'/',limit:30}),records=(await Promise.all(listed.blobs.map(b=>hdb.get(b.key,{type:'json'})))).filter(x=>x?.ticker===m.ticker).sort((a,b)=>a.t-b.t).slice(-8);
   // Read the same paper-only signal rules as the dashboard; preserve execution as a separate step.
   const signal=paperSignal(m,records,null,now);
   await hdb.setJSON('signals/'+asset,{...signal,asset,updatedAt:now});
   if(signal.action!=='BUY UP'&&signal.action!=='BUY DOWN')continue;
   const side=signal.side,ask=signal.ask;
   // BTC remains disabled for automatic paper entries pending independent validation.
   if(asset==='BTC')continue;
   const max=Math.min(1000,Math.max(1,Number(state.maxSpend)||50)),qty=Math.floor(Math.min(max,ledger.cash)/(ask/100)),cost=Math.round(qty*ask)/100;if(qty<1||cost<=0||cost>ledger.cash)continue;
   ledger.cash=Math.round((ledger.cash-cost)*100)/100;ledger.trades.push({id:'srv_'+now+'_'+asset,asset,ticker:m.ticker,side,qty,ask,cost,at:now,status:'OPEN',source:'SERVER KAIBOT PAPER',signalQuality:{momentum:change,agreement,reversals,spread:Math.max(ya-yb,na-nb),secondsLeft:(m._e-now)/1000}});
  }catch{}
 }
 ledger.updatedAt=now;await s.setJSON('ledger',ledger);await s.setJSON('last-run',{at:now,running:true});
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};