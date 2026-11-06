import {reconcile,submitIntent,emergencyStop,exitAction} from './live-execution.mjs';
import {accountRisk} from './live-accounting.mjs';
export async function runLiveCycle({repo,client,signals,quoteFor,canTrade,now=Date.now()}){
 const session=await repo.acquire(),state=session.state,persist=session.persist;
 try{
  // A stop blocks entries immediately, but does not claim cancellation while an order is unknown.
  if(await repo.stopped()||state.stopped||!canTrade){
   state.enabled=false;state.stopped=true;await persist(state);
   if(!state.intents.length)return {status:'STOPPED',cancelled:true};
   try{reconcile(state,await client.snapshot());await persist(state);}catch{}
   return {status:'STOPPED',...await emergencyStop({state,client,persist})};
  }
  const snap=await client.snapshot();reconcile(state,snap);const risk=accountRisk(state,snap);state.lastReconciledAt=Date.now();state.risk=risk;await persist(state);
  for(const p of risk.open){
   const quote=await quoteFor(p.ticker);if(!quote)throw Error('EXIT_QUOTE_UNAVAILABLE');
   state.peaks??={};state.peaks[p.ticker]=Math.max(state.peaks[p.ticker]||p.entryCents,quote[p.side+'Bid']);await persist(state);
   const reason=exitAction({...p,bidCents:quote[p.side+'Bid'],peakCents:state.peaks[p.ticker],profitPct:state.limits.profitPct,stopPct:state.limits.stopPct});
   if(reason||risk.dailyLossCents+risk.openCostCents>=state.limits.lossCents||quote.expiresAt-Date.now()<30000){
    const intent=await submitIntent({state,client,persist,checkStopped:repo.stopped,snapshot:await client.snapshot(),signal:{ticker:p.ticker,at:Date.now()},quote,action:'sell',position:p});
    reconcile(state,await client.snapshot());await persist(state);return {status:'EXIT_SUBMITTED',reason:reason||'RISK_OR_EXPIRY',id:intent.id};
   }
  }
  if(risk.dailyLossCents+risk.openCostCents>=state.limits.lossCents)return {status:'RISK_LIMIT',risk};
  for(const signal of await signals()){
   if(!['BUY UP','BUY DOWN'].includes(signal.action)||state.intents.some(i=>i.ticker===signal.ticker&&i.action==='buy'))continue;
   const quote=await quoteFor(signal.ticker);if(!quote)continue;
   const intent=await submitIntent({state,client,persist,checkStopped:repo.stopped,snapshot:await client.snapshot(),signal,quote});
   reconcile(state,await client.snapshot());await persist(state);return {status:'ENTRY_SUBMITTED',id:intent.id};
  }
  return {status:'MONITORING',risk};
 }catch(e){state.enabled=false;state.stopped=true;state.failure=e.message;await repo.stop();await persist(state);throw e;}
 finally{
  // STOP arriving during the exchange request is drained before releasing the lock.
  try{if(await repo.stopped()&&state.intents.length){try{reconcile(state,await client.snapshot());await persist(state);}catch{}await emergencyStop({state,client,persist});}}finally{await session.release();}
 }
}
