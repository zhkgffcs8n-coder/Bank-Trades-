import test from 'node:test';
import assert from 'node:assert/strict';
import {pairedWaitDiagnostics} from '../src/paired-wait-diagnostics.mjs';

const now=Date.parse('2026-10-31T15:00:00Z');
const ticker='KXBTC15M-TEST';
const latest={ticker,observedAt:now,expiresAt:now+300000,yesBid:.50,yesAsk:.52,noBid:.46,noAsk:.48};
const samples=[-210000,-150000,-90000,-30000].map(delta=>({ticker,t:now+delta,observedAt:now+delta+1000,yesMid:.5}));

test('qualified frozen-input diagnostics do not claim a directional prediction',()=>{
 const result=pairedWaitDiagnostics(latest,samples,{valid:true},now);
 assert.equal(result.status,'READY_TO_EVALUATE');
 assert.equal(result.sampleCount,4);
 assert.deepEqual(result.reasons,[]);
 assert.match(result.note,/do not imply/);
});
test('missing and stale data yield explicit WAIT reasons, not synthetic votes',()=>{
 const empty=pairedWaitDiagnostics(null,[],null,now);
 assert.equal(empty.status,'NO_CURRENT_CONTRACT');
 const stale=pairedWaitDiagnostics({...latest,observedAt:now-180000,yesAsk:null,expiresAt:now+100000},[],{valid:false,error:'API unavailable'},now);
 assert.equal(stale.status,'WAIT');
 assert.match(stale.reasons.join(' '),/Collector error/);
 assert.match(stale.reasons.join(' '),/older than 120 seconds/);
 assert.match(stale.reasons.join(' '),/outside the 3–7 minute/);
 assert.match(stale.reasons.join(' '),/bid\/ask quote/);
 assert.match(stale.reasons.join(' '),/four distinct/);
});
test('future-observed sample is excluded and wide spreads are explained',()=>{
 const future={...samples.at(-1),observedAt:now+1000};
 const result=pairedWaitDiagnostics({...latest,yesAsk:.60},[...samples.slice(0,-1),future],{valid:true},now);
 assert.equal(result.status,'WAIT');
 assert.equal(result.sampleCount,3);
 assert.match(result.reasons.join(' '),/four distinct/);
 assert.match(result.reasons.join(' '),/spread exceeds four cents/);
});
