import {validFeatures} from './research-model.mjs';
import {createHash} from 'node:crypto';

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

// Bind training provenance to the immutable, prospective model inputs.
// The hash is not an atomic storage lock; it prevents a marker for a different
// snapshot of the same contract from being accepted as proof of learning.
export function trainingObservationDigest(rec){
 const targets=frozenTrainingTargets(rec);
 if(!targets.global&&!targets.asset)return null;
 const frozen=[rec.ticker,rec.asset,rec.at,rec.expiresAt,rec.baseline,
  rec.features,targets.global?rec.globalPrediction:null,
  targets.asset?rec.assetPrediction:null];
 return createHash('sha256').update(JSON.stringify(frozen)).digest('hex');
}

// Require the exact write-ahead intent, prospective snapshot and expected
// one-step model counts. Legacy markers lacking this evidence need review;
// never treat a plausible count alone as proof of exactly-once learning.
export function validCommittedTrainingMarker(marker,rec,result,intent){
 const targets=frozenTrainingTargets(rec),digest=trainingObservationDigest(rec);
 return !!marker&&!!intent&&!!digest&&['yes','no'].includes(result)&&
  marker.version===2&&intent.version===2&&intent.status==='STARTED'&&
  marker.ticker===rec.ticker&&marker.asset===rec.asset&&marker.result===result&&
  intent.ticker===rec.ticker&&intent.asset===rec.asset&&intent.verifiedOutcome===result&&
  intent.predictionAt===rec.at&&intent.expiresAt===rec.expiresAt&&
  marker.globalUpdated===targets.global&&marker.assetUpdated===targets.asset&&
  intent.globalUpdated===targets.global&&intent.assetUpdated===targets.asset&&
  marker.observationDigest===digest&&intent.observationDigest===digest&&
  // Legacy markers remain auditable, but new claimed intents must carry the
  // same unique ownership token through the committed training marker.
  (!intent.claimId||marker.claimId===intent.claimId)&&
  Number.isFinite(intent.startedAt)&&intent.startedAt>=rec.expiresAt&&
  marker.intentStartedAt===intent.startedAt&&
  Number.isFinite(marker.learnedAt)&&marker.learnedAt>=intent.startedAt&&
  Number.isSafeInteger(intent.globalCountBefore)&&intent.globalCountBefore>=0&&
  Number.isSafeInteger(intent.assetCountBefore)&&intent.assetCountBefore>=0&&
  Number.isSafeInteger(marker.globalCount)&&
  marker.globalCount===intent.globalCountBefore+(targets.global?1:0)&&
  Number.isSafeInteger(marker.assetCount)&&
  marker.assetCount===intent.assetCountBefore+(targets.asset?1:0);
}

// Durable write-ahead provenance, recorded BEFORE either model mutation.
// STARTED does not mean learned. A crash or overlapping invocation leaves the
// observation for manual reconciliation; it must never be replayed blindly.
// Netlify Blob writes are not a cross-key transaction or compare-and-swap lock.
export function trainingWriteIntent(rec,result,targets,globalModel,assetModel,now=Date.now()){
 const expected=frozenTrainingTargets(rec);
 if(!['yes','no'].includes(result)||!Number.isFinite(now)||now<rec?.expiresAt||
  !targets||targets.global!==expected.global||targets.asset!==expected.asset||
  !(expected.global||expected.asset)||
  !Number.isSafeInteger(globalModel?.count)||globalModel.count<0||
  !Number.isSafeInteger(assetModel?.count)||assetModel.count<0)throw Error('Invalid training write intent');
 return {version:2,status:'STARTED',ticker:rec.ticker,asset:rec.asset,
  observationDigest:trainingObservationDigest(rec),
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

// A write-ahead intent alone is not an exclusive claim. Two overlapping
// collectors can both observe an absent key before either writes. Netlify
// Blobs' conditional create, followed by a strong-consistency read-back,
// elects at most one owner for this contract. A failed claim must never
// update model weights; an interrupted winner still requires reconciliation.
export async function claimTrainingIntent(db,key,intent,claimId){
 if(!/^training\/intent\/v1\/[A-Z0-9-]{3,100}$/.test(key)||
  !intent||intent.status!=='STARTED'||intent.version!==2||
  key!=='training/intent/v1/'+intent.ticker||
  typeof claimId!=='string'||!claimId||
  typeof db?.setJSON!=='function'||typeof db?.get!=='function')
  throw Error('Invalid training claim');
 await db.setJSON(key,{...intent,claimId},{onlyIfNew:true});
 const persisted=await db.get(key,{type:'json'});
 return persisted?.claimId===claimId&&persisted?.status==='STARTED'&&
  persisted?.ticker===intent.ticker&&persisted?.observationDigest===intent.observationDigest&&
  persisted?.verifiedOutcome===intent.verifiedOutcome&&persisted?.startedAt===intent.startedAt;
}
