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
