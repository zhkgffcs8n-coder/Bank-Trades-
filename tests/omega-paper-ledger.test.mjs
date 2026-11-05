import test from 'node:test';
import assert from 'node:assert/strict';
import {paperEntry,paperExit} from '../src/omega-paper-ledger.mjs';
const signal={status:'SHADOW_CANDIDATE',ordersAuthorized:false,forecast:{consensus:'UP'}};
const quote={ticker:'BTC-R1',askDollars:.55,asOfMs:99000};
test('paper entry stays within $5 and never authorizes real orders',()=>{
 const r=paperEntry({signal,quote,stakeDollars:5,feesDollars:.1,nowMs:100000});
 assert.equal(r.status,'PAPER_OPEN');assert.equal(r.realOrdersAuthorized,false);assert.ok(r.position.entryCostDollars<=5);
 const e=paperExit({position:r.position,quote:{ticker:'BTC-R1',bidDollars:.6,asOfMs:100000},feesDollars:.1,nowMs:101000});
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
 assert.equal(paperExit({position:{status:'OPEN',ticker:'BTC',quantity:1,entryCostDollars:.5},quote:{ticker:'ETH',bidDollars:.6,asOfMs:99000},feesDollars:0,nowMs:100000}).status,'BLOCKED');
});
