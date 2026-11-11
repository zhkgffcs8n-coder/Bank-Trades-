// Bounded integration test. Caller constructs a DEMO-only client; never production.
import {initialState,reconcile,submitIntent} from '../../../src/live-execution.mjs';
import {accountRisk} from '../../../src/live-accounting.mjs';
const SNAPSHOT_PHASES=new Set(['BALANCE','ORDERS','FILLS','POSITIONS','SETTLEMENTS']);
const SNAPSHOT_STAGES=new Set(['ACCOUNT_SNAPSHOT','ENTRY_ACCOUNT_SNAPSHOT','VERIFY_EXIT']);
const SNAPSHOT_READ_FAILURES=new Set([...SNAPSHOT_PHASES].map(phase=>'DEMO_SNAPSHOT_'+phase+'_READ_FAILED'));
const retryableSnapshotFailure=code=>code==='DEMO_TRANSPORT_OR_STORAGE_ERROR'||SNAPSHOT_READ_FAILURES.has(code);
export async function runDemoLifecycle({repo,client,findMarket,marketRejection,quoteFor,commit,championSignals,clock=Date.now}){
 const session=await repo.acquire(),state=session.state;
 let stage='INITIALIZE';
 let retry=false,legacyRecovery=false;
 try{
  // Older runs could consume the retry before failing on their first account read.
  // A separate one-time recovery is limited to the legacy zero-attempt record.
  const previous=state.demo;
  legacyRecovery=state.demoRetryUsed===true&&!state.demoLegacySnapshotRecoveryUsed&&
   previous?.stage==='ACCOUNT_SNAPSHOT'&&previous.error==='DEMO_TRANSPORT_OR_STORAGE_ERROR'&&
   previous.commit==null&&previous.attempts===0&&previous.intentOffset===state.intents.length&&
   state.intents.every(intent=>['ABORTED','RECONCILED'].includes(intent.status));
  retry=state.demo?.status==='DEMO_LIFECYCLE_FAILED'&&state.demo.finished&&
   (!state.demoRetryUsed||legacyRecovery)&&retryableSnapshotFailure(state.demo.error);
  if(state.demo?.finished&&!retry)return state.demo;
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
   if(legacyRecovery)state.demoLegacySnapshotRecoveryUsed=true;
   state.demo={startedAt:clock(),commit,phase:'UP',attempts:0,intentOffset:state.intents.length};
   state.enabled=true;state.stopped=false;
   result('DEMO_RETRY_ARMED');
   await session.persist(state);
   return state.demo;
  }
  state.risk=risk;await session.persist(state);
  const open=risk.open[0];
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
   await submitIntent({state,client,persist:session.persist,checkStopped:async()=>false,snapshot,signal:exit||{ticker:open.ticker,at:clock()},quote,action:'sell',position:open,now:clock(),clock});
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
   if(championSignals){result('DEMO_CHAMPION_ROUND_TRIP_VERIFIED',{finished:true});await session.persist(state);return state.demo;}
   if(phase==='DOWN'){result('DEMO_BOTH_SIDES_ROUND_TRIP_VERIFIED',{finished:true});await session.persist(state);return state.demo;}
   state.demo.phase='DOWN';await session.persist(state);return state.demo;
  }
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
  await submitIntent({state,client,persist:session.persist,checkStopped:async()=>false,snapshot:entrySnapshot,signal:entry||{ticker:market.ticker,action:'BUY '+phase,at:clock()},quote,trialCaps:!!entry,now:clock(),clock});
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
