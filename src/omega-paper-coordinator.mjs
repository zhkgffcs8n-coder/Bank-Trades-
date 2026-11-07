// Deterministic paper-only market/round coordinator. No network or real order capabilities.
import {paperEntry,paperExit} from './omega-paper-ledger.mjs';
const validTime=x=>Number.isSafeInteger(x)&&x>0;
export function advanceOmegaPaper({state={},signal,quote,roundId,feesDollars,nowMs,stakeDollars=5,slippageDollars=0,exitAtProfitDollars=.5,exitAtLossDollars=-.5,trailingArmDollars=.5,trailingGivebackDollars=.25}={}){
 const positions=state.positions&&typeof state.positions==='object'?state.positions:{};
 const entered=state.entered&&typeof state.entered==='object'?state.entered:{};
 if(!validTime(nowMs)||typeof roundId!=='string'||!roundId||!quote?.ticker)
  return {status:'BLOCKED',reason:'Missing market round or timestamp',state,realOrdersAuthorized:false};
 const ticker=quote.ticker,key=ticker+'|'+roundId,position=positions[ticker];
 if(position?.status==='OPEN'){
  if(position.roundId!==roundId)return {status:'BLOCKED',reason:'Previous round position requires explicit settlement',state,realOrdersAuthorized:false};
  const marked=paperExit({position,quote,feesDollars,slippageDollars,nowMs});
  if(marked.status!=='PAPER_CLOSED')return {status:'BLOCKED',reason:marked.reasons.join('; '),state,realOrdersAuthorized:false};
  const peak=Math.max(Number.isFinite(position.peakNetDollars)?position.peakNetDollars:marked.netDollars,marked.netDollars);
  const trailingEnabled=Number.isFinite(trailingArmDollars)&&trailingArmDollars>=0&&Number.isFinite(trailingGivebackDollars)&&trailingGivebackDollars>0;
  const trailingExit=trailingEnabled&&peak>=trailingArmDollars&&peak-marked.netDollars>=trailingGivebackDollars;
  const shouldExit=marked.netDollars>=exitAtProfitDollars||marked.netDollars<=exitAtLossDollars||trailingExit;
  if(!shouldExit){
   const next={...state,positions:{...positions,[ticker]:{...position,peakNetDollars:peak}},entered};
   return {status:'PAPER_HOLD',unrealizedNetDollars:marked.netDollars,peakNetDollars:peak,state:next,realOrdersAuthorized:false};
  }
  const next={...state,positions:{...positions,[ticker]:{...position,status:'CLOSED',closedAtMs:nowMs,netDollars:marked.netDollars,peakNetDollars:peak,exitReason:trailingExit?'TRAILING_PROFIT':marked.netDollars>=exitAtProfitDollars?'TAKE_PROFIT':'LOSS_LIMIT'}},entered};
  return {status:'PAPER_EXIT',netDollars:marked.netDollars,state:next,realOrdersAuthorized:false};
 }
 // A persisted terminal position is an irreversible entry record even if a
 // legacy/interrupted write lost the separate `entered` marker. Never overwrite
 // a CLOSED or SETTLED position with another simulated entry for this ticker.
 if(position)return {status:'BLOCKED',reason:'Market round already has a persisted position',state,realOrdersAuthorized:false};
 if(entered[key])return {status:'BLOCKED',reason:'Already entered this market round',state,realOrdersAuthorized:false};
 if(signal?.marketTicker!==ticker||signal?.roundId!==roundId)return {status:'BLOCKED',reason:'Signal contract or round mismatch',state,realOrdersAuthorized:false};
 const opened=paperEntry({signal,quote,feesDollars,slippageDollars,nowMs,stakeDollars});
 if(opened.status!=='PAPER_OPEN')return {status:'BLOCKED',reason:opened.reasons.join('; '),state,realOrdersAuthorized:false};
 const next={...state,entered:{...entered,[key]:true},positions:{...positions,[ticker]:{...opened.position,roundId}}};
 return {status:'PAPER_ENTRY',position:next.positions[ticker],state:next,realOrdersAuthorized:false};
}
