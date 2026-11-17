const base='https://fapi.binance.com';
const symbol='BTCUSDT';
const cacheHeaders={'content-type':'application/json','cache-control':'public, max-age=0, s-maxage=30'};
function numeric(value){
 return value!=null&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
}
async function get(path,params={}){
 try{
  const url=new URL(path,base);
  url.search=new URLSearchParams({symbol,...params});
  const response=await fetch(url,{signal:AbortSignal.timeout(4500)});
  return response.ok?await response.json():null;
 }catch{return null;}
}
export default async function handler(){
 const windows=['5m','15m','1h'];
 const [mark,interest,ratio,depth,trades,...flow]=await Promise.all([
  get('/fapi/v1/premiumIndex'),get('/fapi/v1/openInterest'),
  get('/futures/data/globalLongShortAccountRatio',{period:'5m',limit:1}),
  get('/fapi/v1/depth',{limit:20}),get('/fapi/v1/aggTrades',{limit:1000}),
  ...windows.map(period=>get('/futures/data/takerlongshortRatio',{period,limit:1}))
 ]);
 const now=Date.now(),markPrice=numeric(mark?.markPrice),contracts=numeric(interest?.openInterest);
 const validLevels=levels=>Array.isArray(levels)?levels.map(([p,q])=>[Number(p),Number(q)]).filter(([p,q])=>p>0&&q>0&&Number.isFinite(p*q)):[];
 const bids=validLevels(depth?.bids),asks=validLevels(depth?.asks);
 const wall=levels=>levels.reduce((best,[price,qty])=>price*qty>(best?.usd||0)?{price,usd:price*qty}:best,null);
 const bidTotal=bids.reduce((sum,[p,q])=>sum+p*q,0),askTotal=asks.reduce((sum,[p,q])=>sum+p*q,0);
 const book=bids.length&&asks.length&&asks[0][0]>=bids[0][0]?{
  imbalance:(bidTotal-askTotal)/(bidTotal+askTotal)*100,
  spreadBps:(asks[0][0]-bids[0][0])/((asks[0][0]+bids[0][0])/2)*10000,bidWall:wall(bids),askWall:wall(asks)
 }:null;
 // Binance aggregate fills can combine executions from one taker order at one price.
 const tape=Array.isArray(trades)?trades.filter(t=>Number.isFinite(t.T)&&t.T<=now&&typeof t.m==='boolean'):[];
 const slices=windows.map((window,i)=>{
  const duration=[5,15,60][i]*60000,cutoff=now-duration;
  const row=flow[i]?.[0],buy=numeric(row?.buyVol),sell=numeric(row?.sellVol),time=numeric(row?.timestamp);
  const delta=buy!=null&&sell!=null&&buy+sell>0&&time!=null&&now-time>=0&&now-time<=duration*3?(buy-sell)/(buy+sell)*100:null;
  const recent=tape.filter(t=>t.T>=cutoff);
  const large=recent.filter(t=>Number(t.p)*Number(t.q)>=250000);
  const coverage=tape.length&&tape.some(t=>t.T<=cutoff)&&now-Math.max(...tape.map(t=>t.T))<60000;
  return {window,delta,whales:coverage?{
   net:large.reduce((sum,t)=>sum+(t.m?-1:1)*Number(t.p)*Number(t.q),0),
   buys:large.filter(t=>!t.m).length,sells:large.filter(t=>t.m).length
  }:null};
 });
 const funding=numeric(mark?.lastFundingRate);
 return new Response(JSON.stringify({
  source:'Binance BTCUSDT perpetual',book,slices,
  fundingPct:funding==null?null:funding*100,
  openInterest:markPrice!=null&&contracts!=null?markPrice*contracts:null,
  longShort:numeric(ratio?.[0]?.longShortRatio)
 }),{headers:cacheHeaders});
}
