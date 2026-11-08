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

test('V18 rejects a late quote for its one-second horizon',async()=>{
 const {voltV18Horizons}=await import('../src/volt-horizons.mjs');
 const round={voltV16Probe:{ticker:'BTC',at:10000,side:'UP',ask:.5,scored:{}}};
 const cells={};
 const depth={ticker:'BTC',now:11400,bookAt:11400,yes:{price:.64,size:1}};
 assert.equal(observeVoltHorizons(round,cells,depth,voltV18Horizons),false);
 assert.equal(observeVoltHorizons(round,cells,{...depth,bookAt:11200},voltV18Horizons),true);
 assert.equal(cells['UP/1'].count,1);
});

test('Predator forecasts expose forward uncertainty and require adequate evidence',async()=>{
 const {forecastPredatorEarly}=await import('../src/volt-horizons.mjs');
 const rows=forecastPredatorEarly({'UP/1':{count:12,wins:8,move:2.4,downside:.24}},
  {side:'UP',ask:.5},90);
 assert.deepEqual(rows.map(row=>row.seconds),[1,3,5,10,30,60]);
 assert.ok(rows[0].lowerWinRate<.5);
 assert.equal(rows[0].qualified,false);
});
