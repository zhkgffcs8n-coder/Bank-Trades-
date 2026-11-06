import {releaseStatus} from './lib/kalshi-release-gate.mjs';
// Owner-only live execution safety state. Fail closed: no order execution is implemented.
import {getStore} from '@netlify/blobs';
import {owner,json,errorResponse,fail} from './lib/access.mjs';
const store=()=>getStore({name:'bank-trades-live-risk',consistency:'strong'});
const key=user=>'risk/'+user.id;
export default async request=>{try{
 const user=await owner();
 if(request.method==='GET'){
  const saved=await store().get(key(user),{type:'json'});
  return json({...releaseStatus(),enabled:false,emergencyStopped:saved?.emergencyStopped!==false,
   maxOrderDollars:saved?.maxOrderDollars??5,maxDailyDollars:saved?.maxDailyDollars??20,
   reason:'Live order execution is not implemented or authorized. Safety settings alone cannot enable trading.'});
 }
 if(request.method!=='POST')fail(405,'Method not allowed');
 if(request.headers.get('origin')!==new URL(request.url).origin)fail(403,'Origin mismatch');
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON required');
 const body=await request.json();
 if(body?.action==='start')return json({...releaseStatus(),error:'Release checks failed; live trading remains disabled'},409);
 if(body?.action==='stop'){const previous=await store().get(key(user),{type:'json'})||{};await store().setJSON(key(user),{...previous,emergencyStopped:true,updatedAt:Date.now()});return json({...releaseStatus(),stopped:true,cancelled:false});}
 if(body?.action!=='emergency-stop'&&body?.action!=='configure')fail(400,'Invalid action');
 const previous=await store().get(key(user),{type:'json'})||{};
 if(body.action==='emergency-stop'){
  await store().setJSON(key(user),{...previous,emergencyStopped:true,updatedAt:Date.now()});
  return json({ok:true,enabled:false,emergencyStopped:true,warning:'No live order service is active. This does not cancel orders or close positions at Kalshi.'});
 }
 const order=Number(body.maxOrderDollars),daily=Number(body.maxDailyDollars);
 if(!Number.isFinite(order)||!Number.isFinite(daily)||order<1||daily<order||daily>100)fail(400,'Limits must be $1-$100 daily, and per-order no higher than daily');
 await store().setJSON(key(user),{...previous,maxOrderDollars:order,maxDailyDollars:daily,emergencyStopped:true,updatedAt:Date.now()});
 return json({ok:true,enabled:false,emergencyStopped:true,maxOrderDollars:order,maxDailyDollars:daily});
}catch(error){return errorResponse(error)}};
