import {getStore} from '@netlify/blobs';
import {member,json,errorResponse,fail} from './lib/access.mjs';
const db=()=>getStore({name:'bank-trades-server-kaibot',consistency:'strong'});
function sameOrigin(req){const o=req.headers.get('origin');if(!o)return;let x;try{x=new URL(req.url).origin}catch{fail(400,'Bad URL')}if(o!==x)fail(403,'Cross-site request blocked')}
export default async req=>{try{
 if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed');await member();const s=db();
 if(req.method==='GET'){const state=await s.get('state',{type:'json'})||{running:false,startedAt:null,stoppedAt:null,maxSpend:50};const ledger=await s.get('ledger',{type:'json'})||{cash:1000,trades:[],updatedAt:null};const lastRun=await s.get('last-run',{type:'json'}).catch(()=>null);return json({state,ledger,lastRun})}
 sameOrigin(req);const body=await req.json(),action=String(body?.action||'');
 if(!['start','stop'].includes(action))fail(400,'Invalid action');
 const old=await s.get('state',{type:'json'})||{running:false,maxSpend:50};
 const maxSpend=Math.min(1000,Math.max(1,Number(body?.maxSpend)||old.maxSpend||50)),now=Date.now();
 const state={...old,running:action==='start',maxSpend,startedAt:action==='start'?(old.running?old.startedAt:now):old.startedAt,stoppedAt:action==='stop'?now:null,updatedAt:now};
 await s.setJSON('state',state);return json({state});
}catch(e){return errorResponse(e)}};