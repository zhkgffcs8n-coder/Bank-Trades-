import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const status=source.slice(source.indexOf('function scalpQuoteStatus('),source.indexOf('function showScalp('));
const display=source.slice(source.indexOf('function showScalp('),source.indexOf('function scalp(market'));
function harness(position,snapshot){
 const scalpLabel={textContent:''},scalpDetail={textContent:''},prices=[];
 const context={positions:new Map([['BTC',position]]),scalpQuotes:new Map([['BTC',snapshot]]),selectedCoin:'BTC',
  scalpLabel,scalpDetail,scalpAction:{style:{}},scalpIcon:{},scalpMotion:null,
  actionLooks:new Proxy({},{get:()=>['icon','black','white',null]}),
  paintScalpPrices:(p,bid)=>prices.push({p,bid})};
 const show=runInNewContext('let sharedScalpCall;'+status+display+'\nshowScalp',context);
 return {show,scalpLabel,scalpDetail,prices};
}
for(const exit of [null,'SELL FAST'])test('data wait retains '+(exit||'open call')+' and independent live bid',()=>{
 const position={ticker:'round',side:'down',entry:50,exit,exitBid:exit?37:undefined};
 const h=harness(position,{ticker:'round',at:Date.now(),expiresAt:Date.now()+60000,down:42});
 h.show('DATA WAIT · Spot evidence stale');
 assert.equal(h.scalpLabel.textContent,(exit?'SELL FAST DOWN':'HOLD DOWN')+' · 42.0% LIVE BID');
 assert.match(h.scalpDetail.textContent,/Called BUY DOWN at 50.0%/);
 assert.equal(h.prices.at(-1).bid,42);
 assert.equal(position.exitBid,exit?37:undefined);
});
test('stale and different-round quotes never display as live',()=>{
 for(const snapshot of [{ticker:'round',at:Date.now()-31000,expiresAt:Date.now()+60000,up:61},{ticker:'next-round',at:Date.now(),expiresAt:Date.now()+60000,up:61}]){
  const h=harness({ticker:'round',side:'up',entry:50},snapshot);
  h.show('DATA WAIT · Quotes unavailable');
  assert.doesNotMatch(h.scalpLabel.textContent,/LIVE BID/);
  assert.match(h.scalpLabel.textContent,/HOLD UP/);
  assert.equal(h.prices.at(-1).bid,undefined);
 }
});
