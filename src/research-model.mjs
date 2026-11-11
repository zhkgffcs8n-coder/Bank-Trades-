// A small online residual model for prospective PAPER research only.
// The original prediction is stored before the outcome is known (prequential evaluation).
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const initialModel=()=>({weights:[0,0,0,0],count:0,brier:0,baselineBrier:0});
export function validFeatures(x){return Array.isArray(x)&&x.length===4&&x.every(n=>Number.isFinite(n)&&Math.abs(n)<=1);}
export function predict(model,baseline,x){
 if(!validFeatures(x)||!Number.isFinite(baseline)||baseline<=0||baseline>=1)throw Error('Invalid research observation');
 const prior=clamp(baseline,.02,.98),logit=Math.log(prior/(1-prior));
 const residual=x.reduce((s,v,i)=>s+v*model.weights[i],0);
 return 1/(1+Math.exp(-clamp(logit+residual,-5,5)));
}
export function learn(model,observation,outcome){
 if(!validFeatures(observation.features)||![0,1].includes(outcome)||!Number.isFinite(observation.prediction)||observation.prediction<=0||observation.prediction>=1||!Number.isFinite(observation.baseline)||observation.baseline<=0||observation.baseline>=1)throw Error('Invalid finalized observation');
 // Evaluate the actual earlier prediction, never a fit recomputed after seeing the result.
 const p=observation.prediction,rate=.03/Math.sqrt(1+model.count/100);
 return {weights:model.weights.map((w,i)=>clamp(w-rate*((p-outcome)*observation.features[i]+.002*w),-1,1)),count:model.count+1,
  brier:model.brier+(p-outcome)**2,baselineBrier:model.baselineBrier+(observation.baseline-outcome)**2};
}

// Do not surface a learned forecast as validated until it beats the frozen baseline
// on a minimum number of prospectively scored, finalized observations.
export function modelValidated(model,minCount=100){
 return !!model&&Number.isInteger(model.count)&&model.count>=minCount&&Number.isFinite(model.brier)&&Number.isFinite(model.baselineBrier)&&model.brier>=0&&model.baselineBrier>=0&&model.brier<model.baselineBrier&&Array.isArray(model.weights)&&model.weights.length===4&&model.weights.every(w=>Number.isFinite(w)&&Math.abs(w)<=1);
}

// Read-only learning report: compare predictions recorded before settlement
// against the frozen market baseline. This never authorizes trading.
export function learningReport(model,minCount=100){
 const count=Number.isInteger(model?.count)&&model.count>=0?model.count:0;
 const brier=count&&Number.isFinite(model?.brier)?model.brier/count:null;
 const baselineBrier=count&&Number.isFinite(model?.baselineBrier)?model.baselineBrier/count:null;
 const improvement=brier!==null&&baselineBrier!==null&&baselineBrier>0
  ?(baselineBrier-brier)/baselineBrier:null;
 return {verifiedObservations:count,modelBrier:brier,baselineBrier,
  relativeBrierImprovement:improvement,minimumObservations:minCount,
  validated:modelValidated(model,minCount),
  status:count<minCount?'INSUFFICIENT VERIFIED OUTCOMES':improvement===null?'MISSING PERFORMANCE DATA':improvement>0?'OUTPERFORMED BASELINE IN RECORDED SAMPLE':'DID NOT BEAT BASELINE',
  needsMoreOutcomes:Math.max(0,minCount-count),
  improvementPercentagePoints:improvement===null?null:Number((improvement*100).toFixed(2)),
  reasonNotValidated:count<minCount?'Only '+count+' of '+minCount+' required verified settlement outcomes':improvement===null?'Missing valid baseline and model errors':improvement<=0?'Trained model has not beaten the frozen market-price baseline on recorded outcomes':'Recorded improvement exists, but independent future validation is still required',
  caveat:'Retrospective aggregate only. Not independent forward validation or proof of profitable trades.'};
}

// Conservative, read-only model selection for prospective research.
// A candidate must improve out-of-sample prediction error before replacing a baseline.
export function compareValidationWindows(candidate,baseline,{minimum=100,margin=0.005}={}){
 const usable=x=>x&&Number.isInteger(x.count)&&x.count>=minimum&&Number.isFinite(x.brier)&&x.brier>=0;
 if(!usable(candidate)||!usable(baseline))return {eligible:false,reason:'Insufficient verified holdout observations for both models'};
 const candidateError=candidate.brier/candidate.count,baselineError=baseline.brier/baseline.count;
 const improvement=baselineError-candidateError;
 return {eligible:improvement>margin,candidateError,baselineError,improvement,
  reason:improvement>margin?'Candidate beats baseline on recorded holdout':'No material out-of-sample improvement',
  caution:'Holdout records must be genuinely prospective, non-overlapping, and scored before settlement. No automatic trade authorization.'};
}

// Time-window features from timestamped, same-contract samples.
// Missing history is explicit; never fill gaps with invented candles.
export function multiWindowMomentum(samples,now=Date.now()){
 const rows=(Array.isArray(samples)?samples:[]).filter(r=>Number.isFinite(r?.t)&&r.t<=now&&Number.isFinite(r.yesMid)&&r.yesMid>=0&&r.yesMid<=1).sort((a,b)=>a.t-b.t);
 const last=rows.at(-1);
 const windows=[1,3,5,10].map(minutes=>{
  const target=(last?.t??now)-minutes*60000;
  const start=rows.filter(r=>r.t<=target).at(-1);
  return {minutes,change:start&&last?last.yesMid-start.yesMid:null,
   available:!!start&&!!last,observedSpanSeconds:start&&last?Math.round((last.t-start.t)/1000):null};
 });
 return {asOf:last?.t??null,sampleCount:rows.length,windows,
  note:'Sampled quote momentum, not OHLC candles or independently verified market edge'};
}

/**
 * Read-only paired forward-validation gate.
 * Each row is an immutable pre-outcome prediction by BOTH models for the SAME
 * contract/round. This function never changes the active trading strategy.
 */
export function comparePairedForwardPredictions(rows,{minimum=100,margin=0.005}={}){
 const valid=[],seen=new Set();
 for(const row of Array.isArray(rows)?rows:[]){
  if(!row||typeof row.id!=='string'||!row.id.trim()||seen.has(row.id))continue;
  const {baseline,candidate,outcome,predictedAt,settledAt}=row;
  if(![baseline,candidate].every(p=>Number.isFinite(p)&&p>0&&p<1)||
   ![0,1].includes(outcome)||!Number.isFinite(predictedAt)||!Number.isFinite(settledAt)||
   predictedAt>=settledAt)continue;
  seen.add(row.id);valid.push(row);
 }
 const n=valid.length;
 const baselineBrier=n?valid.reduce((s,r)=>s+(r.baseline-r.outcome)**2,0)/n:null;
 const candidateBrier=n?valid.reduce((s,r)=>s+(r.candidate-r.outcome)**2,0)/n:null;
 const improvement=n?baselineBrier-candidateBrier:null;
 return {eligible:n>=minimum&&improvement>margin,pairedOutcomes:n,minimum,
  baselineBrier,candidateBrier,improvement,
  reason:n<minimum?'Insufficient paired future finalized outcomes':
   improvement<=margin?'Candidate has not beaten the baseline by the required margin':
   'Candidate passed paired forward prediction test; independent trading P&L and safety validation still required',
  caution:'Prediction accuracy alone does not prove profitable execution. No automatic strategy promotion.'};
}
