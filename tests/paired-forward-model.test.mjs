import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePairedForwardPredictions} from '../src/research-model.mjs';
const rows=Array.from({length:120},(_,i)=>({id:'round-'+i,baseline:.51,candidate:i%2===0?.9:.1,outcome:i%2===0?1:0,predictedAt:1000+i,settledAt:2000+i}));
test('requires enough paired prospective observations',()=>{
 const result=comparePairedForwardPredictions(rows.slice(0,99));
 assert.equal(result.eligible,false);
 assert.equal(result.pairedOutcomes,99);
});
test('qualifying candidate must beat baseline on same rounds',()=>{
 const result=comparePairedForwardPredictions(rows);
 assert.equal(result.eligible,true);
 assert.ok(result.candidateBrier<result.baselineBrier);
});
test('duplicates, post-settlement predictions and invalid probabilities do not count',()=>{
 const bad=[rows[0],{...rows[1],predictedAt:3000},{...rows[2],candidate:1},{...rows[3],id:'round-0'}];
 const result=comparePairedForwardPredictions([...rows.slice(0,99),...bad]);
 assert.equal(result.pairedOutcomes,99);
 assert.equal(result.eligible,false);
});
test('inferior candidate cannot pass with sufficient sample',()=>{
 const poor=rows.map(r=>({...r,candidate:r.outcome?.1:.9}));
 assert.equal(comparePairedForwardPredictions(poor).eligible,false);
});
