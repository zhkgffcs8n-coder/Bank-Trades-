// Owner-only, read-only Kalshi account connection verification. Never places orders.
import {createSign,constants} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';

export default async function(req){
 try{
  if(req.method!=='GET')fail(405,'GET only');
  const user=await owner();
  const store=getStore({name:'bank-trades-kalshi-credentials',consistency:'strong'});
  const record=await store.get('credentials/'+user.id,{type:'json'});
  if(!record?.envelope)return json({connected:false,credentialsStored:false,liveOrdersEnabled:false,status:'NOT_CONFIGURED'});
  if(!process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY)return json({connected:false,credentialsStored:true,liveOrdersEnabled:false,status:'ENCRYPTION_UNAVAILABLE'},503);
  let credentials;
  try{credentials=openKalshiCredentials({userId:user.id,envelope:record.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY})}
  catch{return json({connected:false,credentialsStored:true,liveOrdersEnabled:false,status:'DECRYPTION_FAILED'},503)}
  const path='/trade-api/v2/portfolio/balance',timestamp=String(Date.now());
  const signer=createSign('RSA-SHA256');
  signer.update(timestamp+'GET'+path);signer.end();
  const signature=signer.sign({key:credentials.privateKeyPem,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:constants.RSA_PSS_SALTLEN_DIGEST},'base64');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
  try{
   const response=await fetch('https://api.elections.kalshi.com'+path,{signal:controller.signal,headers:{
    'KALSHI-ACCESS-KEY':credentials.keyId,'KALSHI-ACCESS-TIMESTAMP':timestamp,'KALSHI-ACCESS-SIGNATURE':signature,Accept:'application/json'
   }});
   if(!response.ok)return json({connected:false,credentialsStored:true,liveOrdersEnabled:false,status:response.status===401||response.status===403?'AUTH_FAILED':'REMOTE_UNAVAILABLE',httpStatus:response.status},response.status===401||response.status===403?401:503);
   const account=await response.json();
   return json({connected:true,credentialsStored:true,liveOrdersEnabled:false,status:'READ_ONLY_CONNECTED',balanceCents:account.balance??null,portfolioValueCents:account.portfolio_value??null,checkedAt:Date.now()});
  }finally{clearTimeout(timeout)}
 }catch(e){return errorResponse(e)}
}
