// Bounded integration test. Caller constructs a DEMO-only client; never production.
import {initialState,reconcile,submitIntent} from '../../../src/live-execution.mjs';
import {accountRisk} from '../../../src/live-accounting.mjs';
const SNAPSHOT_PHASES=new Set(['BALANCE','ORDERS','FILLS','POSITIONS','SETTLEMENTS']);
const SNAPSHOT_STAGES=new Set(['ACCOUNT_SNAPSHOT','ENTRY_ACCOUNT_SNAPSHOT','VERIFY_EXIT']);
const SNAPSHOT_READ_FAILURES=new Set([...SNAPSHOT_PHASES].map(phase=>'DEMO_SNAPSHOT_'+phase+'_READ_FAILED'));
const retryableSnapshotFailure=code=>code==='DEMO_TRANSPORT_OR_STORAGE_ERROR'||SNAPSHOT_READ_FAILURES.has(code);
export const DEMO_EXECUTION_TEST='DEMO_EXECUTION_TEST';
export async function runDemoLifecycle({repo,client,findMarket,marketRejection,quoteFor,commit,championSignals,executionTest=false,testSide,testRunId,entryOnly=false,exitOnly=false,checkStopped=async()=>false,clock=Date.now}){
 const session=await repo.acquire(),state=session.state;
 let stage='INITIALIZE';
 let retry=false,legacyRecovery=false,balanceRecovery=false;
 try{
  // Older runs could consume the retry before failing on their first account read.
  // A separate one-time recovery is limited to the legacy zero-attempt record.
  const previous=state.demo;
  legacyRecovery=state.demoRetryUsed===true&&!state.demoLegacySnapshotRecoveryUsed&&
   previous?.stage==='ACCOUNT_SNAPSHOT'&&previous.error==='DEMO_TRANSPORT_OR_STORAGE_ERROR'&&
   previous.commit==null&&previous.attempts===0&&previous.intentOffset===state.intents.length&&
   state.intents.every(intent=>['ABORTED','RECONCILED'].includes(intent.status));
  balanceRecovery=state.demoRetryUsed===true&&!state.demoBalanceSnapshotRecoveryUsed&&
   previous?.stage==='ACCOUNT_SNAPSHOT'&&previous.error==='DEMO_SNAPSHOT_BALANCE_READ_FAILED'&&
   previous.attempts===0&&previous.intentOffset===state.intents.length&&
   state.intents.every(intent=>['ABORTED','RECONCILED'].includes(intent.status));
  retry=state.demo?.status==='DEMO_LIFECYCLE_FAILED'&&state.demo.finished&&
   (!state.demoRetryUsed||legacyRecovery||balanceRecovery)&&retryableSnapshotFailure(state.demo.error);
  if(state.demo?.finished&&!retry){
   // A completed run cannot restart itself. Only a fresh owner-issued UUID may
   // arm one new bounded Demo test, after exchange-backed flat-account checks.
   if(!(executionTest&&typeof testRunId==='string'&&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(testRunId)&&
    state.demo.testRunId!==testRunId))return state.demo;
   if(exitOnly||await checkStopped())return {status:'DEMO_EXECUTION_TEST_STOPPED'};
   if(!state.intents.every(intent=>['ABORTED','RECONCILED'].includes(intent.status)))
    return {status:'DEMO_REARM_BLOCKED_UNRESOLVED_INTENTS'};
   try{
    const snapshot=await client.snapshot();
    if(snapshot?.orders?.some(o=>!['executed','canceled'].includes(o.status)))
     return {status:'DEMO_REARM_BLOCKED_ACCOUNT_EXPOSURE'};
    reconcile(state,snapshot,clock());
    const risk=accountRisk(state,snapshot,clock());
    if(risk.open.length||snapshot.positions.some(p=>Math.abs(Number(p.position_fp??p.position))>1e-7)||
      snapshot.orders.some(o=>!['executed','canceled'].includes(o.status)))
     return {status:'DEMO_REARM_BLOCKED_ACCOUNT_EXPOSURE'};
   }catch{return {status:'DEMO_REARM_ACCOUNT_CHECK_FAILED'};}
   if(await checkStopped())return {status:'DEMO_EXECUTION_TEST_STOPPED'};
   state.demoHistory=[...(state.demoHistory||[]),state.demo];
   state.demo={startedAt:clock(),commit,phase:testSide==='DOWN'?'DOWN':'UP',
    attempts:0,intentOffset:state.intents.length,mode:DEMO_EXECUTION_TEST,testRunId};
   state.enabled=true;state.stopped=false;
   await session.persist(state);
   return {status:'DEMO_NEW_TEST_ARMED'};
  }
  if(exitOnly&&state.demo?.mode!==DEMO_EXECUTION_TEST)return {status:'DEMO_NO_TEST_POSITION'};
  if(!state.demo){Object.assign(state,initialState());state.enabled=true;state.stopped=false;state.demo={startedAt:clock(),commit,phase:'UP',attempts:0};}
  const result=(status,extra={})=>Object.assign(state.demo,{status,checkedAt:clock(),...extra});
  if(!retry&&state.demo.attempts>=8){result('DEMO_ORDER_LIMIT_REACHED',{finished:true});await session.persist(state);return state.demo;}
  stage='ACCOUNT_SNAPSHOT';
  const snapshot=await client.snapshot();
  stage='ACCOUNT_RECONCILIATION';
  reconcile(state,snapshot);const risk=accountRisk(state,snapshot,clock());
  if(retry){
   if(risk.open.length)return state.demo;
   state.demoHistory=[...(state.demoHistory||[]),state.demo];
   state.demoRetryUsed=true;
   if(balanceRecovery)state.demoBalanceSnapshotRecoveryUsed=true;
   if(legacyRecovery)state.demoLegacySnapshotRecoveryUsed=true;
   state.demo={startedAt:clock(),commit,phase:'UP',attempts:0,intentOffset:state.intents.length};
   state.enabled=true;state.stopped=false;
   result('DEMO_RETRY_ARMED');
   await session.persist(state);
   return state.demo;
  }
  if(executionTest&&state.demo.attempts===0&&!risk.open.length&&
   state.intents.slice(state.demo.intentOffset||0).length===0){
   state.demo.mode=DEMO_EXECUTION_TEST;
   state.demo.phase=testSide==='DOWN'?'DOWN':'UP';
  }
  const quick=state.demo.mode===DEMO_EXECUTION_TEST;
  if(quick){
   championSignals=null;
   if(await checkStopped()){result('DEMO_EXECUTION_TEST_STOPPED');await session.persist(state);return state.demo;}
  }
  const stoppedForSubmission=quick?checkStopped:async()=>false;
  state.risk=risk;await session.persist(state);
  const open=risk.open[0];
  if(open&&entryOnly)return {status:'DEMO_TEST_POSITION_ALREADY_OPEN'};
  if(open){
   const side=open.side.toUpperCase();
   const exit=championSignals?(await championSignals()).find(signal=>signal.ticker===open.ticker&&
    ['TAKE PROFIT','SELL FAST','TIME EXIT','EXIT'].some(action=>signal.action===action+' '+side)):null;
   if(championSignals&&!exit){result('DEMO_WAITING_FOR_CHAMPION_EXIT');await session.persist(state);return state.demo;}
   stage='EXIT_QUOTE';
   const quote=await quoteFor(open.ticker);
   if(!quote||quote[open.side+'Bid']<=0){result('DEMO_EXIT_LIQUIDITY_UNAVAILABLE');await session.persist(state);return state.demo;}
   if(exit?.action.startsWith('TAKE PROFIT')&&quote[open.side+'Bid']-open.entryCents<=10){
    result('DEMO_CHAMPION_PROFIT_BID_TOO_LOW');await session.persist(state);return state.demo;
   }
   stage='RECORD_EXIT_ATTEMPT';
   state.demo.attempts++;await session.persist(state);
   stage='SUBMIT_EXIT';
   await submitIntent({state,client,persist:session.persist,checkStopped:stoppedForSubmission,snapshot,signal:exit||{ticker:open.ticker,at:clock()},quote,action:'sell',position:open,now:clock(),clock});
   stage='VERIFY_EXIT';
   const after=await client.snapshot();reconcile(state,after);state.risk=accountRisk(state,after,clock());
   result('DEMO_EXIT_RECONCILED');await session.persist(state);return state.demo;
  }
  const phase=state.demo.phase,side=phase==='UP'?'up':'down';
  const currentIntents=state.intents.slice(state.demo.intentOffset||0);
  const buy=currentIntents.find(i=>i.action==='buy'&&i.side===side);
  if(buy){
   const sold=currentIntents.filter(i=>i.action==='sell'&&i.side===side).reduce((n,i)=>n+(i.filled||0),0);
   if(!(buy.filled>0)||Math.abs(sold-buy.filled)>1e-7){result('DEMO_LIFECYCLE_NOT_FILLED',{finished:true});await session.persist(state);return state.demo;}
   state.demo[side+'RoundTripVerified']=true;
   if(quick){
    const orders=currentIntents.filter(i=>i.filled>0).map(i=>({
     orderId:i.orderId,action:i.action,filled:i.filled,
     feesCents:state.evidence.fills.filter(f=>f.order_id===i.orderId)
      .reduce((total,f)=>total+Number(f.fee_cost)*100,0)
    }));
    result('DEMO_EXECUTION_TEST_VERIFIED',{finished:true,orders});
    await session.persist(state);return state.demo;
   }
   if(championSignals){result('DEMO_CHAMPION_ROUND_TRIP_VERIFIED',{finished:true});await session.persist(state);return state.demo;}
   if(phase==='DOWN'){result('DEMO_BOTH_SIDES_ROUND_TRIP_VERIFIED',{finished:true});await session.persist(state);return state.demo;}
   state.demo.phase='DOWN';await session.persist(state);return state.demo;
  }
  if(exitOnly)return {status:'DEMO_NO_TEST_POSITION'};
  stage='FIND_MARKET';
  const entry=championSignals?(await championSignals()).find(signal=>['BUY UP','BUY DOWN'].includes(signal.action)):null;
  if(championSignals&&!entry){result('DEMO_WAITING_FOR_CHAMPION_ENTRY');await session.persist(state);return state.demo;}
  const market=await findMarket(state.intents.map(i=>i.ticker),entry?.ticker);
  if(!market){result(entry?'DEMO_CHAMPION_CONTRACT_INELIGIBLE':'DEMO_NO_ELIGIBLE_DEFAULT_EXCHANGE_MARKET',
   {marketRejectionReason:marketRejection?.()||'DEMO_MARKET_NOT_VERIFIED'});await session.persist(state);return state.demo;}
  stage='ENTRY_ACCOUNT_SNAPSHOT';
  const entrySnapshot=await client.snapshot();
  stage='ENTRY_QUOTE';
  const quote=await quoteFor(market.ticker);
  if(!quote){result('DEMO_QUOTE_UNAVAILABLE');await session.persist(state);return state.demo;}
  if(entry){
   const side=entry.action==='BUY UP'?'up':'down';
   if(!(quote[side+'Ask']<=entry.entryReference)){
    result('DEMO_CHAMPION_ASK_ABOVE_REFERENCE');await session.persist(state);return state.demo;
   }
   state.demo.phase=side.toUpperCase();
  }
  stage='RECORD_ENTRY_ATTEMPT';
  state.demo.attempts++;await session.persist(state);
  stage='SUBMIT_ENTRY';
  await submitIntent({state,client,persist:session.persist,checkStopped:stoppedForSubmission,snapshot:entrySnapshot,signal:entry||{ticker:market.ticker,action:'BUY '+phase,at:clock()},quote,trialCaps:quick||!!entry,now:clock(),clock});
  stage='VERIFY_ENTRY';
  const after=await client.snapshot();reconcile(state,after);state.risk=accountRisk(state,after,clock());
  result('DEMO_ENTRY_RECONCILED');await session.persist(state);return state.demo;
 }catch(e){
  if(retry&&stage!=='ACCOUNT_SNAPSHOT')throw e;
  // A failed read is not an order attempt. Classify only the fixed GET phase;
  // never propagate raw exception text, URLs, account data, or credentials.
  const safeError=SNAPSHOT_STAGES.has(stage)&&SNAPSHOT_PHASES.has(e?.snapshotPhase)?
    'DEMO_SNAPSHOT_'+e.snapshotPhase+'_READ_FAILED':
   /^[A-Z][A-Z0-9_]{2,64}$/.test(e?.message)?e.message:'DEMO_TRANSPORT_OR_STORAGE_ERROR';
  // Preserve the read phase and an independently allowlisted underlying API/data
  // failure. The phase alone cannot distinguish a 401 from a malformed response.
  const snapshotCause=SNAPSHOT_STAGES.has(stage)&&SNAPSHOT_PHASES.has(e?.snapshotPhase)&&
   /^(?:KALSHI_HTTP_(?:400|401|403|404|408|409|422|429|500|502|503|504)|INVALID_(?:ORDERS|FILLS|MARKET_POSITIONS|SETTLEMENTS)|CURSOR_LOOP|PAGINATION_LIMIT)$/.test(e?.message)?e.message:null;
  state.enabled=false;state.stopped=true;
  state.demo={...state.demo,status:'DEMO_LIFECYCLE_FAILED',stage,error:safeError,
   snapshotPhase:SNAPSHOT_STAGES.has(stage)&&SNAPSHOT_PHASES.has(e?.snapshotPhase)?e.snapshotPhase:undefined,
   snapshotCause:snapshotCause||undefined,finished:true,checkedAt:clock()};
  await session.persist(state);return state.demo;
 }
 finally{await session.release();}
}
