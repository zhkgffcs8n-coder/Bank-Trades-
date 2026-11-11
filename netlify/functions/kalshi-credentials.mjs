// Owner-only credential management. No live order execution.
import {getStore} from '@netlify/blobs';
import {liveRepository} from './lib/live-state.mjs';
import {createPrivateKey,createHash} from 'node:crypto';
import {signedHeaders} from './lib/kalshi-execution-client.mjs';
import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {sealKalshiCredentials,openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
const db=()=>getStore({name:'bank-trades-kalshi-credentials',consistency:'strong'});
const storageKey=user=>'credentials/'+user.id;
function retryDelay(value,now){
 if(!value)return null;
 const ms=/^\d+$/.test(value)?Number(value)*1000:Date.parse(value)-now;
 return Number.isFinite(ms)?Math.max(0,ms):null;
}
export async function guardedVerification(store,key,verify,clock=Date.now){
 const prior=await store.getWithMetadata(key,{type:'json'});
 if(prior?.data?.until>clock())return {ok:false,status:429};
 const lease=await store.setJSON(key,{until:clock()+30000},prior?{onlyIfMatch:prior.etag}:{onlyIfNew:true});
 if(!lease.modified||!lease.etag)return {ok:false,status:429};
 let result;
 try{
  result=await verify();
  return result;
 }finally{
  const delay=result?.status===429?Math.max(15000,result.retryAfterMs??0):2000;
  await store.setJSON(key,{until:clock()+delay},{onlyIfMatch:lease.etag});
 }
}
export async function verifyKalshi(keyId,privateKeyPem,fetchImpl=fetch,{clock=Date.now,random=Math.random,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const path='/trade-api/v2/portfolio/balance';
 const signal=AbortSignal.timeout(7000);
 for(let attempt=0;;attempt++){
  const response=await fetchImpl('https://external-api.kalshi.com'+path,{method:'GET',
   headers:signedHeaders({keyId,privateKeyPem},'GET',path,clock()),redirect:'error',signal});
  if(response.ok){
   const data=await response.json();
   if(!Number.isSafeInteger(data?.balance)||data.balance<0)throw Error('INVALID_ACCOUNT_BALANCE');
   return {ok:true,status:response.status};
  }
  const retryAfterMs=response.status===429?retryDelay(response.headers.get('retry-after'),clock()):null;
  await response.body?.cancel();
  if(response.status!==429||attempt>=2||retryAfterMs>2000)return {ok:false,status:response.status,retryAfterMs};
  await sleep(Math.max(retryAfterMs??0,500*2**attempt+Math.floor(random()*250)));
 }
}
export function createCredentialHandler({getOwner=owner,getDb=db,getLive=(userId)=>liveRepository(getStore({name:'bank-trades-live-execution-v1',consistency:'strong'}),userId),verify}={}){return async req=>{let liveSession;try{
 const user=await getOwner();
 const verifyOwner=verify??((keyId,pem)=>guardedVerification(getDb(),'verification/'+user.id,()=>verifyKalshi(keyId,pem)));
 if(req.method==='GET'){
  const record=await getDb().get(storageKey(user),{type:'json'});
  if(!record)return json({connected:false,credentialsStored:false,liveOrdersEnabled:false,storageReady:/^[a-fA-F0-9]{64}$/.test(process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY||''),reason:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY?'No credentials saved':'Server encryption secret unavailable'});
  if(record.securityVersion!==2)return json({connected:false,credentialsStored:true,rotationRequired:true,liveOrdersEnabled:false,reason:'Replace previously saved credentials with a newly generated Kalshi key; revoke exposed keys first.'});
  if(!/^[a-fA-F0-9]{64}$/.test(process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY||''))return json({connected:false,credentialsStored:true,storageReady:false,liveOrdersEnabled:false,reason:'Server encryption secret unavailable or invalid'});
  try{
   const {keyId,privateKeyPem}=openKalshiCredentials({userId:user.id,envelope:record.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
   const response=await verifyOwner(keyId,privateKeyPem);
   return json({connected:response.ok,credentialsStored:true,storageReady:true,liveOrdersEnabled:false,checkedAt:Date.now(),reason:response.ok?'Authenticated read-only balance request succeeded':response.status===429?'Kalshi verification rate limited (HTTP 429). Wait before checking again.':'Kalshi authentication returned HTTP '+response.status});
  }catch{return json({connected:false,credentialsStored:true,storageReady:true,liveOrdersEnabled:false,reason:'Authentication test failed or timed out'});}
 }
 if(req.method!=='POST'&&req.method!=='DELETE')fail(405,'Unsupported method');
 if(req.headers.get('origin')!==new URL(req.url).origin)fail(403,'Origin mismatch');
 const live=getLive(user.id);
 liveSession=await live.acquire();const current={state:liveSession.state};
 if(current.lock||current.state.enabled||current.state.risk?.open?.length||current.state.intents.some(i=>!['RECONCILED','ABORTED'].includes(i.status))||(current.state.intents.length&&!current.state.risk))fail(409,'Stop and reconcile all bot exposure before changing credentials');
 if(req.method==='DELETE'){
  await getDb().delete(storageKey(user));
  return json({ok:true,credentialsStored:false,liveOrdersEnabled:false});
 }
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'JSON required');
 const body=await req.json();
 if(!body||typeof body!=='object')fail(400,'Invalid request');
 if(body.rotationConfirmed!==true)fail(400,'Confirm exposed credentials were revoked and this is a newly generated key');
 const old=await getDb().get(storageKey(user),{type:'json'});
 const fingerprint=createHash('sha256').update(String(body.keyId)).digest('hex');
 if(old?.fingerprint===fingerprint)fail(400,'Use a newly generated API key ID');
 if(old?.envelope){try{const prior=openKalshiCredentials({userId:user.id,envelope:old.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});if(prior.keyId===body.keyId)fail(400,'Use a newly generated API key ID');}catch(e){if(e.status)throw e;}}

 // Fail closed if encryption is not configured. Never store plaintext credentials.
 if(!/^[a-fA-F0-9]{64}$/.test(process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY||''))fail(503,'Secure credential storage is not configured');
 let parsed;
 try{parsed=createPrivateKey(body.privateKeyPem)}catch{fail(400,'Invalid Kalshi private key')}
 if(!['rsa','ed25519'].includes(parsed.asymmetricKeyType))fail(400,'Kalshi key must be RSA or Ed25519');
 if(parsed.asymmetricKeyType==='rsa'&&(parsed.asymmetricKeyDetails?.modulusLength||0)<2048)fail(400,'RSA private key must be at least 2048 bits');
 let envelope;
 try{envelope=sealKalshiCredentials({userId:user.id,keyId:body.keyId,privateKeyPem:body.privateKeyPem,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY})}
 catch{fail(400,'Invalid credentials or encryption configuration')}
 // Never persist a key pair that Kalshi rejects. This is a read-only verification.
 let verified;
 try{verified=await verifyOwner(body.keyId,body.privateKeyPem)}
 catch{fail(503,'Kalshi connection test failed or timed out; credentials were not saved')}
 if(!verified.ok)fail(422,'Kalshi rejected the credentials (HTTP '+verified.status+'); credentials were not saved');
 await getDb().setJSON(storageKey(user),{envelope,fingerprint,securityVersion:2,updatedAt:Date.now()});
 return json({ok:true,credentialsStored:true,storageReady:true,connected:true,checkedAt:Date.now(),liveOrdersEnabled:false});
}catch(e){return errorResponse(e)}finally{if(liveSession)await liveSession.release();}};}
export default createCredentialHandler();
