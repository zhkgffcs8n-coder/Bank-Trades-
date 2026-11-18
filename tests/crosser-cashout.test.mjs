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
  return runInNewContext(code+'\nentries',{positions:new Map([['round',position]]),rounds:new Map([[123,round]]),entered:new Set(),validUntil:999});
 };
 assert.equal(run(60)[0].action,'HOLD UP');assert.equal(position.exitBid,undefined);
 assert.equal(run(70,true)[0].action,'SELL UP');assert.equal(position.exitBid,70);
 assert.equal(run(80)[0].exitBid,80);assert.equal(position.exitBid,70);
 assert.match(html,/priceBox\(position.exitBid == null \? 'CASH OUT · WAIT'/);
 assert.match(html,/cross-coin-live-percent/);
});
