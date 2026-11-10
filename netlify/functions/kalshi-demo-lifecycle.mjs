import {getStore} from '@netlify/blobs';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {kalshiClient} from './lib/kalshi-execution-client.mjs';
import {liveRepository} from './lib/live-state.mjs';
import {recoverTerminalDemoState} from './lib/demo-lock-recovery.mjs';
import {findDemoLifecycleMarket} from './lib/demo-market-discovery.mjs';
import {inspectDemoLock} from './lib/demo-lock-evidence.mjs';
import {runDemoLifecycle} from './lib/kalshi-demo-lifecycle.mjs';
export default async()=>{
 const db=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 const saved=await db.get('uploaded-connection',{type:'json'}),id=process.env.KALSHI_LIVE_OWNER_ID;
 if(saved?.status!=='DEMO_AUTHENTICATED'||!id){await db.setJSON('lifecycle-status',{status:'DEMO_CREDENTIALS_MISSING'});return new Response(null,{status:204});}
 let credentials,repo;
 try{
  credentials=openKalshiCredentials({userId:'demo-'+id,envelope:saved.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
  const readOnly=kalshiClient(credentials,{environment:'demo'});
  repo=liveRepository(db,'demo-lifecycle-v1',{
   recoverDemoLock:record=>recoverTerminalDemoState(record,readOnly)
  });
  const client=kalshiClient(credentials,{environment:'demo',allowWrites:true});
  const quoteFor=async ticker=>{
   const at=Date.now(),{market:m}=await client.request('GET','/trade-api/v2/markets/'+encodeURIComponent(ticker));
   if(m?.ticker!==ticker||m.status!=='active'||m.exchange_index!==0)return null;
   return {ticker,at,expiresAt:Date.parse(m.close_time),upAsk:Math.round(Number(m.yes_ask_dollars)*100),upBid:Math.round(Number(m.yes_bid_dollars)*100),downAsk:Math.round(Number(m.no_ask_dollars)*100),downBid:Math.round(Number(m.no_bid_dollars)*100)};
  };
  const findMarket=excluded=>findDemoLifecycleMarket(client,excluded);
  await db.setJSON('lifecycle-status',await runDemoLifecycle({repo,client,quoteFor,findMarket,commit:process.env.COMMIT_REF||null}));
  return new Response(null,{status:204});
 }catch(e){
  if(e.message==='DEMO_LOCK_RECOVERED'){
   await db.setJSON('lifecycle-status',{status:e.message,checkedAt:Date.now()});
   return new Response(null,{status:204});
  }
  const lockEvidence=e.message==='EXECUTION_BUSY'&&credentials?
   await inspectDemoLock(repo,kalshiClient(credentials,{environment:'demo'})):null;
  await db.setJSON('lifecycle-status',{lockEvidence,status:'DEMO_LIFECYCLE_UNAVAILABLE',error:/^[A-Z0-9_:.-]+$/.test(e.message)?e.message:'DEMO_CONFIGURATION_OR_TRANSPORT_ERROR',checkedAt:Date.now()});return new Response(null,{status:503});}
};
export const config={schedule:'* * * * *'};
