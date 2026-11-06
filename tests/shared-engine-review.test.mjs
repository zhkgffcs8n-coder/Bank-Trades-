import test from 'node:test';import assert from 'node:assert/strict';
import {reviewSharedRound} from '../src/shared-engine-review.mjs';
test('same market snapshot feeds all three engines without authorizing trades',()=>{
 const now=Date.parse('2026-11-05T12:00:00Z');
 const market={ticker:'KXBTC15M-TEST',yes_bid_dollars:.44,yes_ask_dollars:.46,no_bid_dollars:.54,no_ask_dollars:.56,expected_expiration_time:new Date(now+600000).toISOString()};
 const records=[0,1,2,3,4].map(i=>({ticker:market.ticker,t:now-240000+i*60000,yesMid:.4+i*.01}));
 const r=reviewSharedRound({market,records,nowMs:now,forecasts:[],marketBaseline:null});
 assert.equal(r.ticker,market.ticker);
 assert.ok(r.spider);assert.ok(r.primal);assert.ok(r.omega);
 assert.equal(r.ordersAuthorized,false);assert.equal(r.automaticPromotion,false);
});
