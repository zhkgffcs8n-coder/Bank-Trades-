import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceOmegaPaper} from '../src/omega-paper-coordinator.mjs';
const signal={status:'SHADOW_CANDIDATE',ordersAuthorized:false,marketTicker:'BTC-R1',roundId:'R1',forecast:{consensus:'UP'}};
const q={ticker:'BTC-R1',yesAskDollars:.5,noAskDollars:.51,yesBidDollars:.55,noBidDollars:.45,asOfMs:100000};
const base={signal,quote:q,roundId:'R1',feesDollars:0,nowMs:101000};
test('paper opens, holds, exits and never reenters same round',()=>{
 const open=advanceOmegaPaper(base);
 assert.equal(open.status,'PAPER_ENTRY');assert.equal(open.realOrdersAuthorized,false);
 const hold=advanceOmegaPaper({...base,state:open.state,nowMs:101001,quote:{...q,asOfMs:101001},exitAtProfitDollars:.6});
 assert.equal(hold.status,'PAPER_HOLD');
 const exit=advanceOmegaPaper({...base,state:hold.state,nowMs:101002,quote:{...q,asOfMs:101002},exitAtProfitDollars:.4});
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

test('paper trailing profit exit protects a previously observed peak',()=>{
 const opened=advanceOmegaPaper({...base,exitAtProfitDollars:2});
 assert.equal(opened.status,'PAPER_ENTRY');
 const rising=advanceOmegaPaper({...base,state:opened.state,nowMs:101001,quote:{...q,yesBidDollars:.58,asOfMs:101001},exitAtProfitDollars:2,trailingArmDollars:.5,trailingGivebackDollars:.25});
 assert.equal(rising.status,'PAPER_HOLD');
 assert.ok(rising.peakNetDollars>=.5);
 const falling=advanceOmegaPaper({...base,state:rising.state,nowMs:101002,quote:{...q,yesBidDollars:.54,asOfMs:101002},exitAtProfitDollars:2,trailingArmDollars:.5,trailingGivebackDollars:.25});
 assert.equal(falling.status,'PAPER_EXIT');
 assert.equal(falling.state.positions['BTC-R1'].exitReason,'TRAILING_PROFIT');
 assert.equal(falling.realOrdersAuthorized,false);
});
test('paper trailing peak is not updated on stale quotes',()=>{
 const opened=advanceOmegaPaper(base);
 const stale=advanceOmegaPaper({...base,state:opened.state,nowMs:105000,exitAtProfitDollars:2});
 assert.equal(stale.status,'BLOCKED');
 assert.deepEqual(stale.state,opened.state);
});

test('terminal paper positions cannot reenter when a legacy entry marker is missing',()=>{
 const opened=advanceOmegaPaper(base);
 assert.equal(opened.status,'PAPER_ENTRY');
 const closed=advanceOmegaPaper({...base,state:opened.state,nowMs:101002,quote:{...q,asOfMs:101002},exitAtProfitDollars:.4});
 assert.equal(closed.status,'PAPER_EXIT');
 for(const terminal of ['CLOSED','SETTLED']){
  const state={positions:{'BTC-R1':{...closed.state.positions['BTC-R1'],status:terminal}},entered:{}};
  const again=advanceOmegaPaper({...base,state,nowMs:101003});
  assert.equal(again.status,'BLOCKED',terminal);
  assert.deepEqual(again.state,state);
  assert.equal(again.realOrdersAuthorized,false);
 }
});
