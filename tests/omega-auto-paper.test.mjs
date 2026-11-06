import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaPaperSignal,advanceOmegaPaperStored,fetchOmegaLiveQuote} from '../netlify/functions/lib/omega-auto-paper.mjs';
const now=100000;
const research={status:'SHADOW_RESEARCH',fusion:{marketTicker:'BTC-ROUND',roundId:'BTC-ROUND',modelMinusMarket:.2,modelMean:.7,modelDisagreement:.04}};
const quote={ticker:'BTC-ROUND',asOfMs:now,yesAskDollars:.45,noAskDollars:.55,yesBidDollars:.44,noBidDollars:.54};
test('no entry without strong model edge',()=>{
 assert.equal(omegaPaperSignal({...research,fusion:{...research.fusion,modelMinusMarket:.03}}),null);
 assert.equal(omegaPaperSignal(research).forecast.consensus,'UP');
});
test('automatically enters and exits paper without a second entry',async()=>{
 const values=new Map();
 const db={get:async k=>values.get(k)||null,setJSON:async(k,v)=>values.set(k,v)};
 const signal=omegaPaperSignal(research);
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
