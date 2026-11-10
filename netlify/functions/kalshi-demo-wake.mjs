import {getStore} from '@netlify/blobs';
import {claimDemoWake} from '../../src/demo-wake-ticket.mjs';
import {runScheduledDemo} from './kalshi-demo-lifecycle.mjs';

export default async request=>{
 if(request.method!=='POST')return new Response(null,{status:405});
 const history=getStore({name:'bank-trades-market-history',consistency:'strong'});
 const worker=await claimDemoWake(history,request.headers.get('x-demo-wake'));
 if(!worker)return new Response(null,{status:403});
 return runScheduledDemo(worker);
};
