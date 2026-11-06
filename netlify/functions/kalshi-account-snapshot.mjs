// Owner-only, read-only Kalshi account snapshot. Never places or cancels orders.
import {getStore} from '@netlify/blobs';
import {createPrivateKey,sign,constants} from 'node:crypto';
import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';

const base='https://api.elections.kalshi.com';
const paths=['/trade-api/v2/portfolio/balance','/trade-api/v2/portfolio/positions','/trade-api/v2/portfolio/orders'];
function signature(key,timestamp,path){
 return sign('sha256',Buffer.from(timestamp+'GET'+path),{
  key,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:constants.RSA_PSS_SALTLEN_DIGEST
 }).toString('base64');
}
async function read(path,keyId,key){
 const timestamp=String(Date.now());
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),7000);
 try{
  const response=await fetch(base+path,{
   method:'GET',
   headers:{
    'KALSHI-ACCESS-KEY':keyId,
    'KALSHI-ACCESS-TIMESTAMP':timestamp,
    'KALSHI-ACCESS-SIGNATURE':signature(key,timestamp,path),
    Accept:'application/json'
   },signal:controller.signal
  });
  if(!response.ok)throw Error('Kalshi read-only request failed: HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timeout)}
}
export default async function(req){
 try{
  if(req.method!=='GET')fail(405,'Method not allowed');
  const user=await owner();
  const secret=process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY;
  if(!/^[a-fA-F0-9]{64}$/.test(secret||''))fail(503,'Server encryption unavailable');
  const store=getStore({name:'bank-trades-kalshi-credentials',consistency:'strong'});
  const record=await store.get('credentials/'+user.id,{type:'json'});
  if(!record?.envelope)fail(409,'Kalshi API credentials not connected');
  const {keyId,privateKeyPem}=openKalshiCredentials({
   userId:user.id,envelope:record.envelope,secret
  });
  const key=createPrivateKey(privateKeyPem);
  // Independent snapshots only. These are not proof of fill reconciliation.
  const [balance,positions,orders]=await Promise.all(paths.map(p=>read(p,keyId,key)));
  return json({
   connected:true,readOnly:true,liveOrdersEnabled:false,checkedAt:Date.now(),
   balance:balance?.balance??null,
   portfolioValue:balance?.portfolio_value??null,
   positionsReturned:Array.isArray(positions?.market_positions)?positions.market_positions.length:null,
   ordersReturned:Array.isArray(orders?.orders)?orders.orders.length:null,
   positionsHaveMore:!!positions?.cursor,
   ordersHaveMore:!!orders?.cursor,
   reconciled:false,
   note:'Read-only first-page snapshots. Cursor pagination, order-fill matching and live execution remain unverified.'
  });
 }catch(e){return errorResponse(e)}
}
