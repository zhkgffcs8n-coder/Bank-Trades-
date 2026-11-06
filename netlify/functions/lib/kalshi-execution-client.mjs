import {createPrivateKey,sign,constants} from 'node:crypto';
export function signedHeaders({keyId,privateKeyPem},method,path,now=Date.now()){
 const timestamp=String(now);
 return {'KALSHI-ACCESS-KEY':keyId,'KALSHI-ACCESS-TIMESTAMP':timestamp,
 'KALSHI-ACCESS-SIGNATURE':sign('sha256',Buffer.from(timestamp+method+path.split('?')[0]),{key:createPrivateKey(privateKeyPem),padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:constants.RSA_PSS_SALTLEN_DIGEST}).toString('base64'),Accept:'application/json','Content-Type':'application/json'};
}
export function kalshiClient(credentials,{fetchImpl=fetch,environment='production',allowWrites=false,allowCancellation=false}={}){
 if(!['production','demo'].includes(environment))throw Error('INVALID_ENVIRONMENT');
 const base=environment==='production'?'https://external-api.kalshi.com':'https://external-api.demo.kalshi.co';
 async function request(method,path,body){
  if(!path.startsWith('/trade-api/v2/')||path.includes('..'))throw Error('INVALID_PATH');
  if(method!=='GET'&&!allowWrites&&!(method==='DELETE'&&allowCancellation&&path.startsWith('/trade-api/v2/portfolio/events/orders/')))throw Error('EXCHANGE_WRITES_DISABLED');
  const signal=AbortSignal.timeout(7000);
  for(let attempt=0;;attempt++){
   const response=await fetchImpl(base+path,{method,headers:signedHeaders(credentials,method,path),redirect:'error',signal,...(body?{body:JSON.stringify(body)}:{})});
   if(response.ok)return response.json();
   if(method!=='GET'||response.status!==429||attempt>=2)throw Error('KALSHI_HTTP_'+response.status);
   const retryAfter=response.headers?.get('retry-after');
   const delay=retryAfter==null?500*2**attempt:/^\d+$/.test(retryAfter)?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now();
   if(!Number.isFinite(delay)||delay>2000)throw Error('KALSHI_HTTP_429');
   await response.body?.cancel();
   await new Promise(resolve=>setTimeout(resolve,Math.max(100,delay)));
  }
 }
 async function pages(path,field){
  const all=[],seen=new Set();let cursor='';
  for(let n=0;n<100;n++){
   const query=new URLSearchParams({limit:'100',...(cursor?{cursor}:{})});
   const page=await request('GET',path+'?'+query);
   if(!Array.isArray(page[field]))throw Error('INVALID_'+field.toUpperCase());
   all.push(...page[field]);if(!page.cursor)return all;
   if(seen.has(page.cursor))throw Error('CURSOR_LOOP');seen.add(page.cursor);cursor=page.cursor;
  }throw Error('PAGINATION_LIMIT');
 }
 return {request,pages,
  async snapshot(){
   const balance=await request('GET','/trade-api/v2/portfolio/balance');
   const orders=await pages('/trade-api/v2/portfolio/orders','orders');
   const fills=await pages('/trade-api/v2/portfolio/fills','fills');
   const positions=await pages('/trade-api/v2/portfolio/positions','market_positions');
   const settlements=await pages('/trade-api/v2/portfolio/settlements','settlements');
   return {balanceCents:balance.balance,orders,fills,positions,settlements,at:Date.now(),complete:true};
  },
  create:body=>request('POST','/trade-api/v2/portfolio/events/orders',body),
  cancel:order=>request('DELETE','/trade-api/v2/portfolio/events/orders/'+encodeURIComponent(order.order_id)+'?'+new URLSearchParams({market_ticker:order.ticker}))};
}
