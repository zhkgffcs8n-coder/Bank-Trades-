import test from 'node:test';
import assert from 'node:assert/strict';
import {paperSignal} from '../netlify/functions/lib/shared-paper-signals.mjs';
const now=Date.parse('2026-11-02T12:00:00Z');
const market={ticker:'KXBTC15M-TEST',yes_bid:45,yes_ask:47,no_bid:53,no_ask:55,expected_expiration_time:new Date(now+600000).toISOString()};
const samples=[0,1,2,3].map(i=>({ticker:market.ticker,t:now-180000+i*60000,yesMid:.35+i*.035}));
test('momentum alone never creates unvalidated paper BUY',()=>{
 const r=paperSignal(market,samples,null,now,{model:null});
 assert.equal(r.action,'WAIT');assert.equal(r.validation,'MODEL_NOT_VALIDATED');
});
test('validated model with insufficient price edge remains WAIT',()=>{
 const model={weights:[0,0,0,0],count:120,brier:12,baselineBrier:20};
 const r=paperSignal({...market,yes_ask:79,yes_bid:77,no_bid:20,no_ask:22},samples,null,now,{model});
 assert.equal(r.action,'WAIT');
});
test('open paper position uses executable bid for take profit',()=>{
 const r=paperSignal(market,[],{side:'up',ask:30},now,null);
 assert.equal(r.action,'CASH OUT');assert.equal(r.exitBidCents,45);
});
test('open paper position uses executable bid for stop',()=>{
 const r=paperSignal(market,[],{side:'down',ask:70},now,null);
 assert.equal(r.action,'SELL FAST');assert.equal(r.exitBidCents,53);
});
