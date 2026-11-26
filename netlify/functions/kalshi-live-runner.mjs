import {getStore} from '@netlify/blobs';
import {inspectChampionIntake} from '../../src/champion-kaibot-intake.mjs';
import {runtime,liveStore} from './lib/live-runtime.mjs';
import {releaseStatus} from './lib/kalshi-release-gate.mjs';
export default async()=>{
 const status=releaseStatus();
 const id=process.env.KALSHI_LIVE_OWNER_ID;
 try{
  if(!id){
   const db=liveStore();
   const history=getStore({name:'bank-trades-market-history',consistency:'strong'});
   const worker=await history.get('predator-v13/health',{type:'json'});
   const at=Date.now();
   const champion=inspectChampionIntake(worker,at);
   await history.setJSON('champion-kaibot/shadow-intake',{at,...champion});
   await db.setJSON('runner-status',{at,status:'OWNER_NOT_CONFIGURED',...status,champion});

   return new Response(null,{status:204});
  }
  const live=await runtime(id);const result=await live.tick();
  await live.db.setJSON('runner-status',{at:Date.now(),...status,status:result.status});
  return new Response(null,{status:204});
 }
 catch(e){await liveStore().setJSON('runner-status',{at:Date.now(),status:'FAILED',error:/^[A-Z0-9_:.-]+$/.test(e.message)?e.message:'EXECUTION_FAILED'});return new Response(null,{status:503});}
};
export const config={schedule:'* * * * *'};
