import {getStore} from '@netlify/blobs';
import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {sealKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {checkDemoConnection} from './kalshi-demo-check.mjs';

export default async req=>{try{
 const store=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 if(req.method==='GET'){
  const uploaded=await store.get('uploaded-connection',{type:'json'});
  const result=uploaded||await store.get('connection',{type:'json'});
  const latest=await store.get('order-test/v4',{type:'json'});
  const test=latest||await store.get('order-test/v3',{type:'json'})||await store.get('order-test/v2',{type:'json'})||await store.get('order-test/v1',{type:'json'});
  return json({status:result?.status||'AWAITING_DEMO_CHECK',checkedAt:result?.checkedAt||null,orderTest:test?{status:test.status,attempt:latest?4:null,attemptedAt:test.checkedAt??null,filled:test.filled??null,exchangeCode:test.exchangeCode??null}:null});
 }
 if(req.method!=='POST')fail(405,'Method not allowed');
 const user=await owner();
 if(user.id!==process.env.KALSHI_LIVE_OWNER_ID)fail(403,'Configured owner required');
 if(req.headers.get('origin')!==new URL(req.url).origin)fail(403,'Origin mismatch');
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON required');
 const {keyId,privateKeyPem}=await req.json();
 if(typeof keyId!=='string'||typeof privateKeyPem!=='string'||privateKeyPem.length>16000)fail(400,'Enter the demo key ID and choose the downloaded private key file.');
 const status=await checkDemoConnection({KALSHI_DEMO_KEY_ID:keyId,KALSHI_DEMO_PRIVATE_KEY:privateKeyPem});
 if(status!=='DEMO_AUTHENTICATED')return json({status},422);
 const envelope=sealKalshiCredentials({userId:'demo-'+user.id,keyId:keyId.trim(),privateKeyPem:privateKeyPem.trim(),secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
 const checkedAt=new Date().toISOString();
 await store.setJSON('uploaded-connection',{status,checkedAt,envelope});
 return json({status,checkedAt});
}catch(error){return errorResponse(error)}};
