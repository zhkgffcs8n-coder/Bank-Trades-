// Public spot-price multi-timeframe context. Descriptive research, never an order signal.
const products={BTC:'BTC-USD',ETH:'ETH-USD',SOL:'SOL-USD',XRP:'XRP-USD',DOGE:'DOGE-USD'};
const frames=[1,5,15,30,60];
export function summarizeSpotCandles(rows,now=Date.now()){
 const candles=rows.map(r=>({t:Number(r[0])*1000,close:Number(r[4])})).filter(r=>Number.isFinite(r.t)&&Number.isFinite(r.close)&&r.close>0&&r.t<=now-60000&&r.t>=now-4*3600000).sort((a,b)=>a.t-b.t);
 const unique=candles.filter((r,i)=>i===0||r.t!==candles[i-1].t);
 const last=unique.at(-1),fresh=!!last&&now-last.t<=180000;
 const timeframes=frames.map(minutes=>{
  // Compare non-overlapping completed windows; do not claim each is an independent signal.
  const end=last?.t;
  const current=unique.filter(r=>r.t>end-minutes*60000&&r.t<=end);
  const previous=unique.filter(r=>r.t>end-2*minutes*60000&&r.t<=end-minutes*60000);
  const valid=fresh&&current.length>=minutes&&previous.length>=minutes;
  const change=valid?(current.at(-1).close/previous.at(-1).close-1)*100:null;
  return {minutes,valid,changePct:change===null?null:Number(change.toFixed(4)),trend:change===null?'UNAVAILABLE':change>.03?'UP':change<-.03?'DOWN':'FLAT',reason:valid?null:'Missing complete, fresh minute candles'};
 });
 return {fresh,latestCandleAt:last?.t||null,latestPrice:last?.close||null,timeframes,source:'Coinbase Exchange completed one-minute USD spot candles',researchOnly:true};
}
export default async function handler(req){
 const asset=String(new URL(req.url).searchParams.get('asset')||'BTC').toUpperCase();
 if(!products[asset])return new Response(JSON.stringify({asset,error:'No supported USD spot reference; do not substitute another asset'}),{status:422,headers:{'content-type':'application/json','cache-control':'no-store'}});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const url='https://api.exchange.coinbase.com/products/'+products[asset]+'/candles?granularity=60';
  const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'BankTradesResearch/1.0'}});
  if(!response.ok)throw Error('Spot source HTTP '+response.status);
  const rows=await response.json();if(!Array.isArray(rows))throw Error('Invalid spot response');
  return new Response(JSON.stringify({asset,at:Date.now(),...summarizeSpotCandles(rows)}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
 }catch(e){return new Response(JSON.stringify({asset,error:'Spot timeframe feed unavailable',detail:String(e.message).slice(0,120)}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}})}finally{clearTimeout(timer)}
}
