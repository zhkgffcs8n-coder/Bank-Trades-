import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaStudyRound,scoreVerifiedRound,summarizeVerifiedScores} from '../src/omega-learning.mjs';
const forecasts=[{provider:'gemini',marketTicker:'BTC',roundId:'r1',upProbability:.8,observedAtMs:90000},{provider:'grok',marketTicker:'BTC',roundId:'r1',upProbability:.6,observedAtMs:90000}];
const baseline={marketTicker:'BTC',roundId:'r1',upProbability:.5,observedAtMs:90000};
const args={marketTicker:'BTC',roundId:'r1',nowMs:95000,forecasts,marketBaseline:baseline};
test('shared verified outcome scores all providers without placing orders',()=>{
 const x=omegaStudyRound({...args,settlement:{marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:true,settledAtMs:110000}});
 assert.equal(x.verification.status,'VERIFIED_SHADOW_SCORE');
 assert.equal(x.verification.scores.length,3);assert.equal(x.ordersAuthorized,false);
});
test('unverified outcomes blocked',()=>assert.equal(scoreVerifiedRound(omegaStudyRound(args).fusion,{marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:false,settledAtMs:110000}).status,'BLOCKED'));
test('wrong round blocked',()=>assert.equal(scoreVerifiedRound(omegaStudyRound(args).fusion,{marketTicker:'BTC',roundId:'r2',upOutcome:1,verified:true,settledAtMs:110000}).status,'BLOCKED'));
test('future predictions blocked',()=>assert.equal(scoreVerifiedRound(omegaStudyRound(args).fusion,{marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:true,settledAtMs:91000}).status,'BLOCKED'));
test('duplicate rounds not counted twice',()=>{const record=omegaStudyRound({...args,settlement:{marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:true,settledAtMs:110000}}).verification;assert.equal(summarizeVerifiedScores([record,record])[0].verifiedRounds,1)});
