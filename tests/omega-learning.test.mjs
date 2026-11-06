import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaStudyRound,scoreVerifiedRound,summarizeVerifiedScores} from '../src/omega-learning.mjs';
const forecasts=[{provider:'gemini',marketTicker:'BTC',roundId:'r1',upProbability:.8,observedAtMs:90000},{provider:'grok',marketTicker:'BTC',roundId:'r1',upProbability:.6,observedAtMs:90000}];
const baseline={marketTicker:'BTC',roundId:'r1',upProbability:.5,observedAtMs:90000};
const args={marketTicker:'BTC',roundId:'r1',nowMs:95000,forecasts,marketBaseline:baseline};
test('shared verified outcome scores all providers without placing orders',()=>{
 const x=omegaStudyRound({...args,settlement:{marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:true,settledAtMs:110000}});
 assert.equal(x.verification.status,'VERIFIED_SHADOW_SCORE');
 assert.equal(x.verification.scores.length,4);assert.equal(x.verification.scores.find(s=>s.provider==='omega_consensus').correct,true);assert.equal(x.ordersAuthorized,false);
});
test('unverified outcomes blocked',()=>assert.equal(scoreVerifiedRound(omegaStudyRound(args).fusion,{marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:false,settledAtMs:110000}).status,'BLOCKED'));
test('wrong round blocked',()=>assert.equal(scoreVerifiedRound(omegaStudyRound(args).fusion,{marketTicker:'BTC',roundId:'r2',upOutcome:1,verified:true,settledAtMs:110000}).status,'BLOCKED'));
test('future predictions blocked',()=>assert.equal(scoreVerifiedRound(omegaStudyRound(args).fusion,{marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:true,settledAtMs:89000}).status,'BLOCKED'));
test('duplicate rounds not counted twice',()=>{const record=omegaStudyRound({...args,settlement:{marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:true,settledAtMs:110000}}).verification;assert.equal(summarizeVerifiedScores([record,record])[0].verifiedRounds,1)});
test('scheduled archive scores strict settlements once and excludes late forecasts',async()=>{
 const {scoreOmegaArchive}=await import('../netlify/functions/omega-settlement-scheduled.mjs');
 const {SETTLEMENT_VERIFICATION}=await import('../src/official-settlement.mjs');
 const data=new Map();
 for(const [ticker,recordedAtMs] of [['BTC',95000],['ETH',110001]]){
  data.set('omega/predictions/v1/'+ticker+'/1',{ticker,recordedAtMs,status:'SHADOW_RESEARCH',accepted:forecasts,baseline:.5});
  data.set('outcomes/'+ticker,{ticker,result:'yes',verification:SETTLEMENT_VERIFICATION,settledAt:new Date(110000).toISOString()});
 }
 const db={get:async key=>data.get(key),setJSON:async(key,value,options)=>{
  if(options?.onlyIfNew&&data.has(key))throw Error('Unexpected duplicate score write');
  data.set(key,value);
 },async *list({prefix}){yield {blobs:[...data.keys()].filter(key=>key.startsWith(prefix)).sort().map(key=>({key}))}}};
 await scoreOmegaArchive(db);
 await scoreOmegaArchive(db);
 assert.equal(data.get('omega/verified-scores/v1/BTC').scores.find(x=>x.provider==='omega_consensus').correct,true);
 assert.equal(data.has('omega/verified-scores/v1/ETH'),false);
});
