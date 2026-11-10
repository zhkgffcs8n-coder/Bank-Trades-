import {getStore} from '@netlify/blobs';
import {claimDemoWake} from '../../src/demo-wake-ticket.mjs';
import {inspectChampionIntake} from '../../src/champion-kaibot-intake.mjs';
import {runScheduledDemo} from './kalshi-demo-lifecycle.mjs';

export default async request=>{
 if(request.method!=='POST')return new Response(null,{status:405});
 const history=getStore({name:'bank-trades-market-history',consistency:'strong'});
 const receivedAt=Date.now();
 const worker=await claimDemoWake(history,request.headers.get('x-demo-wake'));
 if(!worker)return new Response(null,{status:403});
 const intake=inspectChampionIntake(worker,receivedAt);
 const response=await runScheduledDemo(worker);
 const demo=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 // Telemetry must never change the outcome of an exchange request.
 try{
  await demo.setJSON('champion-wake-receipt',{
   receivedAt,completedAt:Date.now(),httpStatus:response.status,...intake
  });
 }catch{console.warn('KAIBOT_DEMO_WAKE_RECEIPT_WRITE_FAILED');}
 return response;
};
