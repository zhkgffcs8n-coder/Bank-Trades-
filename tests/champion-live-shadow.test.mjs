import test from 'node:test';
import assert from 'node:assert/strict';
import {championSpotEvidence,observeChampion} from '../src/champion-live-shadow.mjs';

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


test('champion spot evidence rejects future-dated and stale snapshots without look-ahead',()=>{
 const now=Date.now();
 const minute=Math.floor(now/60000)*60;
 const candles=Array.from({length:70},(_,i)=>{
  const price=100+i/100;
  return {t:minute-(70-i)*60,open:price,high:price+1,low:price-1,close:price,volume:100};
 });
 const data={asset:'BTC',fetched_at:new Date(now-1000).toISOString(),candles};
 assert.ok(championSpotEvidence(data,now));
 assert.equal(championSpotEvidence({...data,fetched_at:new Date(now+1000).toISOString()},now),null);
 assert.equal(championSpotEvidence({...data,fetched_at:new Date(now-30001).toISOString()},now),null);
});
