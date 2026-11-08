import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingTrainingReview,frozenTrainingTargets,validCommittedTrainingMarker,trainingWriteIntent,trainingObservationDigest,claimTrainingIntent} from '../src/training-provenance.mjs';

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

test('committed marker requires matching frozen snapshot, intent, outcome and exact model increments',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,features:[.1,.2,-.3,.4],baseline:.55,globalPrediction:.52,assetPrediction:.53};
 const intent=trainingWriteIntent(rec,'yes',frozenTrainingTargets(rec),{count:9},{count:7},250);
 const marker={version:2,ticker:rec.ticker,asset:rec.asset,result:'yes',globalUpdated:true,assetUpdated:true,
  globalCount:10,assetCount:8,learnedAt:300,observationDigest:intent.observationDigest,intentStartedAt:intent.startedAt};
 assert.equal(validCommittedTrainingMarker(marker,rec,'yes',intent),true);
 for(const change of [{result:'no'},{ticker:'OTHER'},{asset:'ETH'},{globalUpdated:false},{assetUpdated:false},
  {globalCount:9},{globalCount:11},{assetCount:7},{assetCount:9},{learnedAt:0},{learnedAt:249},
  {assetCount:NaN},{observationDigest:'wrong'},{intentStartedAt:251},{version:1}]){
  assert.equal(validCommittedTrainingMarker({...marker,...change},rec,'yes',intent),false,JSON.stringify(change));
 }
 for(const change of [{status:'COMMITTED'},{verifiedOutcome:'no'},{predictionAt:101},{expiresAt:201},
  {globalCountBefore:8},{assetCountBefore:8},{observationDigest:'wrong'},{startedAt:251},{version:1}]){
  assert.equal(validCommittedTrainingMarker(marker,rec,'yes',{...intent,...change}),false,JSON.stringify(change));
 }
 for(const change of [{features:[.1,.2,-.3,.5]},{baseline:.56},{globalPrediction:.54},
  {assetPrediction:.54},{at:101},{expiresAt:201}]){
  assert.equal(validCommittedTrainingMarker(marker,{...rec,...change},'yes',intent),false,JSON.stringify(change));
 }
 assert.equal(validCommittedTrainingMarker(marker,rec,'no',intent),false);
 assert.equal(validCommittedTrainingMarker(marker,rec,'yes'),false);
 assert.equal(validCommittedTrainingMarker({...marker,version:undefined},rec,'yes',intent),false);
 assert.equal(validCommittedTrainingMarker(null,rec,'yes',intent),false);
 assert.equal(validCommittedTrainingMarker(marker,{...rec,globalPrediction:null},'yes',intent),false);
 assert.equal(validCommittedTrainingMarker(marker,{...rec,at:201},'yes',intent),false);
});

test('same contract with changed frozen input cannot borrow another training marker',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,features:[.1,.2,-.3,.4],baseline:.55,globalPrediction:.52,assetPrediction:.53};
 assert.equal(trainingObservationDigest(rec),trainingObservationDigest({...rec,features:[.1,.2,-.3,.4]}));
 assert.notEqual(trainingObservationDigest(rec),trainingObservationDigest({...rec,features:[.1,.2,-.3,.41]}));
 assert.notEqual(trainingObservationDigest(rec),trainingObservationDigest({...rec,assetPrediction:.54}));
 assert.equal(trainingObservationDigest({...rec,at:200}),null);
});

test('write-ahead intent is not a learned marker and freezes both model counts',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,features:[.1,.2,-.3,.4],baseline:.55,globalPrediction:.52,assetPrediction:.53};
 const targets=frozenTrainingTargets(rec);
 const intent=trainingWriteIntent(rec,'no',targets,{count:7},{count:3},250);
 assert.deepEqual({version:intent.version,status:intent.status,globalCountBefore:intent.globalCountBefore,assetCountBefore:intent.assetCountBefore,verifiedOutcome:intent.verifiedOutcome},{version:2,status:'STARTED',globalCountBefore:7,assetCountBefore:3,verifiedOutcome:'no'});
 assert.equal(intent.observationDigest,trainingObservationDigest(rec));
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

test('training intent and committed marker cannot predate contract expiry',()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,
  features:[.1,.2,-.3,.4],baseline:.55,globalPrediction:.52,assetPrediction:.53};
 const targets=frozenTrainingTargets(rec);
 assert.throws(()=>trainingWriteIntent(rec,'yes',targets,{count:9},{count:7},199),
  /Invalid training write intent/);
 const intent=trainingWriteIntent(rec,'yes',targets,{count:9},{count:7},200);
 const marker={version:2,ticker:rec.ticker,asset:rec.asset,result:'yes',
  globalUpdated:true,assetUpdated:true,globalCount:10,assetCount:8,
  learnedAt:201,observationDigest:intent.observationDigest,intentStartedAt:200};
 assert.equal(validCommittedTrainingMarker(marker,rec,'yes',intent),true);
 const forgedIntent={...intent,startedAt:199};
 assert.equal(validCommittedTrainingMarker({...marker,intentStartedAt:199},rec,'yes',forgedIntent),false);
});

test('only one overlapping collector can claim the same finalized contract before learning',async()=>{
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200,
  features:[.1,.2,-.3,.4],baseline:.55,globalPrediction:.52,assetPrediction:.53};
 const intent=trainingWriteIntent(rec,'yes',frozenTrainingTargets(rec),{count:9},{count:7},250);
 const key='training/intent/v1/'+rec.ticker,values=new Map();
 const db={
  async setJSON(k,v,options){
   assert.deepEqual(options,{onlyIfNew:true},'claims must never overwrite a prior intent');
   if(!values.has(k))values.set(k,structuredClone(v));
  },
  async get(k){return structuredClone(values.get(k)??null)}
 };
 const results=await Promise.all([
  claimTrainingIntent(db,key,intent,'collector-A'),
  claimTrainingIntent(db,key,intent,'collector-B')
 ]);
 assert.deepEqual(results,[true,false]);
 assert.equal(values.get(key).claimId,'collector-A');
 assert.equal(await claimTrainingIntent(db,key,intent,'collector-C'),false);
 assert.equal(values.get(key).claimId,'collector-A');
 const marker={version:2,ticker:rec.ticker,asset:rec.asset,result:'yes',globalUpdated:true,assetUpdated:true,
  globalCount:10,assetCount:8,learnedAt:300,observationDigest:intent.observationDigest,
  intentStartedAt:intent.startedAt,claimId:'collector-A'};
 assert.equal(validCommittedTrainingMarker(marker,rec,'yes',values.get(key)),true);
 assert.equal(validCommittedTrainingMarker({...marker,claimId:'collector-B'},rec,'yes',values.get(key)),false);
 assert.equal(validCommittedTrainingMarker({...marker,claimId:undefined},rec,'yes',values.get(key)),false);
 await assert.rejects(claimTrainingIntent(db,'training/intent/v1/WRONG',intent,'collector-D'),/Invalid training claim/);
});
