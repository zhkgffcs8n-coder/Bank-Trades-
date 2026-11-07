import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaPaperSignal,advanceOmegaPaperStored,fetchOmegaLiveQuote} from '../netlify/functions/lib/omega-auto-paper.mjs';
const now=100000;
const research={status:'SHADOW_RESEARCH',fusion:{marketTicker:'BTC-ROUND',roundId:'BTC-ROUND',modelMinusMarket:.2,modelMean:.7,modelDisagreement:.04}};
const quote={ticker:'BTC-ROUND',asOfMs:now,yesAskDollars:.45,noAskDollars:.55,yesBidDollars:.44,noBidDollars:.54};
test('no entry without a fresh executable-side edge',()=>{
 assert.equal(omegaPaperSignal(research),null);
 assert.equal(omegaPaperSignal(research,{...quote,ticker:'OTHER'}),null);
 assert.equal(omegaPaperSignal(research,{...quote,yesAskDollars:.91,noAskDollars:.49}),null);
 assert.equal(omegaPaperSignal(research,quote).forecast.consensus,'UP');
});
test('paper direction follows net ask edge, not probability majority or absolute midpoint difference',()=>{
 const down={...research,fusion:{...research.fusion,modelMean:.55,modelMinusMarket:-.20}};
 const downQuote={...quote,yesAskDollars:.90,noAskDollars:.20};
 assert.equal(omegaPaperSignal(down,downQuote).forecast.consensus,'DOWN');
 const up={...research,fusion:{...research.fusion,modelMean:.45,modelMinusMarket:.20}};
 const upQuote={...quote,yesAskDollars:.20,noAskDollars:.90};
 assert.equal(omegaPaperSignal(up,upQuote).forecast.consensus,'UP');
 const overpriced={...quote,yesAskDollars:.75,noAskDollars:.35};
 assert.equal(omegaPaperSignal(research,overpriced),null);
});
test('automatically enters and exits paper without a second entry',async()=>{
 const values=new Map();
 const db={get:async k=>values.get(k)||null,setJSON:async(k,v)=>values.set(k,v)};
 const signal=omegaPaperSignal(research,quote);
 const a=await advanceOmegaPaperStored({db,ticker:quote.ticker,roundId:quote.ticker,signal,quote,nowMs:now});
 assert.equal(a.status,'PAPER_ENTRY');
 const b=await advanceOmegaPaperStored({db,ticker:quote.ticker,roundId:quote.ticker,signal,quote:{...quote,asOfMs:now+1000,yesBidDollars:.7},nowMs:now+1000});
 assert.equal(b.status,'PAPER_EXIT');
 const c=await advanceOmegaPaperStored({db,ticker:quote.ticker,roundId:quote.ticker,signal,quote:{...quote,asOfMs:now+2000},nowMs:now+2000});
 assert.equal(c.status,'BLOCKED');assert.equal(values.get('omega/paper/latest').realOrdersAuthorized,false);
});
test('requires active matching contract and side-specific quotes',async()=>{
 const fetchImpl=async()=>({ok:true,json:async()=>({market:{ticker:'BTC-ROUND',status:'active',
  yes_ask_dollars:'0.45',no_ask_dollars:'0.55',yes_bid_dollars:'0.44',no_bid_dollars:'0.54'}})});
 assert.equal((await fetchOmegaLiveQuote({ticker:'BTC-ROUND',nowMs:now,fetchImpl})).yesAskDollars,.45);
 assert.equal(await fetchOmegaLiveQuote({ticker:'BAD/TICKER',nowMs:now,fetchImpl}),null);
});

test('HOLD persists trailing peak without inventing a new completed trade',async()=>{
 const ticker=quote.ticker,values=new Map([['omega/paper/v1/'+ticker,{state:{positions:{[ticker]:{status:'OPEN',ticker,roundId:ticker,side:'UP',quantity:1,entryCostDollars:.5}},entered:{}}}]]);
 const db={get:async k=>structuredClone(values.get(k)||null),setJSON:async(k,v)=>values.set(k,structuredClone(v))};
 const result=await advanceOmegaPaperStored({db,ticker,roundId:ticker,quote:{...quote,yesBidDollars:.8},nowMs:now});
 assert.equal(result.status,'PAPER_HOLD');assert.equal(values.get('omega/paper/v1/'+ticker).state.positions[ticker].peakNetDollars,.24);assert.equal(values.has('omega/paper/latest'),false);
});

test('official settlement closes stranded paper position with actual payout, once',async()=>{
 const {settleOmegaPaperStored}=await import('../netlify/functions/lib/omega-auto-paper.mjs');
 const {SETTLEMENT_VERIFICATION}=await import('../src/official-settlement.mjs');
 const ticker='BTC-SETTLE',data=new Map();
 const db={async get(key){return structuredClone(data.get(key)||null)},async setJSON(key,value){data.set(key,structuredClone(value))},async delete(key){data.delete(key)}};
 const position={status:'OPEN',ticker,roundId:ticker,side:'DOWN',quantity:4,entryCostDollars:2.25,openedAtMs:100000};
 data.set('omega/paper/v1/'+ticker,{state:{positions:{[ticker]:position},entered:{[ticker+'|'+ticker]:true}}});
 data.set('omega/paper/open/v1/'+ticker,{ticker});
 data.set('outcomes/'+ticker,{ticker,result:'no',verification:SETTLEMENT_VERIFICATION,settledAt:new Date(110000).toISOString()});
 const tooEarly=await settleOmegaPaperStored({db,ticker,nowMs:109999});
 assert.equal(tooEarly.status,'WAITING_FOR_VERIFIED_SETTLEMENT');
 const done=await settleOmegaPaperStored({db,ticker,nowMs:110000});
 assert.equal(done.status,'PAPER_SETTLED');
 assert.equal(done.netDollars,1.75);
 assert.equal(data.get('omega/paper/v1/'+ticker).state.positions[ticker].status,'SETTLED');
 assert.equal(data.has('omega/paper/open/v1/'+ticker),false);
 assert.equal(data.get('omega/paper/latest').realOrdersAuthorized,false);
 assert.equal((await settleOmegaPaperStored({db,ticker,nowMs:120000})).status,'BLOCKED');
});
test('paper settlement rejects unverified outcomes and never invents a zero payout',async()=>{
 const {settleOmegaPaperStored}=await import('../netlify/functions/lib/omega-auto-paper.mjs');
 const ticker='BTC-UNVERIFIED',data=new Map([
 ['omega/paper/v1/'+ticker,{state:{positions:{[ticker]:{status:'OPEN',ticker,roundId:ticker,side:'UP',quantity:2,entryCostDollars:1.2,openedAtMs:100000}}}}],
 ['outcomes/'+ticker,{ticker,result:'no',verification:'UNVERIFIED',settledAt:new Date(110000).toISOString()}]
 ]);
 const db={get:async key=>data.get(key)||null,setJSON:async(key,value)=>data.set(key,value)};
 const r=await settleOmegaPaperStored({db,ticker,nowMs:120000});
 assert.equal(r.status,'WAITING_FOR_VERIFIED_SETTLEMENT');
 assert.equal(data.get('omega/paper/v1/'+ticker).state.positions[ticker].status,'OPEN');
});
