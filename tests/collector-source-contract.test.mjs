import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pendingTrainingReview} from '../src/training-provenance.mjs';

const collector=readFileSync(new URL('../netlify/functions/market-collector.mjs',import.meta.url),'utf8');

test('collector heartbeat counters remain in scope after settlement processing, including failed training',()=>{
 const start=collector.indexOf(' // Track every sampled contract');
 const finish=collector.indexOf(' // Mark completion independently');
 assert.ok(start>0&&finish>start,'Expected collector settlement and heartbeat boundaries');
 const before=collector.slice(0,start),during=collector.slice(start,finish),after=collector.slice(finish);
 assert.match(before,/\blet trainedThisRun\s*=\s*0\s*;/);
 assert.match(before,/\bconst trainedByAsset\s*=\s*\{\s*\}\s*;/);
 assert.doesNotMatch(during,/\b(?:let|const) trainedThisRun\s*=/);
 assert.doesNotMatch(during,/\b(?:let|const) trainedByAsset\s*=/);
 assert.match(after,/newPendingPredictions:collection\.newPredictions,trainedThisRun,trainedByAsset/);
});

test('every cached/fresh finalized-outcome training review reason is accepted by the provenance validator',()=>{
 const calls=[...collector.matchAll(/pendingTrainingReview\(rec,\s*(?:trustedCached|result),\s*([^,]+),now\)/g)];
 const reasons=calls.flatMap(call=>[...call[1].matchAll(/'([^']+)'/g)].map(x=>x[1]));
 assert.equal(new Set(reasons).size,5,'Expected cached, legacy, invalid, interrupted and conflicting marker review paths');
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200};
 for(const reason of reasons){
  const review=pendingTrainingReview(rec,'yes',reason,300);
  assert.equal(review.reason,reason);
  assert.equal(review.status,'REQUIRES_RECONCILIATION');
 }
});

test('collector research validation uses full model integrity gate rather than Brier count shortcut',()=>{
 assert.match(collector,/validated:modelValidated\(model\)/);
 assert.doesNotMatch(collector,/validated:model\.count\s*>=\s*100\s*&&/);
});

test('collector passes pagination completeness to cost-aware paired audit',()=>{
 assert.match(collector,/report\.costAwareMatched\s*=\s*costAwarePairedAudit\(rows,\s*\{archiveComplete:\s*!all\.cursor\}\)/);
});

test('collector cannot report healthy while Primal or paired shadow research fails',()=>{
 assert.match(collector,/researchFailures:0,researchErrors:\[\]/);
 for(const scope of ['recent-snapshot','paired-shadow-snapshot','primal-shadow-snapshot','comparison-snapshot','round-forecast','early-exit-shadow','signal-outcome-scoring','primal-shadow-scoring','paired-shadow-scoring']){
  assert.ok(collector.includes("researchFailure('"+scope+"',e"),'Missing research failure accounting: '+scope);
 }
 assert.match(collector,/collection\.researchFailures===0\?'COMPLETED':'DEGRADED'/);
 assert.match(collector,/researchFailures:collection\.researchFailures,researchErrors:collection\.researchErrors/);
 assert.match(collector,/collection\.researchErrors\.length<16/);
});

