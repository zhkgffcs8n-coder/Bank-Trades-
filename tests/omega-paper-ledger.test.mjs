import test from 'node:test';
import assert from 'node:assert/strict';
import {paperEntry,paperExit} from '../src/omega-paper-ledger.mjs';
const signal={status:'SHADOW_CANDIDATE',ordersAuthorized:false,forecast:{consensus:'UP'}};
const quote={ticker:'BTC-R1',yesAskDollars:.55,noAskDollars:.48,asOfMs:99000};
test('paper entry stays within $5 and never authorizes real orders',()=>{
 const r=paperEntry({signal,quote,stakeDollars:5,feesDollars:.1,nowMs:100000});
 assert.equal(r.status,'PAPER_OPEN');assert.equal(r.realOrdersAuthorized,false);assert.ok(r.position.entryCostDollars<=5);
 const e=paperExit({position:r.position,quote:{ticker:'BTC-R1',yesBidDollars:.6,noBidDollars:.4,asOfMs:100000},feesDollars:.1,nowMs:101000});
 assert.equal(e.status,'PAPER_CLOSED');assert.equal(e.realOrdersAuthorized,false);
});
test('stale quotes and unknown fees block entry',()=>{
 assert.equal(paperEntry({signal,quote,feesDollars:.1,nowMs:105000}).status,'BLOCKED');
 assert.equal(paperEntry({signal,quote,nowMs:100000}).status,'BLOCKED');
});
test('real order intent cannot masquerade as paper',()=>{
 assert.equal(paperEntry({signal:{...signal,ordersAuthorized:true},quote,feesDollars:0,nowMs:100000}).status,'BLOCKED');
});
test('wrong ticker prevents paper exit',()=>{
 assert.equal(paperExit({position:{status:'OPEN',ticker:'BTC',quantity:1,entryCostDollars:.5},quote:{ticker:'ETH',yesBidDollars:.6,noBidDollars:.4,asOfMs:99000},feesDollars:0,nowMs:100000}).status,'BLOCKED');
});

test('DOWN entry and exit use NO quotes, not YES quotes',()=>{
 const down={...signal,forecast:{consensus:'DOWN'}};
 const r=paperEntry({signal:down,quote:{ticker:'BTC-R2',yesAskDollars:.9,noAskDollars:.2,asOfMs:99000},stakeDollars:5,feesDollars:0,nowMs:100000});
 assert.equal(r.status,'PAPER_OPEN');assert.equal(r.position.side,'DOWN');assert.equal(r.position.quantity,25);
 const e=paperExit({position:r.position,quote:{ticker:'BTC-R2',yesBidDollars:.1,noBidDollars:.4,asOfMs:100000},feesDollars:0,nowMs:101000});
 assert.equal(e.status,'PAPER_CLOSED');assert.equal(e.netDollars,5);
});
test('ambiguous side-less quote is blocked',()=>{
 assert.equal(paperEntry({signal,quote:{ticker:'BTC',askDollars:.5,asOfMs:99000},feesDollars:0,nowMs:100000}).status,'BLOCKED');
});

test('malformed entry costs and missing direction cannot produce paper PnL',()=>{
 const base={status:'OPEN',ticker:'BTC-R1',side:'UP',quantity:2,entryCostDollars:1.2};
 const exitQuote={ticker:'BTC-R1',yesBidDollars:.6,noBidDollars:.4,asOfMs:99000};
 for(const invalid of [undefined,null,'1.2',NaN,Infinity,-1,0]){
  const result=paperExit({position:{...base,entryCostDollars:invalid},quote:exitQuote,feesDollars:0,nowMs:100000});
  assert.equal(result.status,'BLOCKED');assert.equal(result.realOrdersAuthorized,false);
 }
 for(const side of [undefined,'','BUY',null]){
  assert.equal(paperExit({position:{...base,side},quote:exitQuote,feesDollars:0,nowMs:100000}).status,'BLOCKED');
 }
 assert.equal(paperExit({position:base,quote:exitQuote,feesDollars:0,nowMs:100000}).status,'PAPER_CLOSED');
});

test('malformed entry costs and missing direction cannot produce paper PnL',()=>{
 const base={status:'OPEN',ticker:'BTC-R1',side:'UP',quantity:2,entryCostDollars:1.2};
 const exitQuote={ticker:'BTC-R1',bidDollars:.6,asOfMs:99000};
 for(const invalid of [undefined,null,'1.2',NaN,Infinity,-1,0]){
  const result=paperExit({position:{...base,entryCostDollars:invalid},quote:exitQuote,feesDollars:0,nowMs:100000});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.realOrdersAuthorized,false);
 }
 for(const side of [undefined,'', 'BUY',null]){
  assert.equal(paperExit({position:{...base,side},quote:exitQuote,feesDollars:0,nowMs:100000}).status,'BLOCKED');
 }
 assert.equal(paperExit({position:base,quote:exitQuote,feesDollars:0,nowMs:100000}).status,'PAPER_CLOSED');
});
