import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeForecast,scoreFrozenForecast} from '../src/forecast-shadow-learning.mjs';
const input={ticker:'KXBTC15M-TEST',asset:'BTC',at:1000,expiresAt:2000,yesBid:.58,yesAsk:.61,noBid:.37,noAsk:.40};
test('freeze forecast from contemporaneous quotes, not later settlement',()=>{
 const row=freezeForecast(input);
 assert.equal(row.direction,'UP');assert.equal(row.status,'PENDING');assert.equal(row.actionable,false);
 assert.equal(row.baseline,.595);
});
test('reject invalid quotes and expired snapshots',()=>{
 assert.equal(freezeForecast({...input,yesBid:.7}),null);
 assert.equal(freezeForecast({...input,expiresAt:900}),null);
});
test('only score after expiry with official binary outcome and costs',()=>{
 const row=freezeForecast(input);
 assert.equal(scoreFrozenForecast(row,'yes',1500),null);
 assert.equal(scoreFrozenForecast(row,'unknown',2500),null);
 const result=scoreFrozenForecast(row,'yes',2500);
 assert.equal(result.correct,true);assert.ok(Math.abs(result.simulatedNetPnl-.36)<1e-10);
 assert.equal(scoreFrozenForecast(result,'yes',3000),null);
 assert.equal(row.status,'PENDING');
});
test('directional mistakes are recorded rather than revised',()=>{
 const result=scoreFrozenForecast(freezeForecast(input),'no',2500);
 assert.equal(result.correct,false);assert.equal(result.direction,'UP');assert.equal(result.directionalBrier,1);
 assert.ok(result.simulatedNetPnl<0);
});
