import {runtime,liveStore} from './lib/live-runtime.mjs';
import {liveRepository} from './lib/live-state.mjs';
import {releaseStatus} from './lib/kalshi-release-gate.mjs';
export default async()=>{
 const status=releaseStatus();
 const id=process.env.KALSHI_LIVE_OWNER_ID;
 try{
  if(!status.canTrade){
   const db=liveStore();
   // Keep draining existing bot orders even when new orders are release-blocked.
   // A disabled deployment with no bot intents never authenticates to Kalshi.
   if(id){
    const {state}=await liveRepository(db,id).read();
    if(state.intents.length){const live=await runtime(id);await live.tick();}
   }
   await db.setJSON('runner-status',{at:Date.now(),status:'RELEASE_BLOCKED',...status});
   return new Response(null,{status:204});
  }
  if(!id)return new Response('OWNER_NOT_CONFIGURED',{status:503});
  const live=await runtime(id);await live.tick();return new Response(null,{status:204});
 }
 catch(e){await liveStore().setJSON('runner-status',{at:Date.now(),status:'FAILED',error:/^[A-Z0-9_:.-]+$/.test(e.message)?e.message:'EXECUTION_FAILED'});return new Response(null,{status:503});}
};
export const config={schedule:'* * * * *'};
