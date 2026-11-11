import {randomUUID,createPrivateKey} from 'node:crypto';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {getStore} from '@netlify/blobs';
import {kalshiClient} from './lib/kalshi-execution-client.mjs';

export async function checkDemoConnection(env=process.env,fetchImpl=fetch){
 const keyId=env.KALSHI_DEMO_KEY_ID?.trim();
 const privateKeyPem=env.KALSHI_DEMO_PRIVATE_KEY?.replace(/\\n/g,'\n').trim();
 if(!keyId||!privateKeyPem)return 'DEMO_CREDENTIALS_MISSING';
 try{
  if(!['rsa','ed25519'].includes(createPrivateKey(privateKeyPem).asymmetricKeyType))return 'DEMO_PRIVATE_KEY_UNSUPPORTED_TYPE';
 }catch{return 'DEMO_PRIVATE_KEY_INVALID_PEM';}
 try{
  const client=kalshiClient({keyId,privateKeyPem},{environment:'demo',fetchImpl});
  const balance=await client.request('GET','/trade-api/v2/portfolio/balance');
  return Number.isSafeInteger(balance?.balance)&&balance.balance>=0?'DEMO_AUTHENTICATED':'DEMO_INVALID_BALANCE_RESPONSE';
 }catch(error){
  return /^KALSHI_HTTP_\d{3}$/.test(error.message)?error.message:'DEMO_TRANSPORT_ERROR';
 }
}

export default async()=>{
 const store=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 const commit=process.env.COMMIT_REF||null;
 const saved=await store.get('uploaded-connection',{type:'json'});
 if(saved?.status==='DEMO_AUTHENTICATED'){
  const previous=await store.get('saved-balance-probe',{type:'json'});
  if(commit&&previous?.commit===commit&&previous.credentialCheckedAt===saved.checkedAt)return new Response(null,{status:204});
  const requestId=randomUUID(),startedAt=Date.now();
  const ownerId=process.env.KALSHI_LIVE_OWNER_ID;
  let status='DEMO_OWNER_MISSING';
  if(ownerId){
   let credentials;
   try{
    credentials=openKalshiCredentials({userId:'demo-'+ownerId,envelope:saved.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
   }catch{status='DEMO_CREDENTIAL_ENVELOPE_UNAVAILABLE';}
   if(credentials)status=await checkDemoConnection({
    KALSHI_DEMO_KEY_ID:credentials.keyId,KALSHI_DEMO_PRIVATE_KEY:credentials.privateKeyPem
   });
  }
  const receipt={status,requestId,commit,operation:'GET_PORTFOLIO_BALANCE',
   checkedAt:new Date().toISOString(),durationMs:Date.now()-startedAt};
  await store.setJSON('saved-balance-probe',{...receipt,credentialCheckedAt:saved.checkedAt??null});
  console.info(JSON.stringify({event:'DEMO_SAVED_BALANCE_PROBE',...receipt}));
  return new Response(null,{status:204});
 }
 const previous=await store.get('connection',{type:'json'});
 if(commit&&previous?.commit===commit&&previous.status==='DEMO_AUTHENTICATED')return new Response(null,{status:204});
 await store.setJSON('connection',{status:await checkDemoConnection(),checkedAt:new Date().toISOString(),commit});
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};
