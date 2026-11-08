import test from 'node:test';
import assert from 'node:assert/strict';
import {openHunterPaper,monitorHunterPaper,settleHunterPaper} from '../src/scalp-hunter-paper.mjs';
import {SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';

test('paper exits require later depth and calculate both entry and exit costs',()=>{
 const row=openHunterPaper('A',{ticker:'T',at:1,expiresAt:90000},{side:'UP',ask:.05,target:.2,horizonSeconds:60});
 assert.equal(monitorHunterPaper(row,{ticker:'T',at:2,yes:{price:.2,size:.5}}),row);
 const closed=monitorHunterPaper(row,{ticker:'T',at:3,yes:{price:.2,size:1}});
 assert.equal(closed.reason,'TAKE_PROFIT');
 assert.ok(closed.net>0&&closed.net<.15);
 const label={ticker:'T',labeledAt:90000,result:'no',verification:SETTLEMENT_VERIFICATION};
 assert.equal(settleHunterPaper(row,label,89999),null);
 assert.equal(settleHunterPaper(row,label,90000).net,-row.ask-row.entryCost);
});
