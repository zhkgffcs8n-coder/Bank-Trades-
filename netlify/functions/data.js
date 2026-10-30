const SERIES={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const reply=(code,obj)=>({statusCode:code,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(obj)});
async function get(url,timeout=7000){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
 try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw Error('Upstream HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}
}
const base='https://api.elections.kalshi.com/trade-api/v2';
exports.handler=async event=>{
 if(event.httpMethod!=='GET')return reply(405,{error:'GET only'});
 const q=event.queryStringParameters||{};
 try{
 if((q.mode||'markets')==='markets'){
  const results=await Promise.all(Object.entries(SERIES).map(async ([asset,series])=>{
   try{
    const u=base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'100'});
    const d=await get(u);
    const now=Date.now();
    const arr=(d.markets||[]).filter(m=>{
      const expiry=Date.parse(m.expected_expiration_time||m.expiration_time||m.close_time);
      const remaining=expiry-now;
      return (m.status==='active'||m.status==='open') && Number.isFinite(expiry) && remaining>0 && remaining<=16*60*1000;
    }).sort((a,b)=>Date.parse(a.expected_expiration_time||a.expiration_time||a.close_time)-Date.parse(b.expected_expiration_time||b.expiration_time||b.close_time));
    return {asset,series,market:arr[0]||null,available:true};
   }catch(e){return {asset,series,market:null,available:false,error:String(e.message).slice(0,100)}}
  }));
  return reply(200,{source:'Kalshi public API',fetched_at:new Date().toISOString(),results});
 }
 if(q.mode==='orderbook'){
  const ticker=String(q.ticker||'');
  if(!/^[A-Z0-9-]{6,100}$/.test(ticker))return reply(400,{error:'Invalid ticker'});
  const d=await get(base+'/markets/'+encodeURIComponent(ticker)+'/orderbook?depth=10');
  return reply(200,{fetched_at:new Date().toISOString(),orderbook:d.orderbook||d});
 }
 if(q.mode==='spot'){
  const asset=String(q.asset||'').toUpperCase();
  if(!SERIES[asset])return reply(400,{error:'Invalid asset'});
  const d=await get('https://api.coinbase.com/v2/prices/'+asset+'-USD/spot',5000);
  const price=Number(d?.data?.amount);
  if(!Number.isFinite(price)||price<=0)throw Error('Spot unavailable');
  return reply(200,{asset,price,fetched_at:new Date().toISOString(),source:'Coinbase spot (not Kalshi settlement oracle)'});
 }
 return reply(404,{error:'Unknown mode'});
 }catch(e){return reply(502,{error:'Feed unavailable',detail:String(e.message).slice(0,150)})}
};
