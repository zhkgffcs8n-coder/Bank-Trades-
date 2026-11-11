import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {runtime} from './lib/live-runtime.mjs';
import {liveBuildCommit,releaseStatus} from './lib/kalshi-release-gate.mjs';
import {ENTRY_MODES,validateLimits,reconcile,emergencyStop} from '../../src/live-execution.mjs';
import {accountRisk} from '../../src/live-accounting.mjs';
const liveTrialCaps={orderCents:100,dailyCents:500,lossCents:300,maxPositions:1};
function effectiveLiveLimits(limits){
 return {...limits,...Object.fromEntries(Object.entries(liveTrialCaps).map(([key,cap])=>[key,Math.min(limits[key],cap)]))};
}
function exceedsLiveCaps(limits){
 return Object.entries(liveTrialCaps).some(([key,cap])=>limits[key]>cap);
}
export function createLiveControl({getOwner=owner,getRuntime=runtime,getRelease=releaseStatus,getCommit=liveBuildCommit}={}){return async req=>{try{
 const user=await getOwner(),live=await getRuntime(user.id);
 if(req.method==='GET'){const {state,lock}=await live.repo.read();return json({...getRelease(),enabled:state.enabled&&!await live.repo.stopped(),stopped:await live.repo.stopped(),busy:!!lock,entryMode:state.entryMode??'balanced',limits:effectiveLiveLimits(state.limits),risk:state.risk||null,failure:state.failure||null,lastReconciledAt:state.lastReconciledAt||null,heartbeat:await live.db.get('heartbeat/'+user.id,{type:'json'})});}
 if(req.method!=='POST')fail(405,'Method not allowed');
 if(req.headers.get('origin')!==new URL(req.url).origin)fail(403,'Origin mismatch');
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON required');
 const body=await req.json(),action=body?.action;
 if(!['start','stop','emergency-stop','configure','reconcile','tick'].includes(action))fail(400,'Invalid action');
 if(action==='start'&&!getRelease().canTrade)return json({...getRelease(),error:'Release verification required'},409);
 if(action==='start'&&body.confirmation!=='START_REAL_MONEY_WITH_LIMITS')fail(409,'EXPLICIT_LIVE_CONFIRMATION_REQUIRED');
 if(action==='tick')return json(await live.tick());
 if(action==='stop'||action==='emergency-stop')await live.repo.stop();
 let session;try{session=await live.repo.acquire();}catch(e){if(e.message==='EXECUTION_BUSY')return json({enabled:false,stopRequested:action==='stop'||action==='emergency-stop',cancelled:false,error:'Worker busy; cancellation pending, not verified'},202);throw e;}
 try{
  const state=session.state;
  if(action==='configure'){
   if(state.enabled||!await live.repo.stopped())fail(409,'Stop before changing limits');
   try{validateLimits(body.limits);}catch(e){fail(400,e.message)}
   if(exceedsLiveCaps(body.limits))fail(400,'Live limits exceed the approved trial caps');
   if(body.entryMode!==undefined&&!Object.hasOwn(ENTRY_MODES,body.entryMode))fail(400,'Invalid live entry mode');
   state.entryMode=body.entryMode??state.entryMode??'balanced';
   state.limits=body.limits;await session.persist(state);return json({ok:true,limits:state.limits,...getRelease()});
  }
  if(action==='stop'||action==='emergency-stop'){
   state.enabled=false;state.stopped=true;await session.persist(state);
   if(!state.intents.length)return json({stopped:true,cancelled:true,positionsClosed:false,scope:'No bot orders have been submitted; manual Kalshi orders are untouched'});
   const client=await live.client();try{reconcile(state,await client.snapshot());await session.persist(state);}catch{}
   return json(await emergencyStop({state,client,persist:session.persist}));
  }
  if(action==='start'&&process.env.KALSHI_LIVE_OWNER_ID!==user.id)fail(409,'Scheduled worker owner is not configured for this account');
  const fence=await live.repo.fence(),client=await live.client();
  const snapshot=await client.snapshot();
  const commit=getCommit();
  if(action==='reconcile'&&commit&&snapshot.complete){
   await live.db.setJSON('release-receipts/'+user.id+'/'+commit+'/authentication',{
    commit,at:Date.now(),test:'production-authenticated-account-snapshot',verified:true
   });
  }
  try{reconcile(state,snapshot);}catch(e){
   const mismatch=/^POSITION_MISMATCH_(.+)$/.exec(e.message);
   if(action!=='reconcile'||!mismatch||state.intents.some(intent=>intent.ticker===mismatch[1]&&intent.status!=='ABORTED'))throw e;
   const positions=snapshot.positions.filter(p=>Number(p.position_fp??p.position)!==0&&
    !state.intents.some(intent=>intent.ticker===p.ticker&&intent.status!=='ABORTED'))
    .map(p=>({ticker:p.ticker,quantity:p.position_fp??p.position}));
   return json({...getRelease(),accountReadVerified:true,reconciled:false,positions,
    error:'Kalshi account read passed. Open positions outside this bot block reconciliation: '+positions.map(p=>p.ticker+' ('+p.quantity+' contracts)').join(', ')+'.'},409);
  }
  state.risk=accountRisk(state,snapshot);state.lastReconciledAt=Date.now();await session.persist(state);
  if(action==='reconcile')return json({reconciled:true,risk:state.risk,checkedAt:state.lastReconciledAt,...getRelease()});
  if(state.risk.open.length||snapshot.orders.some(o=>o.status==='resting'))fail(409,'Start requires a reconciled flat account without resting orders');
  validateLimits(state.limits);
  state.limits=effectiveLiveLimits(state.limits);
  state.enabled=true;state.stopped=false;state.failure=null;await session.persist(state);await live.repo.startFence(fence);
  return json({enabled:true,stopped:false});
 }finally{await session.release();}
}catch(e){if(/^[A-Z][A-Z0-9_:.-]+$/.test(e.message||''))return json({enabled:false,error:e.message},503);return errorResponse(e)}};}
export default createLiveControl();
