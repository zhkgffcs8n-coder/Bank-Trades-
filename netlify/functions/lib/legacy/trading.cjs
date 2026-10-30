// DEMO ONLY authenticated relay; the server never receives or stores private key material.
const allowed={"GET:/portfolio/balance":true,"POST:/portfolio/events/orders":true};
const base='https://demo-api.kalshi.co/trade-api/v2';
const json=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(body)});
exports.handler=async(event)=>{
 if(!['GET','POST'].includes(event.httpMethod))return json(405,{error:'Method blocked'});
 const path=event.httpMethod==='GET'?'/portfolio/balance':'/portfolio/events/orders';
 if(!allowed[event.httpMethod+':'+path])return json(403,{error:'Not allowed'});
 // Never accept a raw private key, PEM, or other credentials in the body.
 if(event.body?.includes('PRIVATE KEY')||event.body?.includes('private_key'))return json(400,{error:'Private keys must not be transmitted'});
 const h=event.headers||{};const key=h['kalshi-access-key'];const sig=h['kalshi-access-signature'];const ts=h['kalshi-access-timestamp'];
 if(!/^[a-zA-Z0-9-]{10,100}$/.test(key||'')||!/^[A-Za-z0-9+/=]{40,1000}$/.test(sig||'')||!/^\d{13}$/.test(ts||'')||Math.abs(Date.now()-Number(ts))>20000)return json(401,{error:'Invalid or expired signature headers'});
 let body;
 if(event.httpMethod==='POST'){
  try{body=JSON.parse(event.body||'');}catch{return json(400,{error:'Invalid JSON'});}
  const keys=Object.keys(body);if(keys.some(k=>!['ticker','client_order_id','side','count','price','time_in_force','self_trade_prevention_type','post_only','cancel_order_on_pause','reduce_only'].includes(k)))return json(400,{error:'Unknown order fields'});
  const n=Number(body.count),p=Number(body.price);
  if(!/^[A-Z0-9-]{4,100}$/.test(body.ticker||'')||!/^\d+\.00$/.test(body.count||'')||!Number.isInteger(n)||n<1||n>2||!Number.isFinite(p)||p<.01||p>.99||n*p>1.98||body.side!=='bid'||body.time_in_force!=='immediate_or_cancel'||body.self_trade_prevention_type!=='taker_at_cross'||body.post_only!==false||body.cancel_order_on_pause!==true||body.reduce_only!==false||! /^[a-f0-9-]{36}$/.test(body.client_order_id||''))return json(400,{error:'Fails DEMO trade hard limits: buy YES only, <=2 contracts, <=$1.98, IOC'});
 }
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);
 try{const r=await fetch(base+path,{method:event.httpMethod,headers:{'Accept':'application/json','Content-Type':'application/json','KALSHI-ACCESS-KEY':key,'KALSHI-ACCESS-SIGNATURE':sig,'KALSHI-ACCESS-TIMESTAMP':ts},body:body?JSON.stringify(body):undefined,signal:controller.signal});
  const result=await r.text();return {statusCode:r.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:result.slice(0,120000)};
 }catch{return json(502,{error:'Demo exchange unavailable or timed out'});}finally{clearTimeout(timer)}
};
