import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const html=readFileSync(new URL('../private/dashboard.html',import.meta.url),'utf8');
const start=html.indexOf('    const entries = [...positions.values()]');
const code=html.slice(start,html.indexOf('    if (entries.length)',start));
test('cash-out stays empty during HOLD and freezes only at SELL while live bid moves',()=>{
 const position={ticker:'round',asset:'BTC',close:123,direction:1,ask:76,sell:false};
 const run=(bid,flip=false)=>{
  const round=[{ticker:'round',yesBid:bid,yesAsk:bid+1,lean:1},...Array.from({length:4},(_,i)=>({ticker:'peer'+i,lean:flip?-1:1}))];
  return runInNewContext(code+'\nentries',{positions:new Map([['round',position]]),rounds:new Map([[123,round]]),entered:new Set(),validUntil:999,freshBook:()=>null,now:0});
 };
 assert.equal(run(60)[0].action,'HOLD UP');assert.equal(position.exitBid,undefined);
 assert.equal(run(70,true)[0].action,'SELL UP');assert.equal(position.exitBid,70);
 assert.equal(run(80)[0].exitBid,80);assert.equal(position.exitBid,70);
 assert.match(html,/priceBox\(position.exitBid == null \? 'CASH OUT · WAIT'/);
 assert.match(html,/cross-coin-live-percent/);
});
test('simultaneous BNB and XRP live bids stay independent and fall back when stale',()=>{
 const start=html.indexOf('  const liveRows = new Map();');
 const code=html.slice(start,html.indexOf('  function spread(',start));
 const {liveRows,bookQuotes,paintBid}=runInNewContext(code+'\n;({liveRows,bookQuotes,paintBid})',{Date:{now:()=>10000},fastQuotes:new Map()});
 for(const [symbol,bid] of [['BNB',78.25],['XRP',70.5]]){
  const cell={label:{},value:{},position:{asset:symbol,direction:-1}};
  liveRows.set(symbol,cell);
  bookQuotes.set(symbol,{expiresAt:12000,receivedAt:9900,noBid:bid});
  paintBid(symbol);
  assert.equal(cell.value.textContent,bid+'%');
 }
 bookQuotes.delete('BNB');
 paintBid('BNB');
 assert.equal(liveRows.get('BNB').label.textContent,'DOWN BID · STALE');
 assert.equal(liveRows.get('XRP').value.textContent,'70.5%');
});
