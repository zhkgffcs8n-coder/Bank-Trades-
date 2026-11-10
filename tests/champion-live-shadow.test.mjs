import test from 'node:test';
import assert from 'node:assert/strict';
import {observeChampion} from '../src/champion-live-shadow.mjs';

test('champion uses fresh authenticated depth and retains its reference through a weak signal',()=>{
 const now=Date.now(),close=new Date(now+600000).toISOString();
 const ticker='KXBTC15M-test';
 const input={now,market:{ticker,close_time:close},
  book:{ticker,eventAt:now-30,receivedAt:now-10,yes:{price:.59},no:{price:.40}},
  bookSource:'KALSHI_WS',evidence:{at:now,candleAt:now-60000,bull:6,bear:1,direction:'up'}};
 const entry=observeChampion(input);
 assert.equal(entry.action,'BUY UP');
 assert.equal(entry.position.entry,60);
 const hold=observeChampion({...input,evidence:{...input.evidence,bull:1},previous:entry.position});
 assert.equal(hold.action,'HOLD UP');
 assert.equal(observeChampion({...input,bookSource:'KALSHI_REST'}),null);
 assert.equal(observeChampion({...input,book:{...input.book,eventAt:now-5000}}),null);
});
