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
 const measure=(provider,probability)=>({provider,brier:(probability-outcome)**2,correct:probability===.5?null:Number(probability>.5)===outcome});
 const scores=fusion.accepted.map(f=>measure(f.provider,f.upProbability));
 if(fusion.accepted.length>=2)scores.push(measure('omega_consensus',fusion.accepted.reduce((sum,f)=>sum+f.upProbability,0)/fusion.accepted.length));
 if(validP(fusion.marketBaseline))scores.push(measure('kalshi_baseline',fusion.marketBaseline));
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

/**
 * Chronological, leakage-resistant research leaderboard. A candidate is eligible
 * only after beating the same-round market baseline on a held-out suffix.
 * This is an observation, never an authorization to trade or auto-promote.
 */
export function evaluateResearchChampions(records=[],{minimumTrain=30,minimumHoldout=20,minimumImprovement=0.01}={}){
 const safeCount=n=>Number.isSafeInteger(n)&&n>=1;
 if(!safeCount(minimumTrain)||!safeCount(minimumHoldout)||
  !Number.isFinite(minimumImprovement)||minimumImprovement<0||minimumImprovement>1)
  return {status:'INVALID_POLICY',leaderboard:[],champion:null,ordersAuthorized:false};
 const rounds=new Map(),conflicts=new Set();
 for(const r of records){
  if(r?.status!=='VERIFIED_SHADOW_SCORE'||typeof r.marketTicker!=='string'||!r.marketTicker||
   typeof r.roundId!=='string'||!r.roundId||!Number.isSafeInteger(r.predictedAtMs)||r.predictedAtMs<=0)continue;
  const key=JSON.stringify([r.marketTicker,r.roundId]);
  const scores=new Map();
  for(const s of r.scores||[]){
   if(typeof s.provider!=='string'||!s.provider||!Number.isFinite(s.brier)||s.brier<0||s.brier>1||
    scores.has(s.provider)){scores.clear();break;}
   scores.set(s.provider,s.brier);
  }
  if(!scores.has('kalshi_baseline'))continue;
  if(rounds.has(key)){conflicts.add(key);continue;}
  rounds.set(key,{key,at:r.predictedAtMs,scores});
 }
 const ordered=[...rounds.values()].filter(r=>!conflicts.has(r.key))
  .sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key));
 const providers=new Set(ordered.flatMap(r=>[...r.scores.keys()].filter(p=>p!=='kalshi_baseline')));
 const leaderboard=[];
 for(const provider of providers){
  const paired=ordered.filter(r=>r.scores.has(provider));
  if(paired.length<minimumTrain+minimumHoldout)continue;
  const holdout=paired.slice(-minimumHoldout);
  const mean=p=>holdout.reduce((sum,r)=>sum+r.scores.get(p),0)/holdout.length;
  const baselineBrier=mean('kalshi_baseline'),modelBrier=mean(provider);
  leaderboard.push({provider,trainingRounds:paired.length-holdout.length,holdoutRounds:holdout.length,
   modelBrier,baselineBrier,improvement:baselineBrier-modelBrier,
   eligible:baselineBrier-modelBrier>=minimumImprovement});
 }
 leaderboard.sort((a,b)=>b.improvement-a.improvement||a.provider.localeCompare(b.provider));
 return {status:leaderboard.length?'HOLDOUT_EVALUATED':'INSUFFICIENT_VERIFIED_HISTORY',
  leaderboard,champion:leaderboard.find(x=>x.eligible)?.provider??null,
  promoted:false,ordersAuthorized:false,
  notice:'Research-only holdout comparison. Overlapping or correlated rounds and repeated selection can overstate performance; independent forward validation is still required.'};
}
