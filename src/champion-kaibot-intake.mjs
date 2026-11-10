import {replayChampionScalper} from './champion-scalper-replay.mjs';

// This consumer records signal parity only. A reference position is never
// interpreted as a filled or executable exchange position.
export function inspectChampionIntake(worker,now=Date.now()){
 const signal=worker?.championShadow;
 if(!signal||signal.mode!=='SHADOW_ONLY')return {status:'NO_SIGNAL'};
 const ageMs=now-signal.at;
 if(!worker.feeds?.kalshiAuthenticated||!Number.isFinite(ageMs)||ageMs<0||ageMs>10000)
  return {status:'STALE_OR_UNAUTHENTICATED'};
 if(!/^KXBTC15M-/.test(signal.ticker)||signal.inputs?.ticker!==signal.ticker)
  return {status:'INVALID_CONTRACT'};
 const expected=replayChampionScalper(signal.inputs,signal.previousReference);
 const fields=['ticker','side','entry','exit','exitBid'];
 const samePosition=!!expected.position===!!signal.position&&
  fields.every(field=>expected.position?.[field]===signal.position?.[field]);
 if(expected.action!==signal.action||!samePosition)return {status:'PARITY_MISMATCH'};
 return {status:'SHADOW_PARITY_MATCH',ticker:signal.ticker,action:signal.action,
  observedAt:signal.at,ageMs};
}

export function championExecutionSignals(worker,now=Date.now()){
 const evidence=inspectChampionIntake(worker,now);
 if(evidence.status!=='SHADOW_PARITY_MATCH')return [];
 const signal=worker.championShadow;
 if(!/^(BUY|HOLD|TAKE PROFIT|SELL FAST|TIME EXIT|EXIT) (UP|DOWN)$/.test(signal.action)||
  !Number.isFinite(signal.position?.entry))return [];
 return [{ticker:signal.ticker,action:signal.action,at:signal.at,entryReference:signal.position.entry}];
}
