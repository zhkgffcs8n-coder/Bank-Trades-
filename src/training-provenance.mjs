import {validFeatures} from './research-model.mjs';

// An old record can have a fallback prediction but no frozen prediction for
// either actual model. Never count it as a training update or write a learned
// marker unless at least one model has its own pre-outcome forecast.
export function frozenTrainingTargets(rec){
 // A forecast without a valid pre-expiration timestamp is not prospective evidence.
 // Quarantine malformed/legacy rows rather than training on potentially leaked outcomes.
 const frozenBeforeExpiry=typeof rec?.ticker==='string'&&rec.ticker.length>0&&
  typeof rec?.asset==='string'&&rec.asset.length>0&&
  Number.isFinite(rec.at)&&rec.at>0&&Number.isFinite(rec.expiresAt)&&rec.at<rec.expiresAt;
 const valid=frozenBeforeExpiry&&validFeatures(rec?.features)&&Number.isFinite(rec?.baseline)&&rec.baseline>0&&rec.baseline<1;
 const probability=p=>typeof p==='number'&&Number.isFinite(p)&&p>0&&p<1;
 return {global:valid&&probability(rec?.globalPrediction),
  asset:valid&&probability(rec?.assetPrediction)};
}

// Preserve evidence when a pending prediction's training provenance is unknown.
// Never infer that a cached finalized outcome was already learned or train it twice.
export function pendingTrainingReview(rec,outcome,reason,now=Date.now()){
 if(!rec?.ticker||!['yes','no'].includes(outcome)||!['CACHED_FINALIZED_OUTCOME','PREEXISTING_UNTRUSTED_LABEL','INVALID_PREDICTION'].includes(reason))throw Error('Invalid training review');
 return {version:1,status:'REQUIRES_RECONCILIATION',ticker:rec.ticker,asset:rec.asset||null,
  predictionAt:Number.isFinite(rec.at)?rec.at:null,expiresAt:Number.isFinite(rec.expiresAt)?rec.expiresAt:null,
  verifiedOutcome:outcome,reason,recordedAt:now,
  note:'Legacy training provenance unknown. Do not replay this prediction without an idempotent per-observation training ledger.'};
}
