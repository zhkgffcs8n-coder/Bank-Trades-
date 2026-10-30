// Independent Coinbase public spot reference. No keys or private trading endpoints.
const symbols={BTC:'BTC-USD',ETH:'ETH-USD',SOL:'SOL-USD',XRP:'XRP-USD',DOGE:'DOGE-USD',BNB:'BNB-USD',HYPE:'HYPE-USD',ZEC:'ZEC-USD'};
exports.handler=async(event)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 if(event.httpMethod!=='GET')return {statusCode:405,headers,body:JSON.stringify({error:'GET only'})};
 const entries=await Promise.all(Object.entries(symbols).map(async([coin,pair])=>{
  try{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),5000);
   let r;try{r=await fetch('https://api.coinbase.com/v2/prices/'+encodeURIComponent(pair)+'/spot',{signal:controller.signal,headers:{Accept:'application/json'}})}finally{clearTimeout(timeout)}
   if(!r.ok)throw Error('source unavailable');const j=await r.json();const price=Number(j?.data?.amount);if(!Number.isFinite(price)||price<=0)throw Error('invalid');return [coin,{price,source:'Coinbase spot'}];
  }catch(e){return [coin,null]}
 }));
 const prices=Object.fromEntries(entries);const n=Object.values(prices).filter(Boolean).length;
 return {statusCode:200,headers,body:JSON.stringify({fetchedAt:new Date().toISOString(),status:n===8?'complete':n?'partial':'offline',prices})};
};
