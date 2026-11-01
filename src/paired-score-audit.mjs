// Read-only paired evaluation of forecasts recorded before official outcomes.
// Each record must contain both forecasts for the SAME contract and outcome.
export function pairedScoreAudit(records,{minimum=100,margin=.005}={}){
 const valid=(p)=>typeof p==='number'&&Number.isFinite(p)&&p>0&&p<1;
 const rows=(Array.isArray(records)?records:[]).filter(r=>
  r&&typeof r.id==='string'&&r.id.length>0&&
  Number.isFinite(r.recordedAt)&&Number.isFinite(r.settledAt)&&r.recordedAt<r.settledAt&&
  (r.outcome===0||r.outcome===1)&&valid(r.candidate)&&valid(r.baseline));
 const seen=new Set(),paired=[];
 for(const r of rows){if(seen.has(r.id))continue;seen.add(r.id);paired.push(r);}
 const count=paired.length;
 const candidateBrier=count?paired.reduce((a,r)=>a+(r.candidate-r.outcome)**2,0)/count:null;
 const baselineBrier=count?paired.reduce((a,r)=>a+(r.baseline-r.outcome)**2,0)/count:null;
 const improvement=count?baselineBrier-candidateBrier:null;
 return {mode:'SHADOW_ONLY',count,minimum,candidateBrier,baselineBrier,improvement,
  eligible:count>=minimum&&improvement>margin,
  reason:count<minimum?'Insufficient paired prospective settlements':improvement>margin?'Candidate has lower paired Brier error':'Candidate not demonstrably better',
  note:'Paired score only; not a profitability claim or trading authorization. Requires independently verified settlement records.'};
}
