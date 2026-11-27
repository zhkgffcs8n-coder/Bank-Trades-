import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const scalpClock='),source.indexOf('const researchReadouts='));
test('cashout stays blank until the exit is visible and then shows the recorded bid and time',()=>{
 const cashPercent={},cashLabel={},entryPercent={},entryLabel={},currentAsk={},entryTime={},cashTime={},scalpPrices={dataset:{}};
 const market={no_ask:62};
 const paint=runInNewContext(code+'\npaintScalpPrices',{cashPercent,cashLabel,entryPercent,entryLabel,currentAsk,entryTime,cashTime,scalpPrices,
  scalpQuotes:new Map([['BTC',{market}]]),scalpQuoteStatus:()=>({fresh:true}),price:(m,k)=>m[k]});
 const position={ticker:'KXBTC15M-TEST',side:'down',entry:45,entryAt:Date.parse('2026-11-27T11:46:00.125Z'),exit:null};
 paint(position,null);
 assert.equal(entryPercent.textContent,'45.0%');
 assert.equal(entryLabel.textContent,'BUY CALL · ORIGINAL ASK');
 assert.equal(currentAsk.textContent,'ASK NOW 62.0%');
 assert.equal(entryTime.textContent,'03:46:00.125 PT');
 position.exit='TAKE PROFIT';position.exitBid=87;position.exitAt=position.entryAt+1200;
 paint(position,null);
 assert.equal(cashPercent.textContent,'');
 assert.equal(cashTime.textContent,'');
 assert.equal(cashLabel.textContent,'CASH OUT · WAIT');
 paint(position,position.exit);
 assert.equal(cashPercent.textContent,'87.0%');
 assert.equal(cashTime.textContent,'03:46:01.325 PT');
 assert.equal(cashLabel.textContent,'CASH OUT · EXIT CALL');
});