test('gross Primal reports, lesson journal and research gates use only strictly verified forward evidence',()=>{
 assert.match(collector,/import \{verifiedComparisonEvidence\} from '\.\.\/\.\.\/src\/verified-comparison-evidence\.mjs'/);
 assert.match(collector,/const evidence=verifiedComparisonEvidence\(rows\)/);
 assert.match(collector,/const trades=evidence\.rows\.filter\(/);
 assert.match(collector,/const resolved=evidence\.rows\.slice\(\)\.sort\(/);
 assert.match(collector,/const training=all\.cursor\|\|evidence\.conflictingMarketCount\?\[\]:resolved/);
 assert.match(collector,/if\(registry&&!all\.cursor&&!evidence\.conflictingMarketCount\)/);
 assert.match(collector,/excludedFromVerifiedComparison:evidence\.rejected/);
 // The independent cost-stressed audit must still receive raw rows so it can
 // detect contradictory duplicates rather than trusting a pre-filtered sample.
 assert.match(collector,/costAwarePairedAudit\(rows,\{archiveComplete:!all\.cursor\}\)/);
 assert.doesNotMatch(collector,/const trades=rows\.filter\(r=>r\.status==='RESOLVED'/);
});

test('collector writes training intent before either model and refuses ambiguous replay',()=>{
 assert.match(collector,/import \{pendingTrainingReview,frozenTrainingTargets,validCommittedTrainingMarker,trainingWriteIntent\} from/);
 assert.match(collector,/const priorIntent=await db\.get\('training\/intent\/v1\/'\+rec\.ticker/);
 assert.match(collector,/if\(!cached&&!learnedMarker&&!priorIntent&&\(targets\.global\|\|targets\.asset\)\)/);
 const intentWrite=collector.indexOf("await db.setJSON('training/intent/v1/'+rec.ticker,intent);");
 assert.match(collector,/const intent=trainingWriteIntent\(rec,result,targets,model,assetModel,now\)/);
 const globalWrite=collector.indexOf("await db.setJSON('training/model',model);",intentWrite);
 const assetWrite=collector.indexOf("await db.setJSON('training/model/'+assetKey,assetModels[assetKey]);",intentWrite);
 const learnedWrite=collector.indexOf("await db.setJSON('training/learned/v1/'+rec.ticker",intentWrite);
 assert.ok(intentWrite>0&&globalWrite>intentWrite&&assetWrite>intentWrite&&learnedWrite>globalWrite&&learnedWrite>assetWrite);
 assert.match(collector,/validCommittedTrainingMarker\(learnedMarker,rec,trustedCached,priorIntent\)/);
 assert.match(collector,/validCommittedTrainingMarker\(learnedMarker,rec,result,priorIntent\)/);
 assert.match(collector,/observationDigest:intent\.observationDigest,intentStartedAt:intent\.startedAt/);
 assert.match(collector,/priorIntent\?'INTERRUPTED_TRAINING_INTENT'/);
 assert.match(collector,/learnedMarker\?'CONFLICTING_LEARNED_MARKER'/);
});

test('prospective Original-vs-upgraded comparisons remain SHADOW ONLY while paper entries are paused',()=>{
 const start=collector.indexOf("const comparisonKey='comparison/v1/'");
 const finish=collector.indexOf("researchFailure('comparison-snapshot'",start);
 assert.ok(start>0&&finish>start);
 const block=collector.slice(start,finish);
 assert.match(block,/const candidate=originalMomentumShadow\(m,records,now\)/);
 assert.match(block,/candidate\.shadowOnly===true/);
 assert.match(block,/mode:'SHADOW_ONLY',authorized:false/);
 assert.doesNotMatch(block,/const candidate=paperSignal\(/);
 assert.doesNotMatch(block,/\b(?:placeOrder|submitOrder|executeTrade)\s*\(/);
});


test('training counters advance only after durable learned marker write',()=>{
 const start=collector.indexOf("const intent=trainingWriteIntent(rec,result,targets,model,assetModel,now);");
 const marker=collector.indexOf("await db.setJSON('training/learned/v1/'+rec.ticker",start);
 const count=collector.indexOf('trainedThisRun++;',start);
 const byAsset=collector.indexOf('trainedByAsset[assetKey]=(trainedByAsset[assetKey]||0)+1;',start);
 const end=collector.indexOf("await db.delete('pending/'+rec.ticker);",start);
 assert.ok(start>=0&&marker>start&&count>marker&&byAsset>marker&&end>byAsset,
  'Partial or interrupted model writes must not count as committed training');
 assert.equal(collector.slice(start,count).includes('trainedThisRun++;'),false);
});
