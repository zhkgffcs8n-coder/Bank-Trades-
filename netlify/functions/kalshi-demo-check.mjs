import {getStore} from '@netlify/blobs';
import {kalshiClient} from './lib/kalshi-execution-client.mjs';

export async function checkDemoConnection(env=process.env,fetchImpl=fetch){
 const keyId=env.KALSHI_DEMO_KEY_ID?.trim();
 const privateKeyPem=env.KALSHI_DEMO_PRIVATE_KEY?.replace(/\\n/g,'\n').trim();
 if(!keyId||!privateKeyPem)return 'DEMO_CREDENTIALS_MISSING';
 try{
  const client=kalshiClient({keyId,privateKeyPem},{environment:'demo',fetchImpl});
  const balance=await client.request('GET','/trade-api/v2/portfolio/balance');
  return Number.isSafeInteger(balance?.balance)&&balance.balance>=0?'DEMO_AUTHENTICATED':'DEMO_INVALID_BALANCE_RESPONSE';
 }catch(error){
  return /^KALSHI_HTTP_\d{3}$/.test(error.message)?error.message:'DEMO_KEY_OR_TRANSPORT_ERROR';
 }
}

export default async()=>{
 const store=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 const commit=process.env.COMMIT_REF||null;
 const previous=await store.get('connection',{type:'json'});
 if(commit&&previous?.commit===commit&&previous.status==='DEMO_AUTHENTICATED')return new Response(null,{status:204});
 await store.setJSON('connection',{status:await checkDemoConnection(),checkedAt:new Date().toISOString(),commit});
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};
