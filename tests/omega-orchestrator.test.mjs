import test from 'node:test';
import assert from 'node:assert/strict';
import {runOmegaResearchRound,evaluateOmegaVerifiedBatch} from '../src/omega-orchestrator.mjs';
const base={marketTicker:'BTC',roundId:'R1',nowMs:100000,marketSnapshot:{price:0.5},
 marketBaseline:{marketTicker:'BTC',roundId:'R1',observedAtMs:99000,upProbability:.5}};
test('two configured independent provider responses reach research fusion',async()=>{
 const r=await runOmegaResearchRound({...base,providers:['gpt','deepseek'],env:{OPENAI_API_KEY:'a',DEEPSEEK_API_KEY:'b'},
 fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.6}'}}]})})});
 assert.equal(r.status,'SHADOW_RESEARCH');assert.equal(r.fusion.accepted.length,2);assert.equal(r.ordersAuthorized,false);
 const report=evaluateOmegaVerifiedBatch({rounds:[r],settlements:[{marketTicker:'BTC',roundId:'R1',verified:true,upOutcome:1,settledAtMs:120000}]});
 assert.equal(report.verifiedRounds,1);assert.equal(report.verifiedScores.length,4);
});
test('no provider credentials means insufficient research, not invented consensus',async()=>{
 const r=await runOmegaResearchRound({...base,providers:['gpt','claude'],env:{}});
 assert.equal(r.status,'INSUFFICIENT_DATA');assert.equal(r.fusion.accepted.length,0);
 assert.equal(r.ordersAuthorized,false);
});
test('unverified outcomes cannot create accuracy statistics',async()=>{
 const r=await runOmegaResearchRound({...base,providers:['gpt','deepseek'],env:{OPENAI_API_KEY:'a',DEEPSEEK_API_KEY:'b'},
 fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.6}'}}]})})});
 const report=evaluateOmegaVerifiedBatch({rounds:[r],settlements:[{marketTicker:'BTC',roundId:'R1',verified:false,upOutcome:1,settledAtMs:120000}]});
 assert.equal(report.verifiedRounds,0);
});
