// Server-only research orchestration: provider adapters -> fusion -> verified scoring.
// No orders. Caller must supply authenticated, trustworthy market snapshots and settlement records.
import {supportedOmegaProviders,fetchOmegaResearchForecast} from './omega-provider-adapters.mjs';
import {evaluateOmegaFusion} from './omega-fusion.mjs';
import {scoreVerifiedRound,summarizeVerifiedScores} from './omega-learning.mjs';
export async function runOmegaResearchRound({marketTicker,roundId,marketSnapshot,marketBaseline,nowMs,env={},fetchImpl,providers=supportedOmegaProviders}={}){
 if(!Number.isSafeInteger(nowMs)||nowMs<=0||typeof marketTicker!=='string'||!marketTicker||
 typeof roundId!=='string'||!roundId||!marketSnapshot||typeof marketSnapshot!=='object')
 return {status:'BLOCKED',reason:'Invalid market observation',ordersAuthorized:false};
 const requested=[...new Set(providers)].filter(p=>supportedOmegaProviders.includes(p));
 const outcomes=await Promise.all(requested.map(provider=>fetchOmegaResearchForecast({provider,marketTicker,roundId,marketSnapshot,nowMs,env,fetchImpl})));
 const forecasts=outcomes.filter(x=>x.status==='RESEARCH_FORECAST');
 const fusion=evaluateOmegaFusion({marketTicker,roundId,nowMs,marketBaseline,forecasts});
 return {status:fusion.status,fusion,providerStatus:outcomes.map(x=>({provider:x.provider,status:x.status,...(Number.isInteger(x.httpStatus)?{httpStatus:x.httpStatus}:{}),...(x.errorCode?{errorCode:x.errorCode}:{})})),ordersAuthorized:false};
}
export function evaluateOmegaVerifiedBatch({rounds=[],settlements=[]}={}){
 const verified=new Map(),conflicts=new Set();
 for(const s of settlements){
  if(s?.verified!==true||typeof s.marketTicker!=='string'||typeof s.roundId!=='string'||
   ![0,1].includes(s.upOutcome)||!Number.isSafeInteger(s.settledAtMs)||s.settledAtMs<=0)continue;
  const key=s.marketTicker+'|'+s.roundId;
  const prior=verified.get(key);
  // Contradictory official records must never silently overwrite a result.
  if(prior&&(prior.upOutcome!==s.upOutcome||prior.settledAtMs!==s.settledAtMs))conflicts.add(key);
  else if(!prior)verified.set(key,s);
 }
 // Exactly one scored observation per market/round. Identical replays are
 // harmless; conflicting frozen forecasts invalidate the round rather than
 // allowing whichever happened to arrive first to inflate the scorecard.
 const frozen=new Map(),forecastConflicts=new Set();
 let duplicateForecastsExcluded=0;
 for(const round of rounds){
  const f=round?.fusion;
  if(f?.status!=='SHADOW_RESEARCH'||typeof f.marketTicker!=='string'||typeof f.roundId!=='string')continue;
  const key=f.marketTicker+'|'+f.roundId,signature=JSON.stringify(f);
  if(frozen.has(key)){
   duplicateForecastsExcluded++;
   if(frozen.get(key).signature!==signature)forecastConflicts.add(key);
  }else frozen.set(key,{fusion:f,signature});
 }
 const records=[];
 for(const [key,{fusion}] of frozen){
  if(forecastConflicts.has(key)||conflicts.has(key))continue;
  const settlement=verified.get(key);
  if(!settlement)continue;
  const score=scoreVerifiedRound(fusion,settlement);
  if(score.status==='VERIFIED_SHADOW_SCORE')records.push(score);
 }
 return {status:'RESEARCH_ONLY',verifiedScores:summarizeVerifiedScores(records),verifiedRounds:records.length,
  duplicateForecastsExcluded,conflictingForecastRoundsExcluded:forecastConflicts.size,
  conflictingSettlementsExcluded:conflicts.size,ordersAuthorized:false,
  notice:'Historical scoring does not establish out-of-sample improvement or authorize trades.'};
}
