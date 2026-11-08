import test from 'node:test';
import assert from 'node:assert/strict';
import {createKalshiDepth} from '../src/kalshi-depth-stream.mjs';

test('sequence gaps invalidate the book until a replacement snapshot arrives',()=>{
 const ticker='KXBTC15M-TEST',depth=createKalshiDepth(ticker);
 const snapshot={type:'orderbook_snapshot',seq:2,sid:1,msg:{market_ticker:ticker,yes_dollars_fp:[['.40','2']],no_dollars_fp:[['.58','5']]}};
 const delta={type:'orderbook_delta',seq:3,sid:1,msg:{market_ticker:ticker,side:'yes',price_dollars:'.41',delta_fp:'2',ts_ms:100}};
 assert.equal(depth.apply(snapshot,100).eventAt,null);
 assert.equal(depth.apply(delta,101).yes.price,.41);
 assert.equal(depth.apply({...delta,seq:5},102).status,'GAP');
 assert.equal(depth.apply({...delta,seq:6},103).status,'GAP');
 assert.equal(depth.apply({...snapshot,seq:7},104).status,'READY');
 assert.equal(depth.apply({...delta,seq:8,msg:{...delta.msg,price_dollars:'.43'}},105).status,'INVALID_BOOK');
});
