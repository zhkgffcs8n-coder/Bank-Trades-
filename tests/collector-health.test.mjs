import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCollectorHealth} from '../src/collector-health.mjs';

const now=1_800_000_000_000;
const completed={startedAt:now-90000,completedAt:now-20000,status:'COMPLETED',sampledAssetCount:8,sampledAssets:['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'],failedAssets:[],trainingSucceeded:true};

test('collector is healthy only after complete fresh eight-market sampling and research update',()=>{
 const health=assessCollectorHealth(completed,now);
 assert.equal(health.fresh,true);
 assert.equal(health.ageSeconds,20);
 assert.equal(health.fullCoverage,true);
 assert.equal(health.trainingSucceeded,true);
});
test('recent start without completed work is not a fresh collector',()=>{
 const health=assessCollectorHealth({...completed,completedAt:undefined,status:'RUNNING'},now);
 assert.equal(health.heartbeatFresh,false);
 assert.equal(health.fresh,false);
});
test('partial quotes, failed training and stale completion each fail closed',()=>{
 for(const patch of [{sampledAssetCount:7},{status:'DEGRADED'},{failedAssets:['BTC']},{trainingSucceeded:false},{completedAt:now-181000}]){
  assert.equal(assessCollectorHealth({...completed,...patch},now).fresh,false);
 }
});
test('legacy heartbeat missing coverage and training evidence is not verified',()=>{
 assert.equal(assessCollectorHealth({completedAt:now-1000,status:'COMPLETED'},now).fresh,false);
 assert.equal(assessCollectorHealth(null,now).fresh,false);
});

test('duplicate, substituted, missing or contradictory asset coverage cannot be healthy',()=>{
 const correct=completed.sampledAssets;
 for(const patch of [
  {sampledAssets:Array(8).fill('BTC')},
  {sampledAssets:[...correct.slice(0,7),'FAKE']},
  {sampledAssets:correct.slice(0,7)},
  {sampledAssets:undefined},
  {sampledAssetCount:7}
 ]){
  const result=assessCollectorHealth({...completed,...patch},now);
  assert.equal(result.fullCoverage,false,JSON.stringify(patch));
  assert.equal(result.fresh,false,JSON.stringify(patch));
 }
 assert.equal(assessCollectorHealth(completed,now).fresh,true);
});
