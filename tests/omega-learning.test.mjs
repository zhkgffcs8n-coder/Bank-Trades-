import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaStudyRound,scoreVerifiedRound,summarizeVerifiedScores,evaluateResearchChampions,walkForwardChampionAudit} from '../src/omega-learning.mjs';
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
test('verified OMEGA scoring rejects malformed, duplicate and post-settlement provider evidence',()=>{
 const settlement={marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:true,settledAtMs:110000};
 const valid={status:'SHADOW_RESEARCH',marketTicker:'BTC',roundId:'r1',
  accepted:forecasts,marketBaseline:.5};
 assert.equal(scoreVerifiedRound(valid,settlement).status,'VERIFIED_SHADOW_SCORE');
 for(const accepted of [
  undefined,[],[forecasts[0]], 
  [{...forecasts[0],upProbability:NaN},forecasts[1]],
  [{...forecasts[0],upProbability:1.2},forecasts[1]],
  [{...forecasts[0],upProbability:null},forecasts[1]],
  [{...forecasts[0],observedAtMs:110000},forecasts[1]],
  [{...forecasts[0],observedAtMs:0},forecasts[1]],
  [forecasts[0],{...forecasts[1],provider:forecasts[0].provider}]
 ])assert.equal(scoreVerifiedRound({...valid,accepted},settlement).status,'BLOCKED');
 for(const marketBaseline of [NaN,-.01,1.01,'0.5'])
  assert.equal(scoreVerifiedRound({...valid,marketBaseline},settlement).status,'BLOCKED');
 assert.equal(scoreVerifiedRound({...valid,marketBaseline:null},settlement).status,'VERIFIED_SHADOW_SCORE');
});
test('duplicate rounds not counted twice',()=>{const record=omegaStudyRound({...args,settlement:{marketTicker:'BTC',roundId:'r1',upOutcome:1,verified:true,settledAtMs:110000}}).verification;assert.equal(summarizeVerifiedScores([record,record])[0].verifiedRounds,1)});
test('OMEGA public Brier summary quarantines conflicting duplicate rounds independent of record order',()=>{
 const base={status:'VERIFIED_SHADOW_SCORE',marketTicker:'BTC',roundId:'same-round',
  scores:[{provider:'omega_consensus',brier:.04},{provider:'kalshi_baseline',brier:.25}]};
 const conflicting={...base,scores:[{provider:'kalshi_baseline',brier:.25},{provider:'omega_consensus',brier:.81}]};
 const independent={...base,roundId:'other-round',scores:[{provider:'omega_consensus',brier:.16},{provider:'kalshi_baseline',brier:.36}]};
 for(const input of [[base,conflicting,independent],[conflicting,base,independent]]){
  const scores=summarizeVerifiedScores(input);
  assert.equal(scores.find(x=>x.provider==='omega_consensus').verifiedRounds,1);
  assert.equal(scores.find(x=>x.provider==='omega_consensus').meanBrier,.16);
  assert.equal(scores.find(x=>x.provider==='kalshi_baseline').meanBrier,.36);
 }
 assert.equal(summarizeVerifiedScores([base,{...base,scores:[...base.scores].reverse()}])[0].verifiedRounds,1);
 assert.deepEqual(summarizeVerifiedScores([base,conflicting]),[]);
});
test('malformed duplicate OMEGA score records quarantine a market round regardless of scan order',()=>{
 const good={status:'VERIFIED_SHADOW_SCORE',marketTicker:'BTC',roundId:'duplicate',
  scores:[{provider:'omega_consensus',brier:.01},{provider:'kalshi_baseline',brier:.2}]};
 const independent={...good,roundId:'independent',
  scores:[{provider:'omega_consensus',brier:.16},{provider:'kalshi_baseline',brier:.36}]};
 for(const bad of [
  {...good,scores:null},
  {...good,scores:[]},
  {...good,scores:[{provider:'omega_consensus',brier:-.1}]},
  {...good,scores:[{provider:'omega_consensus',brier:.01},{provider:'omega_consensus',brier:.02}]}
 ]){
  for(const records of [[good,bad,independent],[bad,independent,good]]){
   const scores=summarizeVerifiedScores(records);
   assert.deepEqual(scores.map(x=>x.provider),['omega_consensus','kalshi_baseline']);
   assert.equal(scores.find(x=>x.provider==='omega_consensus').verifiedRounds,1);
   assert.equal(scores.find(x=>x.provider==='omega_consensus').meanBrier,.16);
   assert.equal(scores.find(x=>x.provider==='kalshi_baseline').meanBrier,.36);
  }
 }
 assert.deepEqual(summarizeVerifiedScores([good,{...good,scores:null}]),[]);
});

