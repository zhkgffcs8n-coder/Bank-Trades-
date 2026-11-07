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
 assert.equal(duplicate.verifiedRounds,1);
 assert.equal(duplicate.duplicateForecastsExcluded,1);
 assert.equal(duplicate.verifiedScores[0].verifiedRounds,1);
});

test('conflicting frozen OMEGA predictions quarantine a round rather than selecting a convenient forecast',async()=>{
 const r=await runOmegaResearchRound({...base,providers:['gpt','deepseek'],env:{OPENAI_API_KEY:'a',DEEPSEEK_API_KEY:'b'},
  fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.6}'}}]})})});
 const changed=structuredClone(r);
 changed.fusion.accepted[0].upProbability=.95;
 const settlement={marketTicker:'BTC',roundId:'R1',verified:true,upOutcome:1,settledAtMs:120000};
 const result=evaluateOmegaVerifiedBatch({rounds:[r,changed,r],settlements:[settlement]});
 assert.equal(result.verifiedRounds,0);
 assert.equal(result.conflictingForecastRoundsExcluded,1);
 assert.equal(result.duplicateForecastsExcluded,2);
 assert.deepEqual(result.verifiedScores,[]);
 assert.equal(result.ordersAuthorized,false);
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

test('walk-forward champion never selects from the future or claims unverified Primal wins',async()=>{
 const {walkForwardChampionAudit}=await import('../src/omega-learning.mjs');
 const make=(i,model,baseline)=>({status:'VERIFIED_SHADOW_SCORE',marketTicker:'BTC',roundId:'R'+i,predictedAtMs:1000+i*1000,settledAtMs:1100+i*1000,
  scores:[{provider:'gpt',brier:model},{provider:'kalshi_baseline',brier:baseline}]});
 const history=Array.from({length:25},(_,i)=>make(i,i<5?.1:.4,.3));
 const result=walkForwardChampionAudit(history,{minimumHistory:5,minimumImprovement:.05});
 assert.equal(result.evaluated,5);
 assert.equal(result.beatsMarketBaseline,false);
 assert.equal(result.promoted,false);
 assert.equal(result.ordersAuthorized,false);
 assert.equal(result.originalPrimalComparison,'NOT_VERIFIED');
 const conflict=walkForwardChampionAudit([...history,make(0,.9,.1)],{minimumHistory:5,minimumImprovement:.05});
 assert.equal(conflict.evaluated,3); // Conflicted early training round removes another eligible forward step.
});

test('walk-forward excludes outcomes settled after a later prediction and missing settlement times',async()=>{
 const {walkForwardChampionAudit}=await import('../src/omega-learning.mjs');
 const make=(i,settledAtMs)=>({status:'VERIFIED_SHADOW_SCORE',marketTicker:'BTC',roundId:'F'+i,
  predictedAtMs:1000+i*1000,settledAtMs,
  scores:[{provider:'omega_consensus',brier:.05},{provider:'kalshi_baseline',brier:.3}]});
 const records=Array.from({length:9},(_,i)=>make(i,100000+i));
 const leaking=walkForwardChampionAudit(records,{minimumHistory:2});
 assert.equal(leaking.evaluated,0);
 assert.equal(leaking.beatsMarketBaseline,false);
 const missing=walkForwardChampionAudit(records.map(({settledAtMs,...rest})=>rest),{minimumHistory:2});
 assert.equal(missing.evaluated,0);
 const legitimate=walkForwardChampionAudit(Array.from({length:9},(_,i)=>make(i,1100+i*1000)),{minimumHistory:2});
 assert.equal(legitimate.evaluated,7);
 assert.equal(legitimate.ordersAuthorized,false);
});

test('bounded leaderboard refuses a champion when historical score records are truncated',async()=>{
 const {omegaLeaderboard}=await import('../netlify/functions/omega-leaderboard.mjs');
 const values=new Map(Array.from({length:60},(_,i)=>['omega/verified-scores/v1/BTC-'+String(i).padStart(3,'0'),{
  status:'VERIFIED_SHADOW_SCORE',marketTicker:'BTC',roundId:'BTC-'+i,
  predictedAtMs:1000+i*1000,settledAtMs:1100+i*1000,
  scores:[{provider:'omega_consensus',brier:.01},{provider:'kalshi_baseline',brier:.5}]}]));
 const db={async *list(){yield {blobs:[...values.keys()].map(key=>({key}))}},async get(key){return values.get(key)}};
 const result=await omegaLeaderboard(db,{limit:50});
 assert.equal(result.historyTruncated,true);
 assert.equal(result.status,'INCOMPLETE_HISTORY');
 assert.equal(result.champion,null);
 assert.equal(result.leaderboard.every(x=>!x.eligible),true);
 assert.equal(result.walkForward.beatsMarketBaseline,false);
 assert.equal(result.realOrdersAuthorized,false);
});
