// Bounded integration test. Caller constructs a DEMO-only client; never production.
import {initialState,reconcile,submitIntent} from '../../../src/live-execution.mjs';
import {accountRisk} from '../../../src/live-accounting.mjs';
export async function runDemoLifecycle({repo,client,findMarket,quoteFor,commit,clock=Date.now}){
 const session=await repo.acquire(),state=session.state;
 let stage='INITIALIZE';
 let retry=false;
 try{
  retry=state.demo?.status==='DEMO_LIFECYCLE_FAILED'&&state.demo.finished&&
   !state.demoRetryUsed&&state.demo.error==='DEMO_TRANSPORT_OR_STORAGE_ERROR';
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
   state.demo={startedAt:clock(),commit,phase:'UP',attempts:0,intentOffset:state.intents.length};
   state.enabled=true;state.stopped=false;
   result('DEMO_RETRY_ARMED');
   await session.persist(state);
   return state.demo;
  }
  state.risk=risk;await session.persist(state);
  const open=risk.open[0];
  if(open){
   stage='EXIT_QUOTE';
   const quote=await quoteFor(open.ticker);
   if(!quote||quote[open.side+'Bid']<=0){result('DEMO_EXIT_LIQUIDITY_UNAVAILABLE');await session.persist(state);return state.demo;}
   stage='RECORD_EXIT_ATTEMPT';
   state.demo.attempts++;await session.persist(state);
   stage='SUBMIT_EXIT';
   await submitIntent({state,client,persist:session.persist,checkStopped:async()=>false,snapshot,signal:{ticker:open.ticker,at:clock()},quote,action:'sell',position:open,now:clock(),clock});
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
   if(phase==='DOWN'){result('DEMO_BOTH_SIDES_ROUND_TRIP_VERIFIED',{finished:true});await session.persist(state);return state.demo;}
   state.demo.phase='DOWN';await session.persist(state);return state.demo;
  }
  stage='FIND_MARKET';
  const market=await findMarket(state.intents.map(i=>i.ticker));
  if(!market){result('DEMO_NO_ELIGIBLE_DEFAULT_EXCHANGE_MARKET');await session.persist(state);return state.demo;}
  stage='ENTRY_ACCOUNT_SNAPSHOT';
  const entrySnapshot=await client.snapshot();
  stage='ENTRY_QUOTE';
  const quote=await quoteFor(market.ticker);
  if(!quote){result('DEMO_QUOTE_UNAVAILABLE');await session.persist(state);return state.demo;}
  stage='RECORD_ENTRY_ATTEMPT';
  state.demo.attempts++;await session.persist(state);
  stage='SUBMIT_ENTRY';
  await submitIntent({state,client,persist:session.persist,checkStopped:async()=>false,snapshot:entrySnapshot,signal:{ticker:market.ticker,action:'BUY '+phase,at:clock()},quote,now:clock(),clock});
  stage='VERIFY_ENTRY';
  const after=await client.snapshot();reconcile(state,after);state.risk=accountRisk(state,after,clock());
  result('DEMO_ENTRY_RECONCILED');await session.persist(state);return state.demo;
 }catch(e){if(retry)throw e;state.enabled=false;state.stopped=true;state.demo={...state.demo,status:'DEMO_LIFECYCLE_FAILED',stage,error:/^[A-Z][A-Z0-9_]{2,64}$/.test(e?.message)?e.message:'DEMO_TRANSPORT_OR_STORAGE_ERROR',finished:true,checkedAt:clock()};await session.persist(state);return state.demo;}
 finally{await session.release();}
}
