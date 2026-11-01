// Read-only paired Brier evaluation. A score is never evidence of an executable edge.
// Each observation must be frozen before expiry and tied to a strictly verified
// finalized binary settlement. Incomplete archives cannot qualify a candidate.
import {SETTLEMENT_VERIFICATION} from './official-settlement.mjs';

export function pairedScoreAudit(records,{minimum=100,margin=.005,archiveComplete=false}={}){
 if(!Number.isInteger(minimum)||minimum<1||!Number.isFinite(margin)||margin<0||typeof archiveComplete!=='boolean')throw Error('Invalid paired score audit options');
 const valid=p=>typeof p==='number'&&Number.isFinite(p)&&p>0&&p<1;
 const seen=new Map(),conflicted=new Set();
 for(const r of Array.isArray(records)?records:[]){
  if(!r||typeof r.id!=='string'||!r.id||
   !Number.isFinite(r.recordedAt)||r.recordedAt<=0||!Number.isFinite(r.expiresAt)||
   !Number.isFinite(r.settledAt)||r.recordedAt>=r.expiresAt||r.settledAt<r.expiresAt||
   r.outcomeVerification!==SETTLEMENT_VERIFICATION||
   (r.outcome!==0&&r.outcome!==1)||!valid(r.candidate)||!valid(r.baseline))continue;
  const fingerprint=JSON.stringify([r.recordedAt,r.expiresAt,r.settledAt,r.outcome,r.candidate,r.baseline]);
  const previous=seen.get(r.id);
  if(previous&&previous.fingerprint!==fingerprint)conflicted.add(r.id);
  else if(!previous)seen.set(r.id,{row:r,fingerprint});
 }
 const paired=[...seen].filter(([id])=>!conflicted.has(id)).map(([,v])=>v.row);
 const count=paired.length;
 const candidateBrier=count?paired.reduce((a,r)=>a+(r.candidate-r.outcome)**2,0)/count:null;
 const baselineBrier=count?paired.reduce((a,r)=>a+(r.baseline-r.outcome)**2,0)/count:null;
 const improvement=count?baselineBrier-candidateBrier:null;
 const eligible=archiveComplete&&count>=minimum&&improvement>margin;
 return {mode:'SHADOW_ONLY',count,minimum,archiveComplete,conflictingMarketCount:conflicted.size,
  candidateBrier,baselineBrier,improvement,eligible,
  reason:!archiveComplete?'Incomplete archive: independent comparison not eligible':count<minimum?'Insufficient paired prospective verified settlements':improvement>margin?'Candidate has lower paired Brier error':'Candidate not demonstrably better',
  note:'Official finalized provenance and pre-expiry forecasts required. Paired Brier improvement is not profitability or trading authorization.'};
}
