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
