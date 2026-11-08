import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeOmegaPaper} from '../netlify/functions/omega-paper-summary.mjs';
import {SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';
function store(records){
 const data=new Map(records);
 return {async get(k){return data.get(k)||null},async *list({prefix,paginate}){
  assert.equal(paginate,true);
  yield {blobs:[...data.keys()].filter(k=>k.startsWith(prefix)).sort().map(key=>({key}))};
 }};
}
function record(ticker,overrides={}){
 const p={ticker,roundId:ticker,side:'UP',status:'OPEN',quantity:2,entryCostDollars:1.1,openedAtMs:1000,...overrides};
 return ['omega/paper/v1/'+ticker,{state:{positions:{[ticker]:p}}}];
}
test('read-only OMEGA accounting separates open, simulated exits and official settlements',async()=>{
 const db=store([
  record('BTC-OPEN'),
  record('BTC-CLOSED',{status:'CLOSED',closedAtMs:2000,netDollars:-.2}),
  record('BTC-SETTLED',{status:'SETTLED',settledAtMs:3000,netDollars:.9,
   payoutDollars:2,outcome:'yes',settlementVerification:SETTLEMENT_VERIFICATION})
 ]);
 const r=await summarizeOmegaPaper(db);
 assert.equal(r.status,'COMPLETE_INSPECTED_ARCHIVE');
 assert.equal(r.openPositions,1);
 assert.equal(r.simulatedBidExits,1);
 assert.equal(r.officiallySettledPositions,1);
 assert.equal(r.realizedNetDollars,.7);
 assert.equal(r.maxRealizedDrawdownDollars,.2);
 assert.equal(r.ordersAuthorized,false);
});
test('bounded scan refuses to call partial archive net PnL a total',async()=>{
 const db=store([record('BTC-A',{status:'CLOSED',closedAtMs:2000,netDollars:2}),
  record('BTC-B',{status:'CLOSED',closedAtMs:3000,netDollars:-1})]);
 const r=await summarizeOmegaPaper(db,{limit:1});
 assert.equal(r.historyTruncated,true);
 assert.equal(r.realizedNetDollars,null);
 assert.equal(r.maxRealizedDrawdownDollars,null);
 assert.equal(r.status,'INCOMPLETE_PAPER_HISTORY');
});
test('malformed and unverified settlement records never contribute to reported PnL',async()=>{
 const db=store([record('BTC-BAD',{status:'SETTLED',settledAtMs:3000,netDollars:100,
  payoutDollars:2,outcome:'yes',settlementVerification:'UNVERIFIED'})]);
 const r=await summarizeOmegaPaper(db);
 assert.equal(r.invalidPositions,1);
 assert.equal(r.officiallySettledPositions,0);
 assert.equal(r.realizedNetDollars,null);
});

test('impossible simulated exit profits invalidate the archive instead of inflating net paper PnL',async()=>{
 const db=store([
  record('BTC-IMPOSSIBLE',{status:'CLOSED',closedAtMs:2000,quantity:2,entryCostDollars:1.1,netDollars:100}),
  record('BTC-VALID',{status:'CLOSED',closedAtMs:3000,quantity:2,entryCostDollars:1.1,netDollars:.5})
 ]);
 const r=await summarizeOmegaPaper(db);
 assert.equal(r.invalidPositions,1);
 assert.equal(r.simulatedBidExits,1);
 assert.equal(r.status,'INCOMPLETE_PAPER_HISTORY');
 assert.equal(r.realizedNetDollars,null);
 assert.equal(r.maxRealizedDrawdownDollars,null);
 assert.equal(r.ordersAuthorized,false);
});

test('OMEGA paper archive rejects entries above the $5 execution cap before reporting PnL',async()=>{
 const db=store([
  record('BTC-OVER-CLOSED',{status:'CLOSED',closedAtMs:2000,quantity:20,entryCostDollars:5.50,netDollars:2}),
  record('BTC-OVER-SETTLED',{status:'SETTLED',settledAtMs:3000,quantity:20,entryCostDollars:6,netDollars:14,
   payoutDollars:20,outcome:'yes',settlementVerification:SETTLEMENT_VERIFICATION}),
  record('BTC-WITHIN-CAP',{status:'CLOSED',closedAtMs:4000,quantity:8,entryCostDollars:4.95,netDollars:-.5})
 ]);
 const r=await summarizeOmegaPaper(db);
 assert.equal(r.invalidPositions,2);
 assert.equal(r.simulatedBidExits,1);
 assert.equal(r.officiallySettledPositions,0);
 assert.equal(r.status,'INCOMPLETE_PAPER_HISTORY');
 assert.equal(r.realizedNetDollars,null);
 assert.equal(r.maxRealizedDrawdownDollars,null);
 assert.equal(r.ordersAuthorized,false);
});

test('impossible negative simulated exits cannot inflate paper drawdown or losses',async()=>{
 const db=store([
  record('BTC-NEGATIVE-IMPOSSIBLE',{status:'CLOSED',closedAtMs:2000,quantity:2,entryCostDollars:1.1,netDollars:-100}),
  record('BTC-VALID-EXIT',{status:'CLOSED',closedAtMs:3000,quantity:2,entryCostDollars:1.1,netDollars:-1.15})
 ]);
 const r=await summarizeOmegaPaper(db);
 assert.equal(r.invalidPositions,1);
 assert.equal(r.simulatedBidExits,1);
 assert.equal(r.status,'INCOMPLETE_PAPER_HISTORY');
 assert.equal(r.realizedNetDollars,null);
 assert.equal(r.maxRealizedDrawdownDollars,null);
 assert.equal(r.ordersAuthorized,false);
});
test('a valid zero-proceeds paper exit includes its fixed exit fee',async()=>{
 const db=store([record('BTC-ZERO-PROCEEDS',{status:'CLOSED',closedAtMs:2000,
  quantity:2,entryCostDollars:1.1,netDollars:-1.15})]);
 const r=await summarizeOmegaPaper(db);
 assert.equal(r.invalidPositions,0);
 assert.equal(r.status,'COMPLETE_INSPECTED_ARCHIVE');
 assert.equal(r.realizedNetDollars,-1.15);
 assert.equal(r.maxRealizedDrawdownDollars,1.15);
});


test('future-dated OMEGA paper events cannot count as realized PnL',async()=>{
 const db=store([
  record('BTC-FUTURE-OPEN',{openedAtMs:6000}),
  record('BTC-FUTURE-EXIT',{status:'CLOSED',closedAtMs:6000,netDollars:.5}),
  record('BTC-FUTURE-SETTLE',{status:'SETTLED',settledAtMs:6000,netDollars:.9,
   payoutDollars:2,outcome:'yes',settlementVerification:SETTLEMENT_VERIFICATION}),
  record('BTC-VALID-EXIT',{status:'CLOSED',closedAtMs:3000,netDollars:.5})
 ]);
 const r=await summarizeOmegaPaper(db,{nowMs:5000});
 assert.equal(r.invalidPositions,3);
 assert.equal(r.simulatedBidExits,1);
 assert.equal(r.officiallySettledPositions,0);
 assert.equal(r.status,'INCOMPLETE_PAPER_HISTORY');
 assert.equal(r.realizedNetDollars,null);
 assert.equal(r.maxRealizedDrawdownDollars,null);
 assert.equal(r.ordersAuthorized,false);
});

test('OMEGA accounting rejects invalid report clocks',async()=>{
 const db=store([record('BTC-VALID-EXIT',{status:'CLOSED',closedAtMs:3000,netDollars:.5})]);
 for(const nowMs of [0,-1,NaN,Infinity,'5000',1.5]){
  await assert.rejects(summarizeOmegaPaper(db,{nowMs}),/Invalid paper accounting time/);
 }
 const r=await summarizeOmegaPaper(db,{nowMs:5000});
 assert.equal(r.status,'COMPLETE_INSPECTED_ARCHIVE');
 assert.equal(r.realizedNetDollars,.5);
});
