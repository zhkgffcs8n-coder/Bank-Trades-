import {getStore} from '@netlify/blobs';
import {paperSignal} from './lib/shared-paper-signals.mjs';
const assets={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export default async req=>{
 if(req.method!=='GET')return json({error:'GET only'},405);
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'}),now=Date.now();
 const paperDb=getStore({name:'bank-trades-server-kaibot',consistency:'strong'});
 let openPositions=[];try{const ledger=await paperDb.get('ledger',{type:'json'});openPositions=(ledger?.trades||[]).filter(t=>t.status==='OPEN'&&t.ticker&&['up','down'].includes(t.side)&&Number.isFinite(Number(t.ask)));}catch{}
 const results=await Promise.all(Object.entries(assets).map(async([asset,series])=>{
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
   let response;try{response=await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'50'}),{signal:controller.signal});}finally{clearTimeout(timer)}
   if(!response.ok)throw Error('Market HTTP '+response.status);
   const data=await response.json();
   const markets=(data.markets||[]).filter(m=>{const expiry=Date.parse(m.expected_expiration_time||m.expiration_time||m.close_time||'');return Number.isFinite(expiry)&&expiry>now+75000&&expiry<now+930000}).sort((a,b)=>Date.parse(a.expected_expiration_time||a.expiration_time||a.close_time)-Date.parse(b.expected_expiration_time||b.expiration_time||b.close_time));
   const position=openPositions.filter(t=>t.asset===asset).sort((a,b)=>b.at-a.at)[0];
   const market=position?(markets.find(m=>m.ticker===position.ticker)||null):markets[0];
   if(!market)return {asset,action:'WAIT',reason:position?'Open paper position requires fresh quotes for its exact ticker':'No verified active contract',ticker:position?.ticker||null};
   const listed=await db.list({prefix:'samples/'+asset+'/',limit:30});
   const records=(await Promise.all(listed.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
   const signal=paperSignal(market,records,position||null,now);
   return {asset,...signal,position:position?{side:position.side,ask:position.ask,qty:position.qty,ticker:position.ticker,source:'server paper ledger'}:null};
  }catch(e){return {asset,action:'WAIT',score:0,reason:'Feed unavailable: '+String(e.message),ticker:null}}
 }));
 return json({fetched_at:new Date(now).toISOString(),source:'Shared read-only Kalshi paper research signals',results});
};
