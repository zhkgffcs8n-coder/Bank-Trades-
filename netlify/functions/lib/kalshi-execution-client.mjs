import {createPrivateKey,sign,constants} from 'node:crypto';
export function signedHeaders({keyId,privateKeyPem},method,path,now=Date.now()){
 const timestamp=String(now),key=createPrivateKey(privateKeyPem);
 const message=Buffer.from(timestamp+method+path.split('?')[0]);
 let signature;
 if(key.asymmetricKeyType==='ed25519')signature=sign(null,message,key);
 else if(key.asymmetricKeyType==='rsa')signature=sign('sha256',message,{key,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:constants.RSA_PSS_SALTLEN_DIGEST});
 else throw Error('UNSUPPORTED_KALSHI_KEY_TYPE');
 return {'KALSHI-ACCESS-KEY':keyId,'KALSHI-ACCESS-TIMESTAMP':timestamp,
 'KALSHI-ACCESS-SIGNATURE':signature.toString('base64'),Accept:'application/json','Content-Type':'application/json'};
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
   if(method!=='GET'||response.status!==429||attempt>=2){
    const error=Error('KALSHI_HTTP_'+response.status);
    if(environment==='demo'&&method==='POST'){
     const data=await response.json().catch(()=>null);
     const code=data?.error?.code;
     if(typeof code==='string'&&/^[a-z][a-z_]{2,45}$/.test(code))error.exchangeCode=code;
    }
    throw error;
   }
   const retryAfter=response.headers?.get('retry-after');
   const delay=retryAfter==null?500*2**attempt:/^\d+$/.test(retryAfter)?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now();
   if(!Number.isFinite(delay)||delay>2000)throw Error('KALSHI_HTTP_429');
   await response.body?.cancel();
   await new Promise(resolve=>setTimeout(resolve,Math.max(100,delay)));
  }
 }
 async function pages(path,field,filters={}){
  const all=[],seen=new Set();let cursor='';
  for(let n=0;n<100;n++){
   const query=new URLSearchParams({...filters,limit:'100',...(cursor?{cursor}:{})});
   const page=await request('GET',path+'?'+query);
   if(!Array.isArray(page[field]))throw Error('INVALID_'+field.toUpperCase());
   all.push(...page[field]);if(!page.cursor)return all;
   if(seen.has(page.cursor))throw Error('CURSOR_LOOP');seen.add(page.cursor);cursor=page.cursor;
  }throw Error('PAGINATION_LIMIT');
 }
 return {request,pages,
  async buyingPower(exchangeIndex){
   if(!Number.isSafeInteger(exchangeIndex)||exchangeIndex<0)throw Error('INVALID_EXCHANGE_INDEX');
   const result=await request('GET','/trade-api/v2/portfolio/balance?'+new URLSearchParams({exchange_index:exchangeIndex}));
   if(!Number.isSafeInteger(result?.balance)||result.balance<0)throw Error('INVALID_EXCHANGE_BALANCE');
   return result.balance;
  },
  async snapshot(){
   const startedAt=Date.now();
   // Diagnostic-only phase marker. Preserve the original error and request order.
   // The Demo runner may translate this fixed marker into a sanitized receipt.
   let snapshotPhase='BALANCE';
   try{
    const balance=await request('GET','/trade-api/v2/portfolio/balance');
    snapshotPhase='ORDERS';
    const orders=await pages('/trade-api/v2/portfolio/orders','orders');
    snapshotPhase='FILLS';
    const fills=await pages('/trade-api/v2/portfolio/fills','fills');
    snapshotPhase='POSITIONS';
    const positions=await pages('/trade-api/v2/portfolio/positions','market_positions');
    snapshotPhase='SETTLEMENTS';
    const settlements=await pages('/trade-api/v2/portfolio/settlements','settlements');
    return {balanceCents:balance.balance,orders,fills,positions,settlements,at:startedAt,complete:true};
   }catch(error){
    if(error&&typeof error==='object')error.snapshotPhase=snapshotPhase;
    throw error;
   }
  },
  create:body=>request('POST','/trade-api/v2/portfolio/events/orders',body),
  cancel:order=>request('DELETE','/trade-api/v2/portfolio/events/orders/'+encodeURIComponent(order.order_id)+'?'+new URLSearchParams({market_ticker:order.ticker,...(Number.isSafeInteger(order.exchange_index)&&order.exchange_index>=0?{exchange_index:order.exchange_index}:{})}))};
}
