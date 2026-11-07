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
 const downQuote={...quote,yesAskDollars:.90,noAskDollars:.20,noBidDollars:.19};
 assert.equal(omegaPaperSignal(down,downQuote).forecast.consensus,'DOWN');
 const up={...research,fusion:{...research.fusion,modelMean:.45,modelMinusMarket:.20}};
 const upQuote={...quote,yesAskDollars:.20,yesBidDollars:.19,noAskDollars:.90};
 assert.equal(omegaPaperSignal(up,upQuote).forecast.consensus,'UP');
 const overpriced={...quote,yesAskDollars:.75,noAskDollars:.35,noBidDollars:.34};
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

test('crossed quotes never create a shadow entry, even when AI claims a large edge',()=>{
 const crossedUp={...quote,yesBidDollars:.90,yesAskDollars:.20};
 const crossedDown={...quote,noBidDollars:.90,noAskDollars:.20};
 assert.equal(omegaPaperSignal(research,crossedUp),null);
 assert.equal(omegaPaperSignal(research,crossedDown),null);
});
test('OMEGA never paper-enters or accepts inconsistent complementary YES/NO books',async()=>{
 const lowAsks={...quote,yesBidDollars:.10,noBidDollars:.10,yesAskDollars:.20,noAskDollars:.20};
 const highBids={...quote,yesBidDollars:.60,noBidDollars:.50,yesAskDollars:.61,noAskDollars:.51};
 for(const bad of [lowAsks,highBids])assert.equal(omegaPaperSignal(research,bad),null);
 const market={ticker:quote.ticker,status:'active',yes_bid_dollars:'0.10',no_bid_dollars:'0.10',
  yes_ask_dollars:'0.20',no_ask_dollars:'0.20'};
 const fetchImpl=async()=>({ok:true,json:async()=>({market})});
 assert.equal(await fetchOmegaLiveQuote({ticker:quote.ticker,nowMs:now,fetchImpl}),null);
 const good={...market,yes_bid_dollars:'0.44',no_bid_dollars:'0.54',yes_ask_dollars:'0.45',no_ask_dollars:'0.55'};
 assert.ok(await fetchOmegaLiveQuote({ticker:quote.ticker,nowMs:now,
  fetchImpl:async()=>({ok:true,json:async()=>({market:good})})}));
});

test('live Kalshi quote parser rejects crossed books and expired or malformed close times',async()=>{
 const market={ticker:quote.ticker,status:'active',yes_bid_dollars:'0.44',yes_ask_dollars:'0.45',
  no_bid_dollars:'0.54',no_ask_dollars:'0.55',close_time:new Date(now+10000).toISOString()};
 const fetchMarket=record=>async()=>({ok:true,json:async()=>({market:record})});
 assert.ok(await fetchOmegaLiveQuote({ticker:quote.ticker,nowMs:now,fetchImpl:fetchMarket(market)}));
 assert.equal(await fetchOmegaLiveQuote({ticker:quote.ticker,nowMs:now,fetchImpl:fetchMarket({...market,yes_bid_dollars:'0.80'})}),null);
 assert.equal(await fetchOmegaLiveQuote({ticker:quote.ticker,nowMs:now,fetchImpl:fetchMarket({...market,no_bid_dollars:'0.80'})}),null);
 assert.equal(await fetchOmegaLiveQuote({ticker:quote.ticker,nowMs:now,fetchImpl:fetchMarket({...market,close_time:new Date(now-1).toISOString()})}),null);
 assert.equal(await fetchOmegaLiveQuote({ticker:quote.ticker,nowMs:now,fetchImpl:fetchMarket({...market,close_time:'not-a-time'})}),null);
});

test('zero Kalshi bids are valid observations but never invented executable exit fills',async()=>{
 const market={ticker:'BTC-ROUND',status:'active',yes_ask_dollars:'0.45',no_ask_dollars:'0.55',yes_bid_dollars:'0',no_bid_dollars:'0.54'};
 const fetchImpl=async()=>({ok:true,json:async()=>({market})});
 const observed=await fetchOmegaLiveQuote({ticker:'BTC-ROUND',nowMs:now,fetchImpl});
 assert.ok(observed);assert.equal(observed.yesBidDollars,0);
 const data=new Map([['omega/paper/v1/BTC-ROUND',{state:{positions:{'BTC-ROUND':{status:'OPEN',ticker:'BTC-ROUND',roundId:'BTC-ROUND',side:'UP',quantity:2,entryCostDollars:.9,openedAtMs:now-1000}},entered:{}}}]]);
 const db={get:async k=>data.get(k)||null,setJSON:async(k,v)=>data.set(k,v)};
 const result=await advanceOmegaPaperStored({db,ticker:'BTC-ROUND',roundId:'BTC-ROUND',signal:null,quote:observed,nowMs:now});
 assert.equal(result.status,'BLOCKED');assert.equal(data.get('omega/paper/v1/BTC-ROUND').state.positions['BTC-ROUND'].status,'OPEN');
 assert.equal(data.has('omega/paper/latest'),false);
});
test('zero bid parser rejects missing or coercible fake zero prices',async()=>{
 const base={ticker:'BTC-ROUND',status:'active',yes_ask_dollars:'0.45',no_ask_dollars:'0.55',no_bid_dollars:'0.54'};
 const read=async market=>fetchOmegaLiveQuote({ticker:'BTC-ROUND',nowMs:now,fetchImpl:async()=>({ok:true,json:async()=>({market})})});
 for(const bad of [null,'',false,'  ', '0x0'])assert.equal(await read({...base,yes_bid_dollars:bad}),null);
 assert.equal(await read(base),null);
 assert.equal((await read({...base,yes_bid_dollars:'0'})).yesBidDollars,0);
});
