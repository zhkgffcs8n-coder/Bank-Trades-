import {randomUUID} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {kalshiClient} from './lib/kalshi-execution-client.mjs';

const portfolio='/trade-api/v2/portfolio/';
const reads=[
 ['BALANCE','balance',null],
 ['ORDERS','orders','orders'],
 ['FILLS','fills','fills'],
 ['POSITIONS','positions','market_positions'],
 ['SETTLEMENTS','settlements','settlements']
];
function category(error,status){
 if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'TIMEOUT';
 if(status===401||status===403)return 'AUTHENTICATION_OR_PERMISSION';
 if(status===429)return 'RATE_LIMIT';
 if(/^KALSHI_HTTP_[45][0-9]{2}$/.test(error?.message))return 'HTTP_ERROR';
 if(error?.name==='SyntaxError'||['INVALID_BALANCE','INVALID_ORDERS','INVALID_FILLS','INVALID_MARKET_POSITIONS','INVALID_SETTLEMENTS','CURSOR_LOOP','PAGINATION_LIMIT'].includes(error?.message))return 'INVALID_RESPONSE';
 return 'REQUEST_FAILED';
}
export async function probeDemoSnapshot(credentials,fetchImpl=fetch){
 const correlationId=randomUUID(),deadline=AbortSignal.timeout(8000);
 const operations=await Promise.all(reads.map(async ([phase,path,field])=>{
  let httpStatus=null;
  const start=performance.now();
  const client=kalshiClient(credentials,{environment:'demo',fetchImpl:async (url,options)=>{
   httpStatus=null;
   const response=await fetchImpl(url,{...options,signal:AbortSignal.any([options.signal,deadline])});
   httpStatus=response.status;
   return response;
  }});
  let failureCategory=null;
  try{
   if(field)await client.pages(portfolio+path,field);
   else{
    const response=await client.request('GET',portfolio+path);
    if(!Number.isSafeInteger(response?.balance)||response.balance<0)throw Error('INVALID_BALANCE');
   }
  }catch(error){failureCategory=category(error,httpStatus);}
  return {phase,httpStatus,durationMs:Math.round(performance.now()-start),failureCategory};
 }));
 return {correlationId,checkedAt:new Date().toISOString(),ok:operations.every(read=>!read.failureCategory),operations};
}


export function demoSnapshotProbeReceipt(result,commit=null){
 const firstFailure=result.operations.find(operation=>operation.failureCategory);
 return {
  status:result.ok?'DEMO_SNAPSHOT_READS_OK':'DEMO_SNAPSHOT_READS_FAILED',
  transportCause:firstFailure?.failureCategory||null,
  requestId:result.correlationId,
  operation:'INDEPENDENT_READ_ONLY_SNAPSHOT',
  checkedAt:result.checkedAt,
  durationMs:result.operations.reduce((sum,operation)=>sum+operation.durationMs,0),
  commit
 };
}

export function createDemoSnapshotDiagnostic({
 getOwner=owner,ownerId=()=>process.env.KALSHI_LIVE_OWNER_ID,
 getStoreForDemo=()=>getStore({name:'bank-trades-kalshi-demo',consistency:'strong'}),
 secret=()=>process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY,fetchImpl=fetch
}={}){
 return async req=>{try{
  const user=await getOwner(),configuredOwner=ownerId();
  if(!configuredOwner||user.id!==configuredOwner)fail(403,'Configured owner required');
  if(req.method==='GET')return new Response(
   '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kalshi Demo snapshot</title><h1>Kalshi Demo snapshot</h1><form method="post"><button>Run read-only Demo check</button></form></html>',
   {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"}});
  if(req.method!=='POST')fail(405,'Method not allowed');
  if(req.headers.get('origin')!==new URL(req.url).origin)fail(403,'Origin mismatch');
  let saved;
  try{saved=await getStoreForDemo().get('uploaded-connection',{type:'json'});}
  catch{return json({ok:false,correlationId:randomUUID(),phase:'CREDENTIAL_STORAGE',failureCategory:'STORAGE_READ_FAILED'},503);}
  if(saved?.status!=='DEMO_AUTHENTICATED')fail(409,'No verified Demo connection stored');
  let credentials;
  try{credentials=openKalshiCredentials({userId:'demo-'+configuredOwner,envelope:saved.envelope,secret:secret()});}
  catch{return json({ok:false,correlationId:randomUUID(),phase:'CREDENTIAL_LOADING',failureCategory:'CREDENTIAL_LOAD_FAILED'},503);}
  const result=await probeDemoSnapshot(credentials,fetchImpl);
  return json({...result,commit:process.env.COMMIT_REF||null});
 }catch(error){return errorResponse(error);}};
}
export default createDemoSnapshotDiagnostic();
