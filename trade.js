const crypto=require('crypto');
const BASE='https://external-api.kalshi.com';
const API='/trade-api/v2';
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(statusCode,body)=>({statusCode,headers:JSON_HEADERS,body:JSON.stringify(body)});
const keyId=()=>process.env.KALSHI_API_KEY_ID||'';
const privatePem=()=>String(process.env.KALSHI_PRIVATE_KEY||'').replace(/\\n/g,'\n');
function sign(method,path){const ts=String(Date.now()),key=crypto.createPrivateKey(privatePem()),msg=Buffer.from(ts+method+path.split('?')[0]);let sig;if(key.asymmetricKeyType==='ed25519')sig=crypto.sign(null,msg,key);else sig=crypto.sign('sha256',msg,{key,padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32});return {ts,sig:sig.toString('base64')};}
async function kalshi(method,path,body){if(!keyId()||!privatePem())throw Object.assign(Error('Kalshi credentials not configured'),{status:503});const {ts,sig}=sign(method,path);const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);try{const r=await fetch(BASE+path,{method,signal:ctl.signal,headers:{Accept:'application/json','Content-Type':'application/json','KALSHI-ACCESS-KEY':keyId(),'KALSHI-ACCESS-TIMESTAMP':ts,'KALSHI-ACCESS-SIGNATURE':sig},body:body?JSON.stringify(body):undefined});const txt=await r.text();let data;try{data=JSON.parse(txt)}catch{data={message:txt.slice(0,500)}}if(!r.ok)throw Object.assign(Error(data.message||data.error||('Kalshi HTTP '+r.status)),{status:r.status,data});return data}finally{clearTimeout(timer)}}
const tickerOK=t=>/^[A-Z0-9-]{6,100}$/.test(String(t||''));
exports.handler=async event=>{if(event.httpMethod==='OPTIONS')return reply(204,{});let input={};try{input=event.body?JSON.parse(event.body):{}}catch{return reply(400,{error:'Invalid JSON'})}const action=String(input.action||event.queryStringParameters?.action||'status');try{
 if(action==='status'){if(!keyId()||!privatePem())return reply(200,{configured:false,live_enabled:false,message:'Add KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY in Netlify environment variables.'});const bal=await kalshi('GET',API+'/portfolio/balance');return reply(200,{configured:true,live_enabled:process.env.ENABLE_LIVE_TRADING==='true',balance:bal});}
 if(action==='positions'){return reply(200,await kalshi('GET',API+'/portfolio/positions?count_filter=position'));}
 if(action==='orders'){return reply(200,await kalshi('GET',API+'/portfolio/orders?status=resting'));}
 if(action==='cancel'){if(process.env.ENABLE_LIVE_TRADING!=='true')return reply(403,{error:'Live trading disabled by server'});if(!input.order_id||!tickerOK(input.ticker))return reply(400,{error:'order_id and valid ticker required'});const p=API+'/portfolio/events/orders/'+encodeURIComponent(input.order_id)+'?market_ticker='+encodeURIComponent(input.ticker);return reply(200,await kalshi('DELETE',p));}
 if(action==='order'){
   if(process.env.ENABLE_LIVE_TRADING!=='true')return reply(403,{error:'Live trading disabled by server'});
   const ticker=String(input.ticker||''),side=input.side==='ask'?'ask':'bid',count=Number(input.count),price=Number(input.price);
   const maxContracts=Math.max(1,Number(process.env.MAX_CONTRACTS_PER_ORDER||25)); const maxCost=Math.max(1,Number(process.env.MAX_ORDER_COST_USD||50));
   if(!tickerOK(ticker)||!Number.isFinite(count)||count<=0||count>maxContracts||!Number.isFinite(price)||price<=0||price>=1)return reply(400,{error:'Order rejected by validation/risk limits'});
   if(side==='bid'&&count*price>maxCost)return reply(400,{error:'Order exceeds MAX_ORDER_COST_USD'});
   const body={ticker,side,count:count.toFixed(2),price:price.toFixed(4),time_in_force:'immediate_or_cancel',self_trade_prevention_type:'taker_at_cross',client_order_id:crypto.randomUUID(),cancel_order_on_pause:true};
   const out=await kalshi('POST',API+'/portfolio/events/orders',body);return reply(201,out);
 }
 return reply(400,{error:'Unsupported action'});
}catch(e){return reply(Number(e.status)||502,{error:String(e.message).slice(0,240),detail:e.data||undefined})}};
