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
 const calls=[...collector.matchAll(/pendingTrainingReview\(rec,\s*(?:trustedCached|result),\s*'([^']+)'/g)];
 assert.ok(calls.length>=3,'Expected review paths for cached, legacy and invalid predictions');
 const rec={ticker:'KXBTC15M-TEST',asset:'BTC',at:100,expiresAt:200};
 for(const match of calls){
  const review=pendingTrainingReview(rec,'yes',match[1],300);
  assert.equal(review.reason,match[1]);
  assert.equal(review.status,'REQUIRES_RECONCILIATION');
 }
});
