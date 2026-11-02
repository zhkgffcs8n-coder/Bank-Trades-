import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeBrain} from '../src/primal-shadow-brain.mjs';
const now=Date.parse('2026-11-01T20:00:00Z');
const market={ticker:'TEST',yes_bid:50,yes_ask:52,no_bid:46,no_ask:48,expected_expiration_time:new Date(now+600000).toISOString()};
const records=[0,1,2,3,4].map((i)=>({ticker:'TEST',t:now-(4-i)*60000,yesMid:.4+i*.025}));
test('never emits executable action',()=>{const x=analyzeBrain(market,records,now);assert.equal(x.action,'WAIT');assert.equal(x.mode,'SHADOW_ONLY');assert.equal(x.eligible,true);assert.equal(x.candidateDirection,'up')});
test('rejects stale history',()=>{const x=analyzeBrain(market,records,now+120000);assert.equal(x.eligible,false)});
test('rejects crossed quotes',()=>{const x=analyzeBrain({...market,yes_bid:60},records,now);assert.equal(x.eligible,false)});
test('rejects no samples',()=>{const x=analyzeBrain(market,[],now);assert.equal(x.eligible,false)});

test('conflicting same-minute shadow quotes are quarantined regardless of archive order',()=>{
 const altered={...records[2],yesMid:.01};
 for(const input of [[...records,altered],[altered,...records]]){
  const result=analyzeBrain(market,input,now);
  assert.equal(result.action,'WAIT');
  assert.equal(result.eligible,false);
  assert.equal(result.candidateDirection,undefined);
  assert.match(result.reason,/Conflicting duplicate quote timestamps/);
 }
});
test('identical duplicate timestamps do not change the shadow research result',()=>{
 const baseline=analyzeBrain(market,records,now);
 const duplicated=analyzeBrain(market,[records[2],...records,records[2]],now);
 assert.equal(duplicated.eligible,baseline.eligible);
 assert.equal(duplicated.candidateDirection,baseline.candidateDirection);
 assert.deepEqual(duplicated.metrics,baseline.metrics);
});
test('out-of-range midpoint records cannot manufacture shadow momentum',()=>{
 const invalid=records.map((r,i)=>({...r,yesMid:1.1+i*.025}));
 const result=analyzeBrain(market,invalid,now);
 assert.equal(result.eligible,false);
 assert.equal(result.action,'WAIT');
 assert.match(result.reason,/Insufficient fresh independent samples/);
});
