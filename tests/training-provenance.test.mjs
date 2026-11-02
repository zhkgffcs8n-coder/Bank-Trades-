import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingTrainingReview,frozenTrainingTargets,validCommittedTrainingMarker,trainingWriteIntent} from '../src/training-provenance.mjs';

test('preserves finalized pending prediction provenance without claiming it was untrained',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,features:[1,0,0,0],prediction:.6};
 const row=pendingTrainingReview(rec,'yes','CACHED_FINALIZED_OUTCOME',300);
 assert.equal(row.status,'REQUIRES_RECONCILIATION');
 assert.equal(row.verifiedOutcome,'yes');
 assert.equal(row.predictionAt,100);
 assert.equal(row.reason,'CACHED_FINALIZED_OUTCOME');
 assert.equal(row.recordedAt,300);
 assert.equal(Object.hasOwn(row,'trained'),false);
});
test('rejects missing ticker, unverified labels and unknown review reasons',()=>{
 const rec={ticker:'TEST'};
 assert.throws(()=>pendingTrainingReview({},'yes','CACHED_FINALIZED_OUTCOME'));
 assert.throws(()=>pendingTrainingReview(rec,'unknown','CACHED_FINALIZED_OUTCOME'));
 assert.throws(()=>pendingTrainingReview(rec,'yes','AUTO_TRAIN'));
});

test('only frozen per-model predictions authorize counted training updates',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,features:[.1,.2,-.3,.4],baseline:.55,prediction:.56};
 assert.deepEqual(frozenTrainingTargets(rec),{global:false,asset:false});
 assert.deepEqual(frozenTrainingTargets({...rec,globalPrediction:.52}),{global:true,asset:false});
 assert.deepEqual(frozenTrainingTargets({...rec,assetPrediction:.53}),{global:false,asset:true});
 assert.deepEqual(frozenTrainingTargets({...rec,globalPrediction:.52,assetPrediction:.53}),{global:true,asset:true});
 assert.deepEqual(frozenTrainingTargets({...rec,features:[1,2],globalPrediction:.52}),{global:false,asset:false});
 assert.deepEqual(frozenTrainingTargets({...rec,globalPrediction:Infinity,assetPrediction:0}),{global:false,asset:false});
 assert.deepEqual(frozenTrainingTargets({...rec,baseline:1,globalPrediction:.52}),{global:false,asset:false});
});

test('rejects missing or post-expiration forecast provenance even with valid probabilities',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,features:[.1,.2,-.3,.4],baseline:.55,globalPrediction:.52,assetPrediction:.53};
 const rejected=[{at:200},{at:201},{at:NaN},{at:0},{expiresAt:NaN},{expiresAt:100},{ticker:''},{asset:''},{asset:null}];
 for(const change of rejected){
  assert.deepEqual(frozenTrainingTargets({...rec,...change}),{global:false,asset:false},JSON.stringify(change));
 }
 assert.deepEqual(frozenTrainingTargets(rec),{global:true,asset:true});
});

test('committed marker must match frozen observation, both targets and official outcome',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,features:[.1,.2,-.3,.4],baseline:.55,globalPrediction:.52,assetPrediction:.53};
 const marker={ticker:rec.ticker,asset:rec.asset,result:'yes',globalUpdated:true,assetUpdated:true,globalCount:10,assetCount:8,learnedAt:300};
 assert.equal(validCommittedTrainingMarker(marker,rec,'yes'),true);
 for(const change of [{result:'no'},{ticker:'OTHER'},{asset:'ETH'},{globalUpdated:false},{assetUpdated:false},{globalCount:0},{assetCount:-1},{learnedAt:0},{assetCount:NaN}]){
  assert.equal(validCommittedTrainingMarker({...marker,...change},rec,'yes'),false,JSON.stringify(change));
 }
 assert.equal(validCommittedTrainingMarker(marker,{...rec,globalPrediction:null},'yes'),false);
 assert.equal(validCommittedTrainingMarker(marker,{...rec,at:201},'yes'),false);
 assert.equal(validCommittedTrainingMarker(null,rec,'yes'),false);
});

test('write-ahead intent is not a learned marker and freezes both model counts',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,features:[.1,.2,-.3,.4],baseline:.55,globalPrediction:.52,assetPrediction:.53};
 const targets=frozenTrainingTargets(rec);
 const intent=trainingWriteIntent(rec,'no',targets,{count:7},{count:3},250);
 assert.deepEqual({status:intent.status,globalCountBefore:intent.globalCountBefore,assetCountBefore:intent.assetCountBefore,verifiedOutcome:intent.verifiedOutcome},{status:'STARTED',globalCountBefore:7,assetCountBefore:3,verifiedOutcome:'no'});
 assert.equal(validCommittedTrainingMarker(intent,rec,'no'),false);
 assert.throws(()=>trainingWriteIntent(rec,'yes',{global:true,asset:false},{count:7},{count:3},250));
 assert.throws(()=>trainingWriteIntent(rec,'yes',targets,{count:-1},{count:3},250));
 assert.throws(()=>trainingWriteIntent(rec,'yes',targets,{count:7},{count:3},0));
});

test('interrupted and contradictory training provenance requires review, never replay',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200};
 for(const reason of ['INTERRUPTED_TRAINING_INTENT','CONFLICTING_LEARNED_MARKER']){
  const review=pendingTrainingReview(rec,'yes',reason,300);
  assert.equal(review.status,'REQUIRES_RECONCILIATION');
  assert.equal(review.reason,reason);
 }
});
