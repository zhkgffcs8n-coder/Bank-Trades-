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
 let [mark,interest,ratio,depth,trades,...flow]=await Promise.all([
  get('/fapi/v1/premiumIndex'),get('/fapi/v1/openInterest'),
  get('/futures/data/globalLongShortAccountRatio',{period:'5m',limit:1}),
  get('/fapi/v1/depth',{limit:20}),get('/fapi/v1/aggTrades',{limit:1000}),
  ...windows.map(period=>get('/futures/data/takerlongshortRatio',{period,limit:1}))
 ]);
 let source='Binance BTCUSDT perpetual';
 if(!mark&&!interest&&!depth){
  const read=async endpoint=>{
   try{
    const response=await fetch('https://futures.kraken.com/derivatives/api/v3/'+endpoint+'?symbol=PF_XBTUSD',{signal:AbortSignal.timeout(2500)});
    return response.ok?await response.json():null;
   }catch{return null;}
  };
  const [ticker,book,history]=await Promise.all(['tickers','orderbook','history'].map(read));
  const market=ticker?.tickers?.find(t=>t.symbol==='PF_XBTUSD'&&!t.suspended);
  source='Kraken BTC/USD perpetual';
  mark=market?{markPrice:market.markPrice,lastFundingRate:market.relativeFundingRate}:null;
  interest=market?{openInterest:market.openInterest}:null;
  ratio=null;
  flow=[];
  const orderBook=book?.orderBook;
  depth=Array.isArray(orderBook?.bids)&&Array.isArray(orderBook?.asks)?{
   bids:orderBook.bids.sort((a,b)=>b[0]-a[0]).slice(0,20),
   asks:orderBook.asks.sort((a,b)=>a[0]-b[0]).slice(0,20)
  }:null;
  trades=history?.history?.filter(t=>t.type==='fill'&&(t.side==='buy'||t.side==='sell')).map(t=>({T:Date.parse(t.time),m:t.side==='sell',p:t.price,q:t.size}));
 }
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
 const tape=Array.isArray(trades)?trades.filter(t=>Number.isFinite(t.T)&&t.T<=now&&typeof t.m==='boolean'&&Number(t.p)>0&&Number(t.q)>0&&Number.isFinite(Number(t.p)*Number(t.q))):[];
 const slices=windows.map((window,i)=>{
  const duration=[5,15,60][i]*60000,cutoff=now-duration;
  const row=flow[i]?.[0],buy=numeric(row?.buyVol),sell=numeric(row?.sellVol),time=numeric(row?.timestamp);
  const providerDelta=buy!=null&&sell!=null&&buy+sell>0&&time!=null&&now-time>=0&&now-time<=duration*3?(buy-sell)/(buy+sell)*100:null;
  const recent=tape.filter(t=>t.T>=cutoff);
  const large=recent.filter(t=>Number(t.p)*Number(t.q)>=250000);
  const coverage=tape.length&&tape.some(t=>t.T<=cutoff)&&now-Math.max(...tape.map(t=>t.T))<60000;
  const volume=recent.reduce((sum,t)=>sum+Number(t.q),0);
  const delta=providerDelta??(coverage&&volume>0?recent.reduce((sum,t)=>sum+(t.m?-1:1)*Number(t.q),0)/volume*100:null);
  return {window,delta,whales:coverage?{
   net:large.reduce((sum,t)=>sum+(t.m?-1:1)*Number(t.p)*Number(t.q),0),
   buys:large.filter(t=>!t.m).length,sells:large.filter(t=>t.m).length
  }:null};
 });
 const funding=numeric(mark?.lastFundingRate);
 return new Response(JSON.stringify({
  source,book,slices,
  fundingPct:funding==null?null:funding*100,
  openInterest:markPrice!=null&&contracts!=null?markPrice*contracts:null,
  longShort:numeric(ratio?.[0]?.longShortRatio)
 }),{headers:cacheHeaders});
}
