import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const scalpPrices='),source.indexOf('const researchReadouts='));
test('the original two price cards show the locked ask and the recorded bid once exit is visible',()=>{
 const cashPercent={},cashLabel={},entryPercent={};
 const fields={'[data-entry-percent]':entryPercent,'[data-cash-percent]':cashPercent,'[data-cash-label]':cashLabel};
 const cards={dataset:{},querySelector:selector=>fields[selector]};
 const paint=runInNewContext(code+'\npaintScalpPrices',{
  document:{createElement:()=>cards},scalper:{querySelector:()=>({after(){}})}
 });
 assert.match(cards.innerHTML,/<div data-price-entry><span>BUY IN · ASK<\/span><strong data-entry-percent>—%<\/strong><\/div>/);
 assert.match(cards.innerHTML,/<div data-price-cash><span data-cash-label>CASH OUT · WAIT<\/span><strong data-cash-percent><\/strong><\/div>/);
 const position={ticker:'KXBTC15M-TEST',side:'down',entry:45,exit:null};
 paint(position,null);
 assert.equal(entryPercent.textContent,'45.0%');
 position.exit='TAKE PROFIT';position.exitBid=87;
 paint(position,null);
 assert.equal(cashPercent.textContent,'');
 assert.equal(cashLabel.textContent,'CASH OUT · WAIT');
 paint(position,position.exit);
 assert.equal(entryPercent.textContent,'45.0%');
 assert.equal(cashPercent.textContent,'87.0%');
 assert.equal(cashLabel.textContent,'CASH OUT · EXIT CALL');
});
