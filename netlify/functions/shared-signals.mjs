import {getStore} from '@netlify/blobs';
import {paperSignal} from './lib/shared-paper-signals.mjs';
const assets={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export default async req=>{
 if(req.method!=='GET')return json({error:'GET only'},405);
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'}),now=Date.now();
 const results=await Promise.all(Object.entries(assets).map(async([asset,series])=>{
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
   let response;try{response=await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'50'}),{signal:controller.signal});}finally{clearTimeout(timer)}
   if(!response.ok)throw Error('Market HTTP '+response.status);
   const data=await response.json();
   const markets=(data.markets||[]).filter(m=>{const expiry=Date.parse(m.expected_expiration_time||m.expiration_time||m.close_time||'');return Number.isFinite(expiry)&&expiry>now+75000&&expiry<now+930000}).sort((a,b)=>Date.parse(a.expected_expiration_time||a.expiration_time||a.close_time)-Date.parse(b.expected_expiration_time||b.expiration_time||b.close_time));
   const market=markets[0];if(!market)return {asset,action:'WAIT',reason:'No verified active contract',ticker:null};
   const listed=await db.list({prefix:'samples/'+asset+'/',limit:30});
   const records=(await Promise.all(listed.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
   return {asset,...paperSignal(market,records,null,now)};
  }catch(e){return {asset,action:'WAIT',score:0,reason:'Feed unavailable: '+String(e.message),ticker:null}}
 }));
 return json({fetched_at:new Date(now).toISOString(),source:'Shared read-only Kalshi paper research signals',results});
};
