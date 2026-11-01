import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeResearch} from '../src/edge-research.mjs';
const quote={probability:.75,yesAsk:.60,noAsk:.42,yesBid:.58,noBid:.40,fee:.01,slippage:.01,quoteAgeMs:500};
test('research candidate reflects conservative estimated price edge',()=>{
 const x=edgeResearch(quote);
 assert.equal(x.mode,'SHADOW_ONLY');
 assert.equal(x.eligible,true);
 assert.equal(x.candidateDirection,'UP');
 assert.ok(Math.abs(x.upEdge-.13)<1e-10);
});
test('reject stale quote',()=>assert.equal(edgeResearch({...quote,quoteAgeMs:31000}).eligible,false));
test('reject wide spreads',()=>assert.equal(edgeResearch({...quote,yesBid:.50}).eligible,false));
test('reject invalid probabilities',()=>assert.equal(edgeResearch({...quote,probability:1.2}).eligible,false));
test('reject negative modeled edge',()=>assert.equal(edgeResearch({...quote,probability:.50,yesAsk:.62,noAsk:.62,yesBid:.60,noBid:.60}).eligible,false));
test('fee and slippage can disqualify otherwise eligible edge',()=>assert.equal(edgeResearch({...quote,fee:.09,slippage:.08}).eligible,false));
