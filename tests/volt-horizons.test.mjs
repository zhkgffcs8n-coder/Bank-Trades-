import test from 'node:test';
import assert from 'node:assert/strict';
import {observeVoltHorizons,forecastVoltHorizons} from '../src/volt-horizons.mjs';

test('VOLT requires new same-contract depth and counts each prospective horizon once',()=>{
 const entry={ticker:'BTC',at:10000,side:'UP',ask:.5,scored:{}};
 const round={voltV16Probe:entry}, cells={};
 const depth={ticker:'BTC',now:13000,bookAt:10000,yes:{price:.64,size:1}};
 assert.equal(observeVoltHorizons(round,cells,depth),false);
 assert.equal(observeVoltHorizons(round,cells,{...depth,bookAt:12900}),false);
 assert.equal(observeVoltHorizons(round,cells,{...depth,bookAt:13000}),true);
 assert.equal(observeVoltHorizons(round,cells,{...depth,bookAt:13000}),false);
 const report=forecastVoltHorizons(cells,entry,100);
 assert.deepEqual(report.map(row=>row.seconds),[3,6,10,20,30,60]);
 assert.equal(report[0].samples,1);
 assert.equal(report[0].qualified,false);
});
