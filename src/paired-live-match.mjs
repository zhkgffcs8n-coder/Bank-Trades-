import {SETTLEMENT_VERIFICATION} from './official-settlement.mjs';
// Strict observational matching. Never attribute a live signal win to Primal
// based on shared ticker alone, rounded time windows, or aggregate win rates.
export function matchLiveObservation(pair, live) {
 if (!pair?.ticker || !Number.isFinite(pair.at)) return {status:'NO_PAIRED_SNAPSHOT',reason:'No timestamped frozen A+B snapshot'};
 if (!live) return {status:'NO_LIVE_OBSERVATION',reason:'No separately frozen Live Market Signals observation for this contract'};
 if (live.ticker!==pair.ticker) return {status:'UNMATCHED',reason:'Different Kalshi contract ticker'};
 if (!Number.isFinite(live.at)||live.at!==pair.at) return {status:'UNMATCHED',reason:'Different observation timestamp; no cross-credit'};
 // Same quote/time is not enough if one record was created after expiry or
 // carries a different/missing contract expiration. Reject legacy ambiguous rows.
 if (!Number.isFinite(pair.expiresAt)||!Number.isFinite(live.expiresAt)||
     pair.expiresAt!==live.expiresAt||pair.at>=pair.expiresAt||live.at>=live.expiresAt)
  return {status:'UNMATCHED',reason:'Missing/different expiration or observation not frozen before expiry; no cross-credit'};
 for (const k of ['yesAsk','noAsk','yesBid','noBid']) {
  const dollars=Number(pair.quote?.[k]),cents=Number(live.quote?.[k]);
  if (pair.quote?.[k]==null||live.quote?.[k]==null||live.quote?.[k]===''||!Number.isFinite(dollars)||!Number.isFinite(cents)||Math.abs(dollars-cents/100)>1e-9)
   return {status:'UNMATCHED',reason:'Different or missing '+k+' quote; no cross-credit'};
 }
 if (pair.status!=='RESOLVED'||pair.settlement?.verified!==true||!['yes','no'].includes(pair.settlement?.result)||
     pair.settlement?.source!=='strict Kalshi finalized binary label'||
     !Number.isFinite(pair.settlement?.at)||pair.settlement.at<pair.expiresAt||
     live.status!=='RESOLVED'||live.outcomeVerification!==SETTLEMENT_VERIFICATION||
     !Number.isFinite(live.resolvedAt)||live.resolvedAt<live.expiresAt||
     live.outcome!==pair.settlement.result)
  return {status:'PENDING_VERIFICATION',reason:'Both observations require the same independently verified official settlement'};
 return {status:'EXACT_VERIFIED_MATCH',reason:'Same ticker, timestamp, quote and verified outcome; no evidence of fills or net profit',
  liveAction:live.action||'WAIT',primalConsensus:pair.hybrid?.researchConsensus||null,
  costAdjustedPnl:null,tradeAuthorization:false};
}
