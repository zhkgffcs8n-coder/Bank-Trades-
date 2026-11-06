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
 return {status:fusion.status,fusion,providerStatus:outcomes.map(x=>({provider:x.provider,status:x.status,...(Number.isInteger(x.httpStatus)?{httpStatus:x.httpStatus}:{})})),ordersAuthorized:false};
}
export function evaluateOmegaVerifiedBatch({rounds=[],settlements=[]}={}){
 const verified=new Map();
 for(const s of settlements){
  if(s?.verified===true&&typeof s.marketTicker==='string'&&typeof s.roundId==='string')
   verified.set(s.marketTicker+'|'+s.roundId,s);
 }
 const records=[];
 for(const round of rounds){
  const f=round?.fusion;
  if(f?.status!=='SHADOW_RESEARCH')continue;
  const s=verified.get(f.marketTicker+'|'+f.roundId);
  if(!s)continue;
  const score=scoreVerifiedRound(f,s);
  if(score.status==='VERIFIED_SHADOW_SCORE')records.push(score);
 }
 return {status:'RESEARCH_ONLY',verifiedScores:summarizeVerifiedScores(records),verifiedRounds:records.length,ordersAuthorized:false,
  notice:'Historical scoring does not establish out-of-sample improvement or authorize trades.'};
}