test('malformed duplicate rounds cannot select OMEGA research champions or walk-forward winners',()=>{
 const make=i=>({status:'VERIFIED_SHADOW_SCORE',marketTicker:'BTC',roundId:'R'+i,
  predictedAtMs:1000+i*1000,settledAtMs:1100+i*1000,
  scores:[{provider:'gpt',brier:.05},{provider:'kalshi_baseline',brier:.3}]});
 const holdout=[0,1,2,3].map(make);
 const policy={minimumTrain:3,minimumHoldout:1,minimumImprovement:.01};
 assert.equal(evaluateResearchChampions(holdout,policy).champion,'gpt');
 for(const bad of [
  {...holdout[0],scores:null},
  {...holdout[0],scores:[{provider:'gpt',brier:-1}]},
  {...holdout[0],predictedAtMs:null}
 ]){
  for(const records of [[...holdout,bad],[bad,...holdout]]){
   const result=evaluateResearchChampions(records,policy);
   assert.equal(result.champion,null);
   assert.equal(result.ordersAuthorized,false);
  }
 }
 const forward=holdout.slice(0,3);
 assert.equal(walkForwardChampionAudit(forward,{minimumHistory:2}).evaluated,1);
 for(const bad of [
  {...forward[0],scores:null},
  {...forward[0],settledAtMs:null},
  {...forward[0],scores:[{provider:'gpt',brier:1.5}]}
 ]){
  for(const records of [[...forward,bad],[bad,...forward]]){
   const result=walkForwardChampionAudit(records,{minimumHistory:2});
   assert.equal(result.evaluated,0);
   assert.equal(result.beatsMarketBaseline,false);
   assert.equal(result.ordersAuthorized,false);
  }
 }
});

