import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceOmegaPaper} from '../src/omega-paper-coordinator.mjs';
const signal={status:'SHADOW_CANDIDATE',ordersAuthorized:false,marketTicker:'BTC-R1',roundId:'R1',forecast:{consensus:'UP'}};
const q={ticker:'BTC-R1',yesAskDollars:.5,noAskDollars:.51,yesBidDollars:.55,noBidDollars:.45,asOfMs:100000};
const base={signal,quote:q,roundId:'R1',feesDollars:0,nowMs:101000};
test('paper opens, holds, exits and never reenters same round',()=>{
 const open=advanceOmegaPaper(base);
 assert.equal(open.status,'PAPER_ENTRY');assert.equal(open.realOrdersAuthorized,false);
 const hold=advanceOmegaPaper({...base,state:open.state,nowMs:101001});
 assert.equal(hold.status,'PAPER_HOLD');
 const exit=advanceOmegaPaper({...base,state:hold.state,nowMs:101002,exitAtProfitDollars:.4});
 assert.equal(exit.status,'PAPER_EXIT');
 const again=advanceOmegaPaper({...base,state:exit.state,nowMs:101003});
 assert.equal(again.status,'BLOCKED');
});
test('stale quotes and mismatched rounds block execution',()=>{
 assert.equal(advanceOmegaPaper({...base,nowMs:105000}).status,'BLOCKED');
 assert.equal(advanceOmegaPaper({...base,signal:{...signal,roundId:'R2'}}).status,'BLOCKED');
});
test('position cannot silently roll into new round',()=>{
 const open=advanceOmegaPaper(base);
 assert.equal(advanceOmegaPaper({...base,state:open.state,roundId:'R2'}).status,'BLOCKED');
});
