import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessPaperExitQuote} from '../src/paper-exit-quote.mjs';

const now=Date.parse('2026-11-02T06:00:00Z');
const position={status:'OPEN',ticker:'KXBTC15M-TEST',side:'up',qty:10,ask:55,cost:5.50};
const market={ticker:position.ticker,status:'open',yes_bid_dollars:'0.60',yes_ask_dollars:'0.62',
 no_bid_dollars:'0.38',no_ask_dollars:'0.40',expected_expiration_time:new Date(now+120000).toISOString()};

test('paper exit requires the exact still-open contract and a reconciled position',()=>{
 const x=assessPaperExitQuote(position,market,now);
 assert.equal(x.eligible,true);
 assert.equal(x.bid,60);
 assert.equal(x.ask,62);
 assert.equal(x.secondsLeft,120);
 assert.ok(x.roi>0);
 for(const [p,m] of [
  [position,{...market,ticker:'OTHER'}],
  [position,{...market,status:'finalized'}],
  [position,{...market,expected_expiration_time:new Date(now).toISOString()}],
  [position,{...market,expected_expiration_time:'invalid'}],
  [{...position,status:'CLOSED'},market],
  [{...position,side:'unknown'},market],
  [{...position,qty:0},market],
  [{...position,cost:2},market],
  [{...position,ask:0},market]
 ]){
  assert.equal(assessPaperExitQuote(p,m,now).eligible,false);
 }
 assert.equal(assessPaperExitQuote(position,market,now+120001).eligible,false);
});

test('paper exit rejects missing, crossed, nonpositive and wide executable quotes',()=>{
 for(const m of [
  {...market,yes_bid_dollars:null,yes_bid:null},
  {...market,yes_bid_dollars:'0'},
  {...market,yes_bid_dollars:'0.65'},
  {...market,yes_ask_dollars:'0.70'},
  {...market,yes_ask_dollars:'1.00'},
  {...market,yes_ask_dollars:'NaN'}
 ])assert.equal(assessPaperExitQuote(position,m,now).eligible,false);
 const down=assessPaperExitQuote({...position,side:'down'},market,now);
 assert.equal(down.eligible,true);
 assert.equal(down.bid,38);
});

test('scheduled KaiBot paper exits are guarded by the conservative quote validator',()=>{
 const source=readFileSync(new URL('../netlify/functions/kaibot-runner.mjs',import.meta.url),'utf8');
 assert.match(source,/import\s*\{assessPaperExitQuote\}\s*from\s*['"]\.\.\/\.\.\/src\/paper-exit-quote\.mjs['"]/);
 assert.match(source,/assessPaperExitQuote\(t,m,now\)/);
 assert.match(source,/if\(!exitQuote\.eligible\)continue/);
});

test('paper exits reject coercible malformed quote representations',()=>{
 for(const bad of ['', ' ', '0x0', '0x3c', '6e-1', '0.60 ', true, false, [], {}]){
  assert.equal(assessPaperExitQuote(position,{...market,yes_bid_dollars:bad},now).eligible,false,
   'invalid bid: '+String(bad));
  assert.equal(assessPaperExitQuote(position,{...market,yes_ask_dollars:bad},now).eligible,false,
   'invalid ask: '+String(bad));
 }
 assert.equal(assessPaperExitQuote(position,{...market,yes_bid_dollars:0.60},now).eligible,true);
 assert.equal(assessPaperExitQuote(position,{...market,yes_bid_dollars:null,yes_bid:'60'},now).eligible,true);
});
