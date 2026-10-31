import {getStore} from '@netlify/blobs';
import {paperSignal} from './lib/shared-paper-signals.mjs';
import {performance,gatePaperEntry} from './lib/paper-performance.mjs';
const assets={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const expiry=(m,now)=>[m?.expected_expiration_time,m?.expiration_time,m?.close_time].map(v=>Date.parse(v||'')).filter(v=>Number.isFinite(v)&&v>now).sort((a,b)=>a-b)[0]||null;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export default async req=>{
 if(req.method!=='GET')return json({error:'GET only'},405);
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'}),now=Date.now();
 const paperDb=getStore({name:'bank-trades-server-kaibot',consistency:'strong'});
 let openPositions=[],stats=performance([]);try{const ledger=await paperDb.get('ledger',{type:'json'});stats=performance(ledger?.trades||[]);openPositions=(ledger?.trades||[]).filter(t=>t.status==='OPEN'&&t.ticker&&['up','down'].includes(t.side)&&Number.isFinite(Number(t.ask)));}catch{}
 const research={model:await db.get('training/model',{type:'json'}),status:await db.get('training/status',{type:'json'})};
 const results=await Promise.all(Object.entries(assets).map(async([asset,series])=>{
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
   let response;try{response=await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'100'}),{signal:controller.signal});}finally{clearTimeout(timer)}
   if(!response.ok)throw Error('Market HTTP '+response.status);
   const data=await response.json();
   const markets=(data.markets||[]).map(m=>({...m,_expiry:expiry(m,now)})).filter(m=>m._expiry&&m._expiry>now&&m._expiry<=now+960000).sort((a,b)=>a._expiry-b._expiry);
   const position=openPositions.filter(t=>t.asset===asset).sort((a,b)=>b.at-a.at)[0];
   const market=position?(markets.find(m=>m.ticker===position.ticker)||null):markets[0];
   if(!market)return {asset,action:'WAIT',reason:position?'Open paper position requires fresh quotes for its exact ticker':'No verified active contract',ticker:position?.ticker||null};
   const listed=await db.list({prefix:'samples/'+asset+'/',limit:30});
   const records=(await Promise.all(listed.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
   const signal=gatePaperEntry({...paperSignal(market,records,position||null,now,research),asset},stats);
   return {asset,...signal,position:position?{side:position.side,ask:position.ask,qty:position.qty,ticker:position.ticker,source:'server paper ledger'}:null};
  }catch(e){return {asset,action:'WAIT',score:0,reason:'Feed unavailable: '+String(e.message),ticker:null}}
 }));
 return json({fetched_at:new Date(now).toISOString(),source:'Shared read-only Kalshi paper research signals',performance:stats,research:research.status,results});
};
