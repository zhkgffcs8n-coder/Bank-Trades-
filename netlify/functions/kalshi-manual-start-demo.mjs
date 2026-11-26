import {randomUUID} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {getUser} from '@netlify/identity';
import {json,errorResponse,fail} from './lib/access.mjs';
import {createLiveControl} from './kalshi-live-control.mjs';
import {liveRepository} from './lib/live-state.mjs';
import {kalshiClient} from './lib/kalshi-execution-client.mjs';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {findDemoLifecycleMarket} from './lib/demo-market-discovery.mjs';
import {runLiveCycle} from '../../src/live-cycle.mjs';

export default async req=>{try{
 if(process.env.CONTEXT!=='deploy-preview')return new Response(null,{status:404});
 if(req.method==='GET'){
  const user=await getUser();
  if(!user||!user.roles?.includes('owner')||user.id!==process.env.KALSHI_LIVE_OWNER_ID)fail(403,'Configured owner required');
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>KaiBot Demo verification</title><h1>KaiBot Demo verification</h1><button type="button">Run START and STOP in Kalshi Demo</button><pre role="status"></pre><script>
  const button=document.querySelector('button'),result=document.querySelector('pre');
  button.onclick=async()=>{button.disabled=true;result.textContent='Running Demo verification…';try{
   const response=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation:'RUN_DEMO_CANCEL_TEST'})});
   result.textContent=JSON.stringify(await response.json(),null,2);
  }catch{result.textContent='Demo verification response unavailable.';}finally{button.disabled=false;}};
  </script>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}});
 }
 if(req.method!=='POST')fail(405,'Method not allowed');
 if(req.headers.get('origin')!==new URL(req.url).origin)fail(403,'Origin mismatch');
 if(!req.headers.get('content-type')?.startsWith('application/json')||(await req.json())?.confirmation!=='RUN_DEMO_CANCEL_TEST')fail(400,'Explicit Demo test confirmation required');
 const user=await getUser();
 if(!user||!user.roles?.includes('owner')||user.id!==process.env.KALSHI_LIVE_OWNER_ID)fail(403,'Configured owner required');
 const db=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 const saved=await db.get('uploaded-connection',{type:'json'});
 if(saved?.status!=='DEMO_AUTHENTICATED')fail(409,'Authenticated Demo credentials required');
 const credentials=openKalshiCredentials({userId:'demo-'+user.id,envelope:saved.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
 const client=kalshiClient(credentials,{environment:'demo',allowWrites:true});
 const testId=randomUUID(),repo=liveRepository(db,'manual-demo-'+testId);
 let cancelAccepted=false,submissionAttempted=false;
 const instrumentedClient={...client,async cancel(order){const result=await client.cancel(order);cancelAccepted=true;return result;}};
 const control=createLiveControl({getOwner:async()=>user,getRuntime:async()=>({repo,db,client:async()=>instrumentedClient}),
  getRelease:()=>{throw Error('DEMO_RELEASE_EVIDENCE_ACCESSED');}});
 const action=async(name)=>{
  const response=await control(new Request(req.url,{method:'POST',headers:{origin:new URL(req.url).origin,'content-type':'application/json'},
   body:JSON.stringify({action:name,confirmation:'START_REAL_MONEY_WITH_LIMITS'})}));
  if(!response.ok)throw Error('DEMO_'+name.toUpperCase()+'_FAILED');
  return response.json();
 };
 if((await action('start')).status!=='ARMED_WAITING')throw Error('DEMO_START_NOT_ARMED');
 try{
  const cycle=await runLiveCycle({repo,client,championMode:true,canTrade:state=>state.manualArmVersion===1&&state.enabled,
   waitForDependencies:true,signals:async()=>[],signalStatus:()=> 'PRO_SCALPER_FEED_UNAVAILABLE'});
  if(cycle.status!=='ARMED_WAITING'||cycle.reason!=='PRO_SCALPER_FEED_UNAVAILABLE')throw Error('DEMO_WAIT_REASON_NOT_VERIFIED');
  if(!(await action('stop')).cancelled||!await repo.stopped())throw Error('DEMO_WAIT_STOP_FAILED');
  if((await action('start')).status!=='ARMED_WAITING')throw Error('DEMO_REARM_FAILED');
  const market=await findDemoLifecycleMarket(client,[],Date.now,()=>{},'UP');
  if(!market||!(Number(market.yes_ask_dollars)>0.01))throw Error('DEMO_POST_ONLY_MARKET_UNAVAILABLE');
  const session=await repo.acquire();
  try{
   session.state.intents.push({id:testId,ticker:market.ticker,side:'up',action:'buy',qty:1,priceCents:1,
    reserve:1,day:new Date().toISOString().slice(0,10),status:'AWAITING_RECONCILIATION',at:Date.now()});
   await session.persist(session.state);
  }finally{await session.release();}
  submissionAttempted=true;
  await client.create({ticker:market.ticker,client_order_id:testId,side:'bid',count:'1.00',price:'0.0100',
   time_in_force:'good_till_canceled',post_only:true,cancel_order_on_pause:true,self_trade_prevention_type:'taker_at_cross',reduce_only:false,subaccount:0});
  const before=(await client.snapshot()).orders.find(order=>order.client_order_id===testId);
  if(before?.status!=='resting')throw Error('DEMO_RESTING_ORDER_NOT_VERIFIED');
  const stopped=await action('stop');
  const after=(await client.snapshot()).orders.find(order=>order.client_order_id===testId);
  if(!stopped.cancelled||!cancelAccepted||!await repo.stopped()||after?.status!=='canceled')throw Error('DEMO_CANCELLATION_NOT_VERIFIED');
  return json({verified:true,startedWithoutReleaseEvidence:true,waitReason:cycle.reason,stoppedWhileWaiting:true,
   cancelAccepted,orderBefore:before.status,orderAfter:after.status});
 }finally{
  await repo.stop();
  if(submissionAttempted&&!cancelAccepted){
   const residual=(await client.snapshot()).orders.find(order=>order.client_order_id===testId&&order.status==='resting');
   if(residual)await client.cancel(residual);
  }
 }
}catch(error){return errorResponse(error)}};
