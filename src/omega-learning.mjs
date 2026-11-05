// OMEGA shared verified-outcome learning. Pure, deterministic, shadow-only.
// All models receive the SAME market/round settlement; no fabricated wins.
import {evaluateOmegaFusion} from './omega-fusion.mjs';
const validP=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
export function scoreVerifiedRound(fusion,settlement){
 if(fusion?.status!=='SHADOW_RESEARCH')return {status:'BLOCKED',reason:'No valid pre-settlement research snapshot'};
 if(!settlement||settlement.marketTicker!==fusion.marketTicker||settlement.roundId!==fusion.roundId||
  ![0,1].includes(settlement.upOutcome)||settlement.verified!==true||
  !Number.isSafeInteger(settlement.settledAtMs)||settlement.settledAtMs<=0)
  return {status:'BLOCKED',reason:'Missing verified matching settlement'};
 if(!fusion.accepted.every(f=>Number.isSafeInteger(f.observedAtMs)&&f.observedAtMs<settlement.settledAtMs))
  return {status:'BLOCKED',reason:'Lookahead leakage detected'};
 const outcome=settlement.upOutcome;
 const scores=fusion.accepted.map(f=>({provider:f.provider,brier:(f.upProbability-outcome)**2}));
 if(validP(fusion.marketBaseline))scores.push({provider:'kalshi_baseline',brier:(fusion.marketBaseline-outcome)**2});
 return {status:'VERIFIED_SHADOW_SCORE',marketTicker:fusion.marketTicker,roundId:fusion.roundId,scores,ordersAuthorized:false};
}
export function summarizeVerifiedScores(records=[]){
 const byProvider=new Map(),seen=new Set();
 for(const record of records){
  if(record?.status!=='VERIFIED_SHADOW_SCORE'||typeof record.marketTicker!=='string'||typeof record.roundId!=='string')continue;
  const key=record.marketTicker+'|'+record.roundId;
  if(seen.has(key))continue;
  seen.add(key);
  for(const score of record.scores||[]){
   if(typeof score.provider!=='string'||!Number.isFinite(score.brier)||score.brier<0||score.brier>1)continue;
   const s=byProvider.get(score.provider)||{provider:score.provider,count:0,totalBrier:0};
   s.count++;s.totalBrier+=score.brier;byProvider.set(score.provider,s);
  }
 }
 return [...byProvider.values()].map(x=>({provider:x.provider,verifiedRounds:x.count,meanBrier:x.totalBrier/x.count}))
  .sort((a,b)=>a.meanBrier-b.meanBrier);
}
// Build a research observation; deliberately no order execution or model API credentials.
export function omegaStudyRound({marketTicker,roundId,nowMs,forecasts,marketBaseline,settlement}={}){
 const fusion=evaluateOmegaFusion({marketTicker,roundId,nowMs,forecasts,marketBaseline});
 return {fusion,verification:settlement?scoreVerifiedRound(fusion,settlement):null,ordersAuthorized:false};
}
