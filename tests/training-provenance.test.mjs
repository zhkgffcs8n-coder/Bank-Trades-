import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingTrainingReview} from '../src/training-provenance.mjs';

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
