import test from 'node:test';
import assert from 'node:assert/strict';
import {pairedScoreAudit} from '../src/paired-score-audit.mjs';
const row=(i,candidate=.8,baseline=.6,outcome=1)=>({id:'market-'+i,recordedAt:100,settledAt:200,candidate,baseline,outcome});
test('rejects underpowered comparisons',()=>assert.equal(pairedScoreAudit([row(1)]).eligible,false));
test('compares exactly the same 100 prospective markets',()=>{
 const r=pairedScoreAudit(Array.from({length:100},(_,i)=>row(i)));
 assert.equal(r.count,100);assert.equal(r.eligible,true);
 assert.ok(r.candidateBrier<r.baselineBrier);
});
test('duplicate contract IDs cannot inflate evidence',()=>{
 const r=pairedScoreAudit(Array.from({length:200},()=>row(1)));
 assert.equal(r.count,1);assert.equal(r.eligible,false);
});
test('predictions after settlement are excluded',()=>{
 const r=pairedScoreAudit([{...row(1),recordedAt:201}]);
 assert.equal(r.count,0);
});
test('worse model never qualifies',()=>{
 const r=pairedScoreAudit(Array.from({length:100},(_,i)=>row(i,.2,.8)));
 assert.equal(r.eligible,false);
});
