import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function paintScalpPrices('),source.indexOf('const researchReadouts='));
test('cashout stays blank during HOLD despite moving bids and freezes at exit',()=>{
 const cashPercent={},cashLabel={},entryPercent={},scalpPrices={dataset:{}};
 const paint=runInNewContext(code+'\npaintScalpPrices',{cashPercent,cashLabel,entryPercent,scalpPrices});
 const position={side:'down',entry:76,exit:null};
 for(const bid of [83,81,90]){
  paint(position,bid);assert.equal(cashPercent.textContent,'');assert.equal(cashLabel.textContent,'CASH OUT · WAIT');assert.equal(entryPercent.textContent,'76.0%');
 }
 position.exit='TAKE PROFIT';position.exitBid=86;
 paint(position,94);assert.equal(cashPercent.textContent,'86.0%');assert.equal(cashLabel.textContent,'CASH OUT · EXIT CALL');
});
