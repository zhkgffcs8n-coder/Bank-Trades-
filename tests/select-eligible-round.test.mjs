import test from 'node:test';
import assert from 'node:assert/strict';
import {selectEligibleRound} from '../src/select-eligible-round.mjs';
const now=1000000;
const quote=(ticker,expiry,overrides={})=>({ticker,_expiry:expiry,yes_bid:58,yes_ask:60,no_bid:39,no_ask:41,...overrides});
test('collector falls back to the next valid expiring contract',()=>{
 const selected=selectEligibleRound([quote('BAD',now+60000,{yes_ask:null,yes_ask_dollars:''}),quote('GOOD',now+120000)],now);
 assert.equal(selected?.market.ticker,'GOOD');assert.equal(selected.yesAsk,.6);
});
test('collector prefers nearest eligible round regardless of API ordering',()=>{
 assert.equal(selectEligibleRound([quote('LATE',now+600000),quote('EARLY',now+60000)],now)?.market.ticker,'EARLY');
});
test('collector fails closed for stale, expired, missing and crossed quotes',()=>{
 assert.equal(selectEligibleRound([quote('EXPIRED',now-1),quote('FUTURE',now+1000000)],now),null);
 assert.equal(selectEligibleRound([quote('CROSSED',now+60000,{yes_bid:75})],now),null);
 assert.equal(selectEligibleRound([quote('',now+60000)],now),null);
});
test('collector accepts legitimate zero bid without inventing a fill',()=>{
 const x=selectEligibleRound([quote('ZERO',now+60000,{yes_bid:0})],now);
 assert.equal(x?.yesBid,0);
});
