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

test('conflicting verified settlement records cannot inflate shadow accuracy',async()=>{
 const r=await runOmegaResearchRound({...base,providers:['gpt','deepseek'],env:{OPENAI_API_KEY:'a',DEEPSEEK_API_KEY:'b'},
 fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.6}'}}]})})});
 const official={marketTicker:'BTC',roundId:'R1',verified:true,upOutcome:1,settledAtMs:120000};
 const conflicting={...official,upOutcome:0};
 const result=evaluateOmegaVerifiedBatch({rounds:[r],settlements:[official,conflicting]});
 assert.equal(result.verifiedRounds,0);
 assert.deepEqual(result.verifiedScores,[]);
 const duplicate=evaluateOmegaVerifiedBatch({rounds:[r,r],settlements:[official,{...official}]});
 assert.equal(duplicate.verifiedRounds,2);
 assert.equal(duplicate.verifiedScores[0].verifiedRounds,1);
});

test('research champion requires verified chronological holdout improvement',async()=>{
 const {evaluateResearchChampions}=await import('../src/omega-learning.mjs');
 const make=(i,model,baseline)=>({status:'VERIFIED_SHADOW_SCORE',marketTicker:'BTC',roundId:'R'+i,
  predictedAtMs:1000+i,scores:[{provider:'gpt',brier:model},{provider:'kalshi_baseline',brier:baseline}]});
 const records=Array.from({length:6},(_,i)=>make(i,.1,.3));
 const insufficient=evaluateResearchChampions(records.slice(0,4),{minimumTrain:3,minimumHoldout:2});
 assert.equal(insufficient.champion,null);
 const eligible=evaluateResearchChampions(records,{minimumTrain:3,minimumHoldout:2,minimumImprovement:.05});
 assert.equal(eligible.champion,'gpt');assert.equal(eligible.promoted,false);assert.equal(eligible.ordersAuthorized,false);
 const degraded=evaluateResearchChampions([...records.slice(0,4),make(4,.5,.3),make(5,.5,.3)],
  {minimumTrain:3,minimumHoldout:2,minimumImprovement:.05});
 assert.equal(degraded.champion,null);
 const duplicate=evaluateResearchChampions([...records,make(5,0,.9)],{minimumTrain:3,minimumHoldout:2});
 assert.equal(duplicate.leaderboard[0].trainingRounds,3);
 assert.equal(duplicate.leaderboard[0].holdoutRounds,2);
});
test('verified scoring records the latest forecast timestamp for holdout ordering',async()=>{
 const {scoreVerifiedRound}=await import('../src/omega-learning.mjs');
 const fusion={status:'SHADOW_RESEARCH',marketTicker:'BTC',roundId:'R',accepted:[
  {provider:'gpt',upProbability:.7,observedAtMs:1000},
  {provider:'claude',upProbability:.6,observedAtMs:1100}],marketBaseline:.5};
 const score=scoreVerifiedRound(fusion,{marketTicker:'BTC',roundId:'R',verified:true,upOutcome:1,settledAtMs:2000});
 assert.equal(score.predictedAtMs,1100);
});

test('leaderboard endpoint only reports verified archived scores and never authorizes orders',async()=>{
 const {omegaLeaderboard}=await import('../netlify/functions/omega-leaderboard.mjs');
 const values=new Map();
 for(let i=0;i<52;i++)values.set('omega/verified-scores/v1/BTC-'+i,{
  status:'VERIFIED_SHADOW_SCORE',marketTicker:'BTC',roundId:'BTC-'+i,predictedAtMs:1000+i,
  scores:[{provider:'omega_consensus',brier:.1},{provider:'kalshi_baseline',brier:.3}]});
 values.set('omega/verified-scores/v1/UNVERIFIED',{status:'BLOCKED',scores:[]});
 const db={async *list(){yield {blobs:[...values.keys()].sort().map(key=>({key}))}},
  async get(key){return values.get(key)??null}};
 const result=await omegaLeaderboard(db);
 assert.equal(result.observedRecords,52);
 assert.equal(result.champion,'omega_consensus');
 assert.equal(result.selectedForTrading,false);
 assert.equal(result.realOrdersAuthorized,false);
 assert.equal(result.originalPrimalComparison,'NOT_VERIFIED');
});
