// Paper-only Primal learning quality gates. No trade execution.
export const finite = n => typeof n === 'number' && Number.isFinite(n);
export function brierScore(rows) {
  const valid = rows.filter(r => finite(r.probability) && r.probability >= 0 && r.probability <= 1 && (r.outcome === 0 || r.outcome === 1));
  return {n: valid.length, score: valid.length ? valid.reduce((s,r) => s + (r.probability-r.outcome)**2,0)/valid.length : null};
}
export function calibration(rows, bins=10) {
  return Array.from({length:bins},(_,i)=>{
    const group=rows.filter(r=>finite(r.probability)&&r.probability>=i/bins&&r.probability<=(i+1)/bins&&(i===bins-1||r.probability<(i+1)/bins)&&(r.outcome===0||r.outcome===1));
    return {bin:i,n:group.length,forecast:group.length?group.reduce((s,r)=>s+r.probability,0)/group.length:null,observed:group.length?group.reduce((s,r)=>s+r.outcome,0)/group.length:null};
  });
}
export function coverage({expected=[],sampled=[],failed=[]}={}) {
 const e=new Set(expected),s=new Set(sampled),f=new Set(failed);
 return {expected:e.size,sampled:[...e].filter(x=>s.has(x)&&!f.has(x)).length,missing:[...e].filter(x=>!s.has(x)||f.has(x)),healthy:e.size>0&&[...e].every(x=>s.has(x)&&!f.has(x))};
}
export function drift(reference,current,{threshold=.15,minSamples=30}={}) {
 if(reference.length<minSamples||current.length<minSamples)return {status:'INSUFFICIENT_DATA'};
 const a=reference.filter(finite),b=current.filter(finite);
 if(a.length<minSamples||b.length<minSamples)return {status:'INSUFFICIENT_DATA'};
 const mean=x=>x.reduce((s,n)=>s+n,0)/x.length;
 const delta=Math.abs(mean(a)-mean(b));
 return {status:delta>threshold?'DRIFT':'STABLE',delta};
}
export function promotionDecision({baseline=[],challenger=[],minSamples=100,minGain=.005}={}) {
 if(baseline.length!==challenger.length)return {promote:false,reason:'UNPAIRED'};
 const a=brierScore(baseline),b=brierScore(challenger);
 if(a.n<minSamples||b.n<minSamples)return {promote:false,reason:'INSUFFICIENT_DATA'};
 const gain=a.score-b.score;
 return {promote:false,reason:gain>=minGain?'REQUIRES_INDEPENDENT_VALIDATION':'NO_MEASURED_GAIN',gain};
}
export function rollbackDecision({referenceScore,currentScore,minimumWorsening=.01}={}) {
 return {rollback:finite(referenceScore)&&finite(currentScore)&&currentScore-referenceScore>minimumWorsening};
}
