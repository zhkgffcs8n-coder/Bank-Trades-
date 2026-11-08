import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCoinbaseTape,scorePredatorSamples} from '../src/predator-forward.mjs';

test('Coinbase tape rejects future and duplicate trades and normalizes aggressor direction',()=>{
 const trade={time:new Date(9000).toISOString(),trade_id:1,price:'100000',size:'.5',side:'sell'};
 const rows=normalizeCoinbaseTape([trade,trade,{...trade,trade_id:2,time:new Date(11000).toISOString()}],10000);
 assert.deepEqual(rows,[{time:9000,price:100000,flow:.5}]);
});

test('forward research scores only same-round later executable books at supported horizons',()=>{
 const ticker='KXBTC15M-T',book={yes:{price:.4,size:3},no:{price:.58,size:4}};
 const entry={ticker,at:10000,expiresAt:200000,book,sourceEventAt:9999,early:{side:'UP',ask:.42}};
 const exit={ticker,at:70000,book:{yes:{price:.6,size:1},no:{price:.38,size:1}}};
 const [scored]=scorePredatorSamples([entry],exit);
 assert.equal(scored.horizon,60);
 assert.ok(scored.early.net>0&&scored.early.net<.18);
 assert.equal(scorePredatorSamples([entry],{...exit,ticker:'OTHER'}).length,0);
 assert.equal(scorePredatorSamples([entry],{...exit,at:entry.at-1}).length,0);
 assert.equal(scorePredatorSamples([{...entry,early:null}],exit)[0].earlySkippedProfitable,true);
 assert.equal(scorePredatorSamples([{...entry,early:null,sourceEventAt:null}],exit)[0].earlySkippedProfitable,false);
});
