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

// A committed marker is evidence only when it identifies this exact frozen
// observation, outcome, and both intended model updates. Incomplete or legacy
// markers are quarantined instead of silently deleting pending evidence.
export function validCommittedTrainingMarker(marker,rec,result){
 const targets=frozenTrainingTargets(rec);
 return !!marker&&['yes','no'].includes(result)&&
  (targets.global||targets.asset)&&
  marker.ticker===rec.ticker&&marker.asset===rec.asset&&marker.result===result&&
  marker.globalUpdated===targets.global&&marker.assetUpdated===targets.asset&&
  Number.isFinite(marker.learnedAt)&&marker.learnedAt>0&&
  Number.isSafeInteger(marker.globalCount)&&marker.globalCount>=(targets.global?1:0)&&
  Number.isSafeInteger(marker.assetCount)&&marker.assetCount>=(targets.asset?1:0);
}

// Durable write-ahead provenance, recorded BEFORE either model mutation.
// STARTED does not mean learned. A crash or overlapping invocation leaves the
// observation for manual reconciliation; it must never be replayed blindly.
// Netlify Blob writes are not a cross-key transaction or compare-and-swap lock.
export function trainingWriteIntent(rec,result,targets,globalModel,assetModel,now=Date.now()){
 const expected=frozenTrainingTargets(rec);
 if(!['yes','no'].includes(result)||!Number.isFinite(now)||now<=0||
  !targets||targets.global!==expected.global||targets.asset!==expected.asset||
  !(expected.global||expected.asset)||
  !Number.isSafeInteger(globalModel?.count)||globalModel.count<0||
  !Number.isSafeInteger(assetModel?.count)||assetModel.count<0)throw Error('Invalid training write intent');
 return {version:1,status:'STARTED',ticker:rec.ticker,asset:rec.asset,
  verifiedOutcome:result,predictionAt:rec.at,expiresAt:rec.expiresAt,
  globalUpdated:targets.global,assetUpdated:targets.asset,
  globalCountBefore:globalModel.count,assetCountBefore:assetModel.count,
  startedAt:now,note:'Write-ahead evidence only; incomplete updates require reconciliation, not automatic replay.'};
}

// Preserve evidence when a pending prediction's training provenance is unknown.
// Never infer that a cached finalized outcome was already learned or train it twice.
export function pendingTrainingReview(rec,outcome,reason,now=Date.now()){
 if(!rec?.ticker||!['yes','no'].includes(outcome)||!['CACHED_FINALIZED_OUTCOME','PREEXISTING_UNTRUSTED_LABEL','INVALID_PREDICTION','CONFLICTING_LEARNED_MARKER','INTERRUPTED_TRAINING_INTENT'].includes(reason))throw Error('Invalid training review');
 return {version:1,status:'REQUIRES_RECONCILIATION',ticker:rec.ticker,asset:rec.asset||null,
  predictionAt:Number.isFinite(rec.at)?rec.at:null,expiresAt:Number.isFinite(rec.expiresAt)?rec.expiresAt:null,
  verifiedOutcome:outcome,reason,recordedAt:now,
  note:'Legacy training provenance unknown. Do not replay this prediction without an idempotent per-observation training ledger.'};
}
