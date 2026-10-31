import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleMarketSamples} from '../src/history-snapshot.mjs';
const row=(asset,ticker,t,yesMid=.5,observedAt=t)=>({asset,ticker,t,yesMid,observedAt});
test('rolling current samples remain visible when archive listing contains only old keys',()=>{
 const result=visibleMarketSamples([row('BTC','OLD',100)], [row('BTC','CURRENT',1000)], 'BTC',900);
 assert.deepEqual(result.map(r=>r.ticker),['CURRENT']);
});
test('deduplicates contract-minute keys and prefers newest observation',()=>{
 const result=visibleMarketSamples([row('BTC','C',1000,.3,1001)], [row('BTC','C',1000,.6,1002)], 'BTC',900);
 assert.equal(result.length,1);assert.equal(result[0].yesMid,.6);
});
test('filters wrong assets, invalid prices and old records; preserves sorted bounded output',()=>{
 const result=visibleMarketSamples([row('ETH','E',1000),row('BTC','OLD',800),row('BTC','BAD',1050,NaN)],
 [row('BTC','C',1200),row('BTC','C',1100)], 'BTC',900,1);
 assert.deepEqual(result.map(r=>r.t),[1200]);
});