test('scheduled archive scores strict settlements once and excludes late forecasts',async()=>{
 const {scoreOmegaArchive}=await import('../netlify/functions/omega-settlement-scheduled.mjs');
 const {SETTLEMENT_VERIFICATION}=await import('../src/official-settlement.mjs');
 const data=new Map();
 for(const [ticker,recordedAtMs] of [['BTC',95000],['ETH',110001]]){
  data.set('omega/predictions/v1/'+ticker+'/1',{ticker,recordedAtMs,expiresAtMs:100000,status:'SHADOW_RESEARCH',accepted:forecasts,baseline:.5});
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

test('OMEGA archived score rejects provider lookahead relative to frozen forecast, even before settlement',async()=>{
 const {scoreOmegaArchive}=await import('../netlify/functions/omega-settlement-scheduled.mjs');
 const {SETTLEMENT_VERIFICATION}=await import('../src/official-settlement.mjs');
 const ticker='BTC-LOOKAHEAD',data=new Map([
  ['omega/predictions/v1/'+ticker+'/1',{ticker,status:'SHADOW_RESEARCH',recordedAtMs:95000,expiresAtMs:100000,
   accepted:[{provider:'gpt',upProbability:.9,observedAtMs:96000},{provider:'gemini',upProbability:.8,observedAtMs:94000}],baseline:.5}],
  ['outcomes/'+ticker,{ticker,result:'yes',verification:SETTLEMENT_VERIFICATION,settledAt:new Date(110000).toISOString()}]
 ]);
 const db={async get(key){return data.get(key)||null},async setJSON(key,value){data.set(key,value)},
  async *list({prefix}){yield {blobs:[...data.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}}};
 await scoreOmegaArchive(db);
 assert.equal(data.has('omega/verified-scores/v1/'+ticker),false);
});

test('OMEGA research holdout excludes training labels unavailable before holdout predictions',()=>{
 const make=(i,settledAtMs=1100+i*1000)=>({
  status:'VERIFIED_SHADOW_SCORE',marketTicker:'BTC',roundId:'T'+i,
  predictedAtMs:1000+i*1000,settledAtMs,
  scores:[{provider:'gpt',brier:.04},{provider:'kalshi_baseline',brier:.3}]
 });
 const policy={minimumTrain:3,minimumHoldout:1,minimumImprovement:.01};
 const records=[0,1,2,3].map(i=>make(i));
 assert.equal(evaluateResearchChampions(records,policy).champion,'gpt');
 const leaked=[records[0],make(1,5000),records[2],records[3]];
 const blocked=evaluateResearchChampions(leaked,policy);
 assert.equal(blocked.champion,null);
 assert.equal(blocked.status,'INSUFFICIENT_VERIFIED_HISTORY');
 assert.equal(blocked.ordersAuthorized,false);
 // Invalid settlement chronology must never count as an eligible label.
 assert.equal(evaluateResearchChampions([make(0,900),...records.slice(1)],policy).champion,null);
 // With enough genuinely available labels, the late one is excluded,
 // not silently counted as a training success.
 const safe=evaluateResearchChampions([...leaked,make(4)],policy);
 assert.equal(safe.champion,'gpt');
 assert.equal(safe.leaderboard[0].trainingRounds,3);
 assert.equal(safe.leaderboard[0].holdoutRounds,1);
 assert.equal(safe.promoted,false);
});

test('OMEGA official settlement cannot validate post-expiry or unproven forecast timing',async()=>{
 const {scoreOmegaArchive}=await import('../netlify/functions/omega-settlement-scheduled.mjs');
 const {SETTLEMENT_VERIFICATION}=await import('../src/official-settlement.mjs');
 const cases=[
  {ticker:'POST-EXPIRY',recordedAtMs:105000,expiresAtMs:100000},
  {ticker:'MISSING-EXPIRY',recordedAtMs:95000},
  {ticker:'SETTLED-BEFORE-EXPIRY',recordedAtMs:95000,expiresAtMs:120000},
  {ticker:'VALID-PRE-EXPIRY',recordedAtMs:95000,expiresAtMs:100000}
 ];
 const data=new Map();
 for(const item of cases){
  data.set('omega/predictions/v1/'+item.ticker+'/1',{...item,status:'SHADOW_RESEARCH',
   accepted:forecasts,baseline:.5});
  data.set('outcomes/'+item.ticker,{ticker:item.ticker,result:'yes',
   verification:SETTLEMENT_VERIFICATION,settledAt:new Date(110000).toISOString()});
 }
 const db={
  async get(key){return data.get(key)||null},
  async setJSON(key,value){data.set(key,value)},
  async *list({prefix}){yield {blobs:[...data.keys()].filter(key=>key.startsWith(prefix))
   .sort().map(key=>({key}))}}
 };
 await scoreOmegaArchive(db);
 for(const item of cases){
  assert.equal(data.has('omega/verified-scores/v1/'+item.ticker),
   item.ticker==='VALID-PRE-EXPIRY',item.ticker);
 }
});


test('OMEGA official score uses durable freeze time, never earlier provider observation, for forward eligibility',async()=>{
 const {scoreOmegaArchive}=await import('../netlify/functions/omega-settlement-scheduled.mjs');
 const {SETTLEMENT_VERIFICATION}=await import('../src/official-settlement.mjs');
 const ticker='BTC-FROZEN-TIME',recordedAtMs=95000,expiresAtMs=100000;
 const forecast={ticker,status:'SHADOW_RESEARCH',recordedAtMs,expiresAtMs,baseline:.5,
  accepted:[
   {provider:'gpt',marketTicker:ticker,roundId:ticker,upProbability:.7,observedAtMs:90000},
   {provider:'claude',marketTicker:ticker,roundId:ticker,upProbability:.6,observedAtMs:91000}
  ]};
 const key='omega/predictions/v1/'+ticker+'/1',scoreKey='omega/verified-scores/v1/'+ticker;
 const data=new Map([[key,forecast],['outcomes/'+ticker,{ticker,result:'yes',
  verification:SETTLEMENT_VERIFICATION,settledAt:new Date(110000).toISOString()}]]);
 const db={
  async get(k){return data.get(k)??null},
  async setJSON(k,v){data.set(k,v)},
  async *list({prefix}){yield {blobs:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}
 };
 await scoreOmegaArchive(db);
 const scored=data.get(scoreKey);
 assert.equal(scored.status,'VERIFIED_SHADOW_SCORE');
 assert.equal(scored.predictedAtMs,recordedAtMs);
 assert.equal(scored.recordedAtMs,recordedAtMs);
 assert.equal(scored.settledAtMs,110000);
 assert.ok(scored.predictedAtMs>Math.max(...forecast.accepted.map(x=>x.observedAtMs)));
 assert.equal(scored.ordersAuthorized,false);
});


test('OMEGA official archive excludes stale provider observations even when settlement is valid',async()=>{
 const {scoreOmegaArchive}=await import('../netlify/functions/omega-settlement-scheduled.mjs');
 const {SETTLEMENT_VERIFICATION}=await import('../src/official-settlement.mjs');
 const frozenAt=100000000,expiresAt=105000000,settledAt=110000000;
 const makeForecast=(ticker,firstObservedAt)=>({
  ticker,status:'SHADOW_RESEARCH',recordedAtMs:frozenAt,expiresAtMs:expiresAt,baseline:.5,
  accepted:[
   {provider:'gpt',upProbability:.8,observedAtMs:firstObservedAt},
   {provider:'claude',upProbability:.7,observedAtMs:frozenAt-1000}
  ]
 });
 const data=new Map();
 for(const [ticker,observedAt] of [
  ['BTC-STALE-ARCHIVE',frozenAt-15001],
  ['BTC-BOUNDARY-ARCHIVE',frozenAt-15000],
  ['BTC-FRESH-ARCHIVE',frozenAt-1000]
 ]){
  data.set('omega/predictions/v1/'+ticker+'/1',makeForecast(ticker,observedAt));
  data.set('outcomes/'+ticker,{ticker,result:'yes',verification:SETTLEMENT_VERIFICATION,
   settledAt:new Date(settledAt).toISOString()});
 }
 const db={
  async get(key){return data.get(key)??null},
  async setJSON(key,value){data.set(key,value)},
  async *list({prefix}){yield {blobs:[...data.keys()].filter(key=>key.startsWith(prefix))
   .sort().map(key=>({key}))}}
 };
 await scoreOmegaArchive(db,{nowMs:settledAt+1000});
 assert.equal(data.has('omega/verified-scores/v1/BTC-STALE-ARCHIVE'),false);
 for(const ticker of ['BTC-BOUNDARY-ARCHIVE','BTC-FRESH-ARCHIVE']){
  const scored=data.get('omega/verified-scores/v1/'+ticker);
  assert.equal(scored.status,'VERIFIED_SHADOW_SCORE');
  assert.equal(scored.ordersAuthorized,false);
 }
});
