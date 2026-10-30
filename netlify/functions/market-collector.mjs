import {getStore} from '@netlify/blobs';

const SERIES={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const base='https://api.elections.kalshi.com/trade-api/v2';
const store=()=>getStore({name:'bank-trades-market-history',consistency:'strong'});
const price=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars']):m?.[k]!=null?Number(m[k])/100:null;
async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}finally{clearTimeout(t)}}
function expiry(m,now){return [m.expected_expiration_time,m.expiration_time,m.close_time].map(Date.parse).filter(x=>Number.isFinite(x)&&x>now).sort((a,b)=>a-b)[0]||null}
export default async()=>{
 const db=store(),now=Date.now(),bucket=Math.floor(now/60000)*60000;
 await Promise.all(Object.entries(SERIES).map(async([asset,series])=>{try{
  const d=await get(base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'100'}));
  const markets=(d.markets||[]).map(m=>({...m,_expiry:expiry(m,now)})).filter(m=>m._expiry&&m._expiry-now<=16*60000).sort((a,b)=>a._expiry-b._expiry);
  const m=markets[0];if(!m)return;
  const yesBid=price(m,'yes_bid'),yesAsk=price(m,'yes_ask'),noBid=price(m,'no_bid'),noAsk=price(m,'no_ask');
  if(![yesBid,yesAsk,noBid,noAsk].every(Number.isFinite)||yesAsk<yesBid||noAsk<noBid)return;
  const record={asset,ticker:m.ticker,t:bucket,expiresAt:m._expiry,yesBid,yesAsk,noBid,noAsk,yesMid:(yesBid+yesAsk)/2,spread:Math.max(yesAsk-yesBid,noAsk-noBid),source:'Kalshi public API scheduled sample'};
  await db.setJSON('samples/'+asset+'/'+bucket,record);
  await db.setJSON('latest/'+asset,record);
  await db.setJSON('pending/'+m.ticker,{ticker:m.ticker,asset,expiresAt:m._expiry});
 }catch{}}));
 // Track every sampled contract, not just the latest contract for each asset.
 // This prevents a new 15-minute round from hiding the previous round's settlement.
 try{
  const listed=await db.list({prefix:'pending/',limit:1000});
  const pending=(await Promise.all(listed.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
  for(const rec of pending){
   if(!rec?.ticker||!Number.isFinite(rec.expiresAt)||rec.expiresAt>now-60000)continue;
   const labelKey='outcomes/'+rec.ticker;
   if(await db.get(labelKey,{type:'json'})){await db.delete('pending/'+rec.ticker);continue;}
   try{
    const d=await get(base+'/markets/'+encodeURIComponent(rec.ticker)),m=d.market;
    const value=Number(m?.settlement_value_dollars),result=m?.result;
    const finalized=m?.status==='finalized'&&m?.market_type==='binary'&&m?.is_provisional!==true&&['yes','no'].includes(result)&&value===(result==='yes'?1:0);
    if(finalized){
     await db.setJSON(labelKey,{ticker:rec.ticker,asset:rec.asset,result,settledAt:m.settlement_ts||null,labeledAt:now,source:'Kalshi finalized market record'});
     await db.delete('pending/'+rec.ticker);
    }
   }catch{}
  }
 }catch{}
 // Retention is enforced lazily by the read API; keys are minute buckets and bounded reads are used.
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};
