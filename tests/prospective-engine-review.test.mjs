import test from 'node:test';import assert from 'node:assert/strict';
import {compareProspectiveEngines} from '../src/prospective-engine-review.mjs';
const mk=i=>({ticker:'round-'+i,verified:true,outcome:i%2,predictedAt:100,expiresAt:200,settledAt:300,spider:i%2?.9:.1,primal:.5,omega:.5,marketBaseline:.5});
test('no evidence cannot promote',()=>{const r=compareProspectiveEngines([]);assert.equal(r.leader,null);assert.equal(r.automaticPromotion,false)});
test('matched verified paired rounds yield research candidate only',()=>{const r=compareProspectiveEngines(Array.from({length:110},(_,i)=>mk(i)));assert.equal(r.status,'REVIEW_CANDIDATE');assert.equal(r.leader,'spider');assert.equal(r.liveTradingAuthorized,false)});
test('lookahead, unverified and conflicting records excluded',()=>{const a=mk(1),b=mk(2);const r=compareProspectiveEngines([a,{...a,spider:.2},{...b,verified:false},{...mk(3),predictedAt:250}]);assert.equal(r.verifiedPairedRounds,0);assert.equal(r.conflicts,1)});
test('duplicates cannot inflate sample size',()=>{const r=compareProspectiveEngines([mk(1),mk(1)]);assert.equal(r.verifiedPairedRounds,1)});
