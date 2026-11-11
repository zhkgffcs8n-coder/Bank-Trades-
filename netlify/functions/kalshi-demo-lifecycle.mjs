import {getStore} from '@netlify/blobs';
import {demoWakeLifecycleStatus,demoWakeMarketRejectionReason,demoWakeFailureStage,demoWakeFailureCode} from '../../src/demo-wake-outcome.mjs';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {kalshiClient} from './lib/kalshi-execution-client.mjs';
import {liveRepository} from './lib/live-state.mjs';
import {recoverTerminalDemoState} from './lib/demo-lock-recovery.mjs';
import {championExecutionSignals} from '../../src/champion-kaibot-intake.mjs';
import {eligibleDemoLifecycleMarket,demoLifecycleMarketRejection,findDemoLifecycleMarket} from './lib/demo-market-discovery.mjs';
import {inspectDemoLock} from './lib/demo-lock-evidence.mjs';
import {runDemoLifecycle} from './lib/kalshi-demo-lifecycle.mjs';
import {sanitizedDemoSnapshotFailure} from '../../src/demo-snapshot-telemetry.mjs';
export async function runScheduledDemo(worker){
 const db=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 const saved=await db.get('uploaded-connection',{type:'json'}),id=process.env.KALSHI_LIVE_OWNER_ID;
 if(saved?.status!=='DEMO_AUTHENTICATED'||!id){await db.setJSON('lifecycle-status',{status:'DEMO_CREDENTIALS_MISSING'});return new Response(null,{status:204,headers:{'x-demo-lifecycle-status':'DEMO_CREDENTIALS_MISSING'}});}
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
  const history=getStore({name:'bank-trades-market-history',consistency:'strong'});
  const championSignals=async()=>championExecutionSignals(worker??await history.get('predator-v13/health',{type:'json'}));
  let marketRejectionReason='DEMO_MARKET_NOT_VERIFIED';
  const testKey='execution-test/authorization';
  const executionTest=(await db.get(testKey,{type:'json'}))?.ownerId===id;
  const checkStopped=async()=>(await db.get(testKey,{type:'json'}))?.ownerId!==id;
  const findMarket=async(excluded,ticker)=>{
   if(!ticker&&executionTest)return findDemoLifecycleMarket(readOnly,excluded);
   try{
    const {market}=await readOnly.request('GET','/trade-api/v2/markets/'+encodeURIComponent(ticker));
    if(!market||market.ticker!==ticker){marketRejectionReason='DEMO_MARKET_NOT_FOUND';return null;}
    if(eligibleDemoLifecycleMarket(market,excluded))return market;
    marketRejectionReason=demoLifecycleMarketRejection(market,excluded)||'DEMO_MARKET_NOT_VERIFIED';
    return null;
   }catch(error){
    if(error.message==='KALSHI_HTTP_404'){marketRejectionReason='DEMO_MARKET_NOT_FOUND';return null;}
    throw error;
   }
  };
  const snapshot=client.snapshot;
  client.snapshot=async()=>{
   const startedAt=Date.now();
   try{
    return await snapshot();
   }catch(error){
    console.warn(JSON.stringify(sanitizedDemoSnapshotFailure(error,{
     durationMs:Date.now()-startedAt,trigger:worker?'worker':'schedule'
    })));
    throw error;
   }
  };
  const outcome=await runDemoLifecycle({repo,client,quoteFor,findMarket,marketRejection:()=>marketRejectionReason,championSignals,executionTest,checkStopped,commit:process.env.COMMIT_REF||null});
  await db.setJSON('lifecycle-status',outcome);
  const headers={'x-demo-lifecycle-status':demoWakeLifecycleStatus(outcome?.status)};
  if(outcome?.status==='DEMO_CHAMPION_CONTRACT_INELIGIBLE')
   headers['x-demo-market-rejection-reason']=demoWakeMarketRejectionReason(outcome?.marketRejectionReason);
  if(outcome?.status==='DEMO_LIFECYCLE_FAILED'){
   headers['x-demo-failure-stage']=demoWakeFailureStage(outcome?.stage);
   headers['x-demo-failure-code']=demoWakeFailureCode(outcome?.error);
   if(outcome?.snapshotCause)headers['x-demo-snapshot-cause']=demoWakeFailureCode(outcome.snapshotCause);
  }
  return new Response(null,{status:204,headers});
 }catch(e){
  if(e.message==='DEMO_LOCK_RECOVERED'){
   await db.setJSON('lifecycle-status',{status:e.message,checkedAt:Date.now()});
   return new Response(null,{status:204,headers:{'x-demo-lifecycle-status':'DEMO_LOCK_RECOVERED'}});
  }
  const lockEvidence=e.message==='EXECUTION_BUSY'&&credentials?
   await inspectDemoLock(repo,kalshiClient(credentials,{environment:'demo'})):null;
  await db.setJSON('lifecycle-status',{lockEvidence,status:'DEMO_LIFECYCLE_UNAVAILABLE',error:/^[A-Z0-9_:.-]+$/.test(e.message)?e.message:'DEMO_CONFIGURATION_OR_TRANSPORT_ERROR',checkedAt:Date.now()});return new Response(null,{status:503,headers:{'x-demo-lifecycle-status':'DEMO_LIFECYCLE_UNAVAILABLE'}});}
}
export default ()=>runScheduledDemo();
export const config={schedule:'* * * * *'};
