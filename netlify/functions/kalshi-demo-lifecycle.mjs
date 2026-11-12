import {liveBuildCommit} from './lib/kalshi-release-gate.mjs';
import {demoAuthorizationRevoked} from '../../src/demo-authorization-fence.mjs';
import {getStore} from '@netlify/blobs';
import {demoWakeLifecycleStatus,demoWakeStatusForOutcome,demoWakeMarketRejectionReason,demoWakeFailureStage,demoWakeFailureCode} from '../../src/demo-wake-outcome.mjs';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {kalshiClient} from './lib/kalshi-execution-client.mjs';
import {liveRepository} from './lib/live-state.mjs';
import {recoverTerminalDemoState} from './lib/demo-lock-recovery.mjs';
import {championExecutionSignals} from '../../src/champion-kaibot-intake.mjs';
import {eligibleDemoLifecycleMarket,demoLifecycleMarketRejection,findDemoLifecycleMarket} from './lib/demo-market-discovery.mjs';
import {inspectDemoLock} from './lib/demo-lock-evidence.mjs';
import {runDemoLifecycle} from './lib/kalshi-demo-lifecycle.mjs';
import {sanitizedDemoSnapshotFailure} from '../../src/demo-snapshot-telemetry.mjs';
import {probeDemoSnapshot,demoSnapshotProbeReceipt,shouldProbeTerminalDemo} from './kalshi-demo-snapshot-diagnostic.mjs';
export async function runScheduledDemo(worker,manual={}){
 const db=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 const saved=await db.get('uploaded-connection',{type:'json'}),id=process.env.KALSHI_LIVE_OWNER_ID;
 if(saved?.status!=='DEMO_AUTHENTICATED'||!id){await db.setJSON('lifecycle-status',{status:'DEMO_CREDENTIALS_MISSING'});return new Response(null,{status:204,headers:{'x-demo-lifecycle-status':'DEMO_CREDENTIALS_MISSING'}});}
 let credentials,repo;
 try{
  credentials=openKalshiCredentials({userId:'demo-'+id,envelope:saved.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
  const readOnly=kalshiClient(credentials,{environment:'demo'});
  // A terminal lifecycle must not suppress fresh read-only exchange diagnostics.
  // This never re-arms a trade or changes order state; failures are isolated.
  const [lastLifecycle,previousProbe]=await Promise.all([
   db.get('lifecycle-status',{type:'json'}).catch(()=>null),
   db.get('saved-snapshot-probe',{type:'json'}).catch(()=>null)
  ]);
  if(shouldProbeTerminalDemo(lastLifecycle,previousProbe)){
   try{
    const probe=await probeDemoSnapshot(credentials);
    await db.setJSON('saved-snapshot-probe',{...demoSnapshotProbeReceipt(probe,liveBuildCommit()),credentialCheckedAt:saved.checkedAt??null});
   }catch{console.warn('DEMO_INDEPENDENT_PROBE_UNAVAILABLE');}
  }
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
  const authorization=await db.get(testKey,{type:'json'});
  const executionTest=authorization?.ownerId===id;
  if(manual.entryOnly&&(!executionTest||authorization.side!==manual.testSide))
   return new Response(null,{status:204,headers:{'x-demo-lifecycle-status':'DEMO_SELECTION_CHANGED'}});
  // A newer same-owner Demo authorization supersedes this request; a stale
  // in-flight lifecycle must not submit against the replacement UUID.
  const checkStopped=async()=>demoAuthorizationRevoked(await db.get(testKey,{type:'json'}),authorization,id);
  const findMarket=async(excluded,ticker)=>{
   if(!ticker&&executionTest)return findDemoLifecycleMarket(readOnly,excluded,Date.now,reason=>{marketRejectionReason=reason;},authorization.side??'UP');
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
  const invokedAt=Date.now();
  const outcome=await runDemoLifecycle({repo,client,quoteFor,findMarket,marketRejection:()=>marketRejectionReason,championSignals,executionTest,testSide:authorization?.side,testRunId:executionTest&&Number.isFinite(authorization?.requestedAt)&&Date.now()-authorization.requestedAt>=0&&Date.now()-authorization.requestedAt<=1800000?authorization.requestId:null,entryOnly:manual.entryOnly,exitOnly:manual.exitOnly,checkStopped,commit:liveBuildCommit()});
  await db.setJSON('lifecycle-status',outcome);
  const headers={'x-demo-lifecycle-status':demoWakeStatusForOutcome(outcome,invokedAt)};
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
