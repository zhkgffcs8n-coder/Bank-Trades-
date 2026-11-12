import {liveBuildCommit} from './lib/kalshi-release-gate.mjs';
import {randomUUID,createPrivateKey} from 'node:crypto';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {shouldRefreshSavedDemoBalanceProbe} from './lib/demo-balance-probe-policy.mjs';
import {probeDemoSnapshot,demoSnapshotProbeReceipt,shouldRefreshFullDemoSnapshotProbe} from './kalshi-demo-snapshot-diagnostic.mjs';
import {getStore} from '@netlify/blobs';
import {kalshiClient} from './lib/kalshi-execution-client.mjs';

// Sanitized, read-only Demo balance transport classification. Never log error.message,
// response bodies, URLs, credentials, or underlying network details.
export function classifyDemoBalanceTransport(error){
 if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'DEMO_REQUEST_TIMEOUT';
 if(error?.name==='SyntaxError')return 'DEMO_RESPONSE_INVALID_JSON';
 if(error?.name==='TypeError')return 'DEMO_NETWORK_OR_TLS_FAILURE';
 return 'DEMO_TRANSPORT_UNCLASSIFIED';
}

export async function checkDemoConnection(env=process.env,fetchImpl=fetch,diagnostics=null){
 const keyId=env.KALSHI_DEMO_KEY_ID?.trim();
 const privateKeyPem=env.KALSHI_DEMO_PRIVATE_KEY?.replace(/\\n/g,'\n').trim();
 if(!keyId||!privateKeyPem)return 'DEMO_CREDENTIALS_MISSING';
 try{
  if(!['rsa','ed25519'].includes(createPrivateKey(privateKeyPem).asymmetricKeyType))return 'DEMO_PRIVATE_KEY_UNSUPPORTED_TYPE';
 }catch{return 'DEMO_PRIVATE_KEY_INVALID_PEM';}
 try{
  const client=kalshiClient({keyId,privateKeyPem},{environment:'demo',fetchImpl});
  const balance=await client.request('GET','/trade-api/v2/portfolio/balance');
  if(!Number.isSafeInteger(balance?.balance)||balance.balance<0){
   if(diagnostics&&typeof diagnostics==='object')diagnostics.failedPhase='BALANCE';
   return 'DEMO_INVALID_BALANCE_RESPONSE';
  }
  return 'DEMO_AUTHENTICATED';
 }catch(error){
  if(diagnostics&&typeof diagnostics==='object'){
   diagnostics.failedPhase='BALANCE';
   const match=/^KALSHI_HTTP_(\d{3})$/.exec(error?.message||'');
   if(match)diagnostics.httpStatus=Number(match[1]);
   else diagnostics.transportCause=classifyDemoBalanceTransport(error);
  }
  return /^KALSHI_HTTP_\d{3}$/.test(error?.message)?error.message:'DEMO_TRANSPORT_ERROR';
 }
}

export default async()=>{
 const store=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 const commit=liveBuildCommit();
 const saved=await store.get('uploaded-connection',{type:'json'});
 if(saved?.status==='DEMO_AUTHENTICATED'){
  // Run an independent full read-only account snapshot every ten minutes,
  // even if a previous execution lifecycle is terminal or its wake is stuck.
  // Keep its evidence separate from the shorter balance-only probe.
  const previousSnapshot=await store.get('saved-snapshot-probe',{type:'json'}).catch(()=>null);
  if(shouldRefreshFullDemoSnapshotProbe(previousSnapshot,{commit,credentialCheckedAt:saved.checkedAt??null})){
   const checkedAt=new Date().toISOString();
   let receipt={status:'DEMO_CREDENTIAL_ENVELOPE_UNAVAILABLE',checkedAt,commit};
   try{
    const ownerId=process.env.KALSHI_LIVE_OWNER_ID;
    if(ownerId){
     const credentials=openKalshiCredentials({userId:'demo-'+ownerId,envelope:saved.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
     const result=await probeDemoSnapshot(credentials);
     receipt=demoSnapshotProbeReceipt(result,commit);
    }
   }catch{
    // Do not expose transport exceptions, credentials, URLs, or exchange bodies.
    receipt={status:'DEMO_SNAPSHOT_READS_FAILED',transportCause:'REQUEST_FAILED',failedPhase:null,httpStatus:null,checkedAt,commit};
   }
   await store.setJSON('saved-snapshot-probe',{...receipt,credentialCheckedAt:saved.checkedAt??null});
   console.info(JSON.stringify({event:'DEMO_SCHEDULED_FULL_SNAPSHOT_PROBE',status:receipt.status,checkedAt:receipt.checkedAt}));
   return new Response(null,{status:204});
  }
  const previous=await store.get('saved-balance-probe',{type:'json'});
  if(!shouldRefreshSavedDemoBalanceProbe(previous,{commit,credentialCheckedAt:saved.checkedAt??null}))return new Response(null,{status:204});
  const requestId=randomUUID(),startedAt=Date.now();
  const ownerId=process.env.KALSHI_LIVE_OWNER_ID;
  let status='DEMO_OWNER_MISSING';
  const diagnostics={};
  if(ownerId){
   let credentials;
   try{
    credentials=openKalshiCredentials({userId:'demo-'+ownerId,envelope:saved.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
   }catch{status='DEMO_CREDENTIAL_ENVELOPE_UNAVAILABLE';}
   if(credentials)status=await checkDemoConnection({
    KALSHI_DEMO_KEY_ID:credentials.keyId,KALSHI_DEMO_PRIVATE_KEY:credentials.privateKeyPem
   },fetch,diagnostics);
  }
  const receipt={status,transportCause:diagnostics.transportCause??null,
   failedPhase:diagnostics.failedPhase??null,httpStatus:diagnostics.httpStatus??null,
   requestId,commit,operation:'GET_PORTFOLIO_BALANCE',
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
