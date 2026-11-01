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
  caveat:'Retrospective aggregate only. Not independent forward validation or proof of profitable trades.'};
}
