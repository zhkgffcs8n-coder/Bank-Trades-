import test from 'node:test';
import assert from 'node:assert/strict';
import {brierScore,calibration,coverage,drift,promotionDecision,rollbackDecision} from '../src/primal-learning-guardrails.mjs';
test('scores verified forecasts only',()=>{assert.deepEqual(brierScore([{probability:.8,outcome:1},{probability:.2,outcome:0},{probability:2,outcome:1}]),{n:2,score:.04-0.00000000000000001});});
test('reports missing markets and failures',()=>{assert.deepEqual(coverage({expected:['BTC','ETH'],sampled:['BTC','ETH'],failed:['ETH']}).missing,['ETH']);});
test('requires data before drift alerts',()=>{assert.equal(drift([1],[2]).status,'INSUFFICIENT_DATA');});
test('never automatically promotes without independent validation',()=>{const rows=Array.from({length:120},()=>({probability:.9,outcome:1}));assert.equal(promotionDecision({baseline:rows,challenger:rows}).promote,false);});
test('detects meaningful degradation',()=>{assert.equal(rollbackDecision({referenceScore:.1,currentScore:.2}).rollback,true);});
test('calibration bins count observations',()=>{assert.equal(calibration([{probability:.1,outcome:0},{probability:.9,outcome:1}]).reduce((s,b)=>s+b.n,0),2);});
