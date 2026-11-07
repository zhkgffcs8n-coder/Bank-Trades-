// Bounded integration test. Caller constructs a DEMO-only client; never production.
import {initialState,reconcile,submitIntent} from '../../../src/live-execution.mjs';
import {accountRisk} from '../../../src/live-accounting.mjs';
export async function runDemoLifecycle({repo,client,findMarket,quoteFor,commit,clock=Date.now}){
 const session=await repo.acquire(),state=session.state;
 try{
  if(state.demo?.finished)return state.demo;
  if(!state.demo){Object.assign(state,initialState());state.enabled=true;state.stopped=false;state.demo={startedAt:clock(),commit,phase:'UP',attempts:0};}
  const result=(status,extra={})=>Object.assign(state.demo,{status,checkedAt:clock(),...extra});
  if(state.demo.attempts>=8){result('DEMO_ORDER_LIMIT_REACHED',{finished:true});await session.persist(state);return state.demo;}
  const snapshot=await client.snapshot();reconcile(state,snapshot);const risk=accountRisk(state,snapshot,clock());
  state.risk=risk;await session.persist(state);
  const open=risk.open[0];
  if(open){
   const quote=await quoteFor(open.ticker);
   if(!quote||quote[open.side+'Bid']<=0){result('DEMO_EXIT_LIQUIDITY_UNAVAILABLE');await session.persist(state);return state.demo;}
   state.demo.attempts++;await session.persist(state);
   await submitIntent({state,client,persist:session.persist,checkStopped:async()=>false,snapshot:await client.snapshot(),signal:{ticker:open.ticker,at:clock()},quote,action:'sell',position:open,now:clock(),clock});
   const after=await client.snapshot();reconcile(state,after);state.risk=accountRisk(state,after,clock());
   result('DEMO_EXIT_RECONCILED');await session.persist(state);return state.demo;
  }
  const phase=state.demo.phase,side=phase==='UP'?'up':'down';
  const buy=state.intents.find(i=>i.action==='buy'&&i.side===side);
  if(buy){
   const sold=state.intents.filter(i=>i.action==='sell'&&i.side===side).reduce((n,i)=>n+(i.filled||0),0);
   if(!(buy.filled>0)||Math.abs(sold-buy.filled)>1e-7){result('DEMO_LIFECYCLE_NOT_FILLED',{finished:true});await session.persist(state);return state.demo;}
   state.demo[side+'RoundTripVerified']=true;
   if(phase==='DOWN'){result('DEMO_BOTH_SIDES_ROUND_TRIP_VERIFIED',{finished:true});await session.persist(state);return state.demo;}
   state.demo.phase='DOWN';await session.persist(state);return state.demo;
  }
  const market=await findMarket(state.intents.map(i=>i.ticker));
  if(!market){result('DEMO_NO_ELIGIBLE_DEFAULT_EXCHANGE_MARKET');await session.persist(state);return state.demo;}
  const quote=await quoteFor(market.ticker);
  if(!quote){result('DEMO_QUOTE_UNAVAILABLE');await session.persist(state);return state.demo;}
  state.demo.attempts++;await session.persist(state);
  await submitIntent({state,client,persist:session.persist,checkStopped:async()=>false,snapshot:await client.snapshot(),signal:{ticker:market.ticker,action:'BUY '+phase,at:clock()},quote,now:clock(),clock});
  const after=await client.snapshot();reconcile(state,after);state.risk=accountRisk(state,after,clock());
  result('DEMO_ENTRY_RECONCILED');await session.persist(state);return state.demo;
 }catch(e){state.enabled=false;state.stopped=true;state.demo={...state.demo,status:'DEMO_LIFECYCLE_FAILED',error:/^[A-Z0-9_:.-]+$/.test(e.message)?e.message:'DEMO_TRANSPORT_OR_STORAGE_ERROR',finished:true,checkedAt:clock()};await session.persist(state);return state.demo;}
 finally{await session.release();}
}
