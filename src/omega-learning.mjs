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
 return {status:'VERIFIED_SHADOW_SCORE',marketTicker:fusion.marketTicker,roundId:fusion.roundId,predictedAtMs:Math.max(...fusion.accepted.map(f=>f.observedAtMs)),scores,ordersAuthorized:false};
}
export function summarizeVerifiedScores(records=[]){
 // Score each round once. Conflicting archived records must not let the
 // first-encountered forecast determine the public performance summary.
 const rounds=new Map(),conflicts=new Set();
 for(const record of records){
  if(record?.status!=='VERIFIED_SHADOW_SCORE'||typeof record.marketTicker!=='string'||!record.marketTicker||
   typeof record.roundId!=='string'||!record.roundId||!Array.isArray(record.scores))continue;
  const scores=new Map();
  let valid=true;
  for(const score of record.scores){
   if(typeof score?.provider!=='string'||!score.provider||!Number.isFinite(score.brier)||
    score.brier<0||score.brier>1||scores.has(score.provider)){valid=false;break;}
   scores.set(score.provider,score.brier);
  }
  if(!valid||!scores.size)continue;
  const key=JSON.stringify([record.marketTicker,record.roundId]);
  const fingerprint=JSON.stringify([...scores].sort((a,b)=>a[0].localeCompare(b[0])));
  if(rounds.has(key)){
   if(rounds.get(key).fingerprint!==fingerprint)conflicts.add(key);
  }else rounds.set(key,{scores,fingerprint});
 }
 const byProvider=new Map();
 for(const [key,{scores}] of rounds){
  if(conflicts.has(key))continue;
  for(const [provider,brier] of scores){
   const s=byProvider.get(provider)||{provider,count:0,totalBrier:0};
   s.count++;s.totalBrier+=brier;byProvider.set(provider,s);
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

/**
 * Prospective shadow champion selection: choose using only rounds strictly
 * earlier than the evaluation round. This avoids choosing a model using the
 * outcome it is being evaluated on. Never routes orders.
 */
export function walkForwardChampionAudit(records=[],{minimumHistory=30,minimumImprovement=.01}={}){
 if(!Number.isSafeInteger(minimumHistory)||minimumHistory<2||
  !Number.isFinite(minimumImprovement)||minimumImprovement<0||minimumImprovement>1)
  return {status:'INVALID_POLICY',evaluated:0,ordersAuthorized:false};
 const keys=new Set(),conflicts=new Set(),valid=[];
 for(const r of records){
  if(r?.status!=='VERIFIED_SHADOW_SCORE'||typeof r.marketTicker!=='string'||!r.marketTicker||
   typeof r.roundId!=='string'||!r.roundId||!Number.isSafeInteger(r.predictedAtMs)||r.predictedAtMs<=0||
   !Number.isSafeInteger(r.settledAtMs)||r.settledAtMs<=r.predictedAtMs)continue;
  const key=JSON.stringify([r.marketTicker,r.roundId]);
  if(keys.has(key)){conflicts.add(key);continue;}
  keys.add(key);
  const scores=new Map();
  for(const s of r.scores||[]){
   if(typeof s.provider!=='string'||!s.provider||!Number.isFinite(s.brier)||s.brier<0||s.brier>1||scores.has(s.provider)){
    scores.clear();break;
   }
   scores.set(s.provider,s.brier);
  }
  if(scores.has('kalshi_baseline'))valid.push({key,at:r.predictedAtMs,settledAtMs:r.settledAtMs,scores});
 }
 valid.sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key));
 const clean=valid.filter(x=>!conflicts.has(x.key)),decisions=[];
 for(let i=minimumHistory;i<clean.length;i++){
  const current=clean[i],past=clean.slice(0,i).filter(x=>x.at<current.at&&x.settledAtMs<current.at);
  if(past.length<minimumHistory)continue;
  const providers=new Set(past.flatMap(x=>[...x.scores.keys()].filter(p=>p!=='kalshi_baseline')));
  const ranked=[];
  for(const provider of providers){
   const paired=past.filter(x=>x.scores.has(provider));
   if(paired.length<minimumHistory)continue;
   const gain=paired.reduce((sum,x)=>sum+x.scores.get('kalshi_baseline')-x.scores.get(provider),0)/paired.length;
   if(gain>=minimumImprovement)ranked.push({provider,gain});
  }
  ranked.sort((a,b)=>b.gain-a.gain||a.provider.localeCompare(b.provider));
  const selected=ranked.find(x=>current.scores.has(x.provider));
  if(!selected)continue;
  decisions.push({marketTicker:JSON.parse(current.key)[0],roundId:JSON.parse(current.key)[1],
   provider:selected.provider,modelBrier:current.scores.get(selected.provider),
   baselineBrier:current.scores.get('kalshi_baseline')});
 }
 const count=decisions.length,mean=key=>count?decisions.reduce((sum,x)=>sum+x[key],0)/count:null;
 const modelBrier=mean('modelBrier'),baselineBrier=mean('baselineBrier');
 return {status:count?'FORWARD_SHADOW_EVALUATED':'INSUFFICIENT_FORWARD_EVIDENCE',
  evaluated:count,modelBrier,baselineBrier,improvement:count?baselineBrier-modelBrier:null,
  selected:decisions.slice(-20).map(x=>({marketTicker:x.marketTicker,roundId:x.roundId,provider:x.provider})),
  beatsMarketBaseline:count>=20&&modelBrier<baselineBrier,
  originalPrimalComparison:'NOT_VERIFIED',promoted:false,ordersAuthorized:false,
  notice:'Strict settled-before-selection model history; observed performance is not a guarantee. Original Primal requires paired independently logged predictions.'};
}
