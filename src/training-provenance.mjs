// Preserve evidence when a pending prediction's training provenance is unknown.
// Never infer that a cached finalized outcome was already learned or train it twice.
export function pendingTrainingReview(rec,outcome,reason,now=Date.now()){
 if(!rec?.ticker||!['yes','no'].includes(outcome)||!['CACHED_FINALIZED_OUTCOME','PREEXISTING_UNTRUSTED_LABEL','INVALID_PREDICTION'].includes(reason))throw Error('Invalid training review');
 return {version:1,status:'REQUIRES_RECONCILIATION',ticker:rec.ticker,asset:rec.asset||null,
  predictionAt:Number.isFinite(rec.at)?rec.at:null,expiresAt:Number.isFinite(rec.expiresAt)?rec.expiresAt:null,
  verifiedOutcome:outcome,reason,recordedAt:now,
  note:'Legacy training provenance unknown. Do not replay this prediction without an idempotent per-observation training ledger.'};
}
