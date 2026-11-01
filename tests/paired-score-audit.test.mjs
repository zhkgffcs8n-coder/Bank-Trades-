import test from 'node:test';
import assert from 'node:assert/strict';
import {pairedScoreAudit} from '../src/paired-score-audit.mjs';
import {SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';
const row=(i,candidate=.8,baseline=.6,outcome=1)=>({id:'market-'+i,recordedAt:100,expiresAt:150,settledAt:200,candidate,baseline,outcome,outcomeVerification:SETTLEMENT_VERIFICATION});
const complete={archiveComplete:true};
test('rejects underpowered comparisons',()=>assert.equal(pairedScoreAudit([row(1)],complete).eligible,false));
test('compares exactly the same 100 prospective officially settled markets',()=>{
 const r=pairedScoreAudit(Array.from({length:100},(_,i)=>row(i)),complete);
 assert.equal(r.count,100);assert.equal(r.eligible,true);
 assert.ok(r.candidateBrier<r.baselineBrier);
});
test('duplicate contract IDs cannot inflate evidence',()=>{
 const r=pairedScoreAudit(Array.from({length:200},()=>row(1)),complete);
 assert.equal(r.count,1);assert.equal(r.eligible,false);
});
test('conflicting duplicate market records are quarantined, not first-wins',()=>{
 const r=pairedScoreAudit([row(1),row(1,.2,.6,0),row(2)],complete);
 assert.equal(r.count,1);assert.equal(r.conflictingMarketCount,1);
});
test('predictions at or after expiry and labels before expiry are excluded',()=>{
 const r=pairedScoreAudit([{...row(1),recordedAt:150},{...row(2),recordedAt:151},{...row(3),settledAt:149}],complete);
 assert.equal(r.count,0);
});
test('unverified labels, missing expiration and malformed forecasts cannot qualify',()=>{
 const records=[{...row(1),outcomeVerification:null},{...row(2),expiresAt:null},{...row(3),candidate:NaN},{...row(4),recordedAt:0}];
 assert.equal(pairedScoreAudit(records,complete).count,0);
});
test('incomplete archives cannot establish eligible Brier improvement',()=>{
 const records=Array.from({length:100},(_,i)=>row(i));
 assert.equal(pairedScoreAudit(records).eligible,false);
 const r=pairedScoreAudit(records,{archiveComplete:false});
 assert.equal(r.count,100);assert.equal(r.eligible,false);
 assert.match(r.reason,/Incomplete archive/);
});
test('worse model never qualifies',()=>{
 const r=pairedScoreAudit(Array.from({length:100},(_,i)=>row(i,.2,.8)),complete);
 assert.equal(r.eligible,false);
});
test('rejects invalid comparison options',()=>{
 assert.throws(()=>pairedScoreAudit([],{minimum:0}));
 assert.throws(()=>pairedScoreAudit([],{archiveComplete:'yes'}));
 assert.throws(()=>pairedScoreAudit([],{margin:-.1}));
});

test('conflicting market provenance blocks eligibility even with 100 other good matches',()=>{
 const records=Array.from({length:101},(_,i)=>row(i));
 const clean=pairedScoreAudit(records,complete);
 assert.equal(clean.eligible,true);
 const conflicted=pairedScoreAudit([...records,row(100,.2,.6,0)],complete);
 assert.equal(conflicted.count,100);
 assert.equal(conflicted.conflictingMarketCount,1);
 assert.ok(conflicted.candidateBrier<conflicted.baselineBrier);
 assert.equal(conflicted.eligible,false);
 assert.match(conflicted.reason,/Conflicting duplicate contracts/);
 const reversed=pairedScoreAudit([row(100,.2,.6,0),...records],complete);
 assert.equal(reversed.eligible,false);
 assert.equal(reversed.conflictingMarketCount,1);
});
