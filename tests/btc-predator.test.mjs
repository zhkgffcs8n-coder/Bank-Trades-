import test from 'node:test';
import assert from 'node:assert/strict';
import {predatorObservation,openPredatorWatch,advancePredatorWatch,confirmPredatorEntry} from '../src/btc-predator.mjs';

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
 // A 2s-old book can still be monitored but cannot originate a new watch.
 const stale=predatorObservation({...snapshot,bookAt:now-1501});
 assert.equal(stale?.early,true);
 assert.equal(openPredatorWatch(stale),null);
 assert.equal(openPredatorWatch(predatorObservation({...snapshot,bookAt:now-1500}))?.side,'UP');
 assert.equal(openPredatorWatch({...observation,bookAt:now+1}),null);
 assert.equal(predatorObservation({...snapshot,bookAt:now-4001}),null);
 assert.equal(predatorObservation({...snapshot,ticker:'KXETH15M-TEST'}),null);
 assert.equal(openPredatorWatch(predatorObservation({...snapshot,trades:[]})),null);
});

test('records a later paired baseline and only closes from executable same-round bids',()=>{
 const watch=openPredatorWatch(predatorObservation(snapshot));
 // A later baseline needs a new executable book; an aged snapshot is not evidence.
 assert.equal(advancePredatorWatch(watch,{...snapshot,now:now+3000,baselineSide:'UP'}),watch);
 // The paired baseline book must also be executable without immediately stopping the watch.
 const later=advancePredatorWatch(watch,{...snapshot,now:now+3000,bookAt:now+3000,baselineSide:'UP',
  yes:{price:.48,size:30},no:{price:.50,size:10}});
 assert.equal(later.baseline.at,now+3000);
 assert.equal(later.reason,undefined);
 assert.equal(advancePredatorWatch(later,{...snapshot,ticker:'OTHER',now:now+4000}),later);
 assert.equal(advancePredatorWatch(later,{...snapshot,now:now+4000,bookAt:now+3000}),later);
 assert.equal(advancePredatorWatch(later,{...snapshot,now:now+4000,bookAt:now+4001}),later);
 const next=predatorObservation({...snapshot,now:now+5000,bookAt:now+5000,trades:[],
  yes:{price:.6,size:5},no:{price:.38,size:5}});
 const closed=advancePredatorWatch(later,next);
 assert.equal(closed.reason,'TAKE PROFIT');
 assert.equal(closed.leadMs,3000);
 assert.ok(closed.net>0);
 assert.equal(advancePredatorWatch(watch,{...snapshot,now:now+37000,bookAt:now+37000}).reason,'UNSCORED_GAP');
});

test('VOLT waits for fresh confirmation, rejects repricing, and tracks a later executable exit',()=>{
 const observation=predatorObservation(snapshot);
 const watch=openPredatorWatch(observation);
 assert.equal(confirmPredatorEntry(watch,observation),null);
 const next={...observation,now:now+1000,sourceEventAt:now+1000};
 assert.equal(confirmPredatorEntry(watch,{...next,no:{price:.52,size:10}}),null);
 assert.equal(confirmPredatorEntry(watch,{...next,side:'DOWN'}),null);
 const fill=confirmPredatorEntry(watch,next);
 assert.equal(fill.warningMs,1000);
 assert.equal(fill.watchAt,watch.at);
 const exit=predatorObservation({...snapshot,now:now+40000,bookAt:now+40000,
  yes:{price:.53,size:2},no:{price:.4,size:2},trades:[],monitoring:true});
 assert.equal(advancePredatorWatch(fill,exit).reason,'TRAIL EXIT');
});

test('early research freezes an executable ask on same-contract spread compression',async()=>{
 const {predatorEarlyProbe}=await import('../src/btc-predator.mjs');
 const book={ticker:'KXBTC15M-X',now:1100,bookAt:1100,remaining:75,side:'DOWN',
  yes:{price:.68,size:1},no:{price:.30,size:4},sourceEventAt:1050,flow:-.6,imbalance:-.6,acceleration:-.01};
 const previous={ticker:book.ticker,bookAt:1000,spread:.04};
 assert.equal(predatorEarlyProbe(book,previous).ask,1-.68);
 assert.equal(predatorEarlyProbe({...book,now:2700},previous),null);
 assert.equal(predatorEarlyProbe(book,{...previous,ticker:'OTHER'}),null);
});
