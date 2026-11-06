import {runtime,liveStore} from './lib/live-runtime.mjs';
import {releaseStatus} from './lib/kalshi-release-gate.mjs';
export default async()=>{
 const status=releaseStatus();
 // Disabled deployments perform no authenticated exchange calls and incur no AI-provider calls.
 if(!status.canTrade){await liveStore().setJSON('runner-status',{at:Date.now(),status:'RELEASE_BLOCKED',...status});return new Response(null,{status:204});}
 const id=process.env.KALSHI_LIVE_OWNER_ID;if(!id)return new Response('OWNER_NOT_CONFIGURED',{status:503});
 try{const live=await runtime(id);await live.tick();return new Response(null,{status:204});}
 catch(e){await liveStore().setJSON('runner-status',{at:Date.now(),status:'FAILED',error:/^[A-Z0-9_:.-]+$/.test(e.message)?e.message:'EXECUTION_FAILED'});return new Response(null,{status:503});}
};
export const config={schedule:'* * * * *'};
