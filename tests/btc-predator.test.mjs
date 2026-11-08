import test from 'node:test';
import assert from 'node:assert/strict';
import {predatorObservation,openPredatorWatch,advancePredatorWatch} from '../src/btc-predator.mjs';

const now=12000;
const ticker='KXBTC15M-TEST';
const trades=Array.from({length:12},(_,i)=>({time:i*1000,price:i<9?100:100.01,flow:i<9?-.1:1}));
trades.push({time:now,price:100.01,flow:1});
const snapshot={ticker,now,bookAt:now,remaining:100,yes:{price:.43,size:30},no:{price:.55,size:10},trades};

test('detects a compressed directional setup before the momentum baseline',()=>{
 const observation=predatorObservation(snapshot);
 assert.equal(observation.early,true);
 assert.equal(observation.baselineSide,null);
 const watch=openPredatorWatch(observation);
 assert.equal(watch.side,'UP');
 assert.ok(watch.estimatedNet>.015);
 assert.equal(predatorObservation({...snapshot,bookAt:now-4001}),null);
 assert.equal(predatorObservation({...snapshot,ticker:'KXETH15M-TEST'}),null);
 assert.equal(openPredatorWatch(predatorObservation({...snapshot,trades:[]})),null);
});

test('records a later paired baseline and only closes from executable same-round bids',()=>{
 const watch=openPredatorWatch(predatorObservation(snapshot));
 const later=advancePredatorWatch(watch,{...snapshot,now:now+3000,baselineSide:'UP'});
 assert.equal(later.baseline.at,now+3000);
 assert.equal(advancePredatorWatch(later,{...snapshot,ticker:'OTHER',now:now+4000}),later);
 const next=predatorObservation({...snapshot,now:now+5000,bookAt:now+5000,trades:[],
  yes:{price:.6,size:5},no:{price:.38,size:5}});
 const closed=advancePredatorWatch(later,next);
 assert.equal(closed.reason,'TAKE PROFIT');
 assert.equal(closed.leadMs,3000);
 assert.ok(closed.net>0);
 assert.equal(advancePredatorWatch(watch,{...snapshot,now:now+37000}).reason,'UNSCORED_GAP');
});
