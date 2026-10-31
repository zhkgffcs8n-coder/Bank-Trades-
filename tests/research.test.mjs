import test from 'node:test';
import assert from 'node:assert/strict';
import {initialModel,predict,learn} from '../src/research-model.mjs';
import legacy from '../netlify/functions/lib/legacy/data.cjs';
import {paperSignal} from '../netlify/functions/lib/shared-paper-signals.mjs';
import {buildCommitteeSnapshot,coordinateEngines} from '../src/engine-team.mjs';

test('untrained predictor equals baseline and only labeled examples update weights',()=>{
 const m=initialModel(),features=[1,.5,.1,.6];
 assert.ok(Math.abs(predict(m,.6,features)-.6)<1e-12);
 assert.throws(()=>learn(m,{features,prediction:.6,baseline:.6},null));
 const next=learn(m,{features,prediction:.6,baseline:.6},1);
 assert.equal(next.count,1);assert.ok(Math.abs(next.brier-.16)<1e-10);assert.equal(m.count,0);
 assert.ok(predict(next,.6,features)>.6);
 assert.throws(()=>predict(m,.6,[1,Infinity,0,0]));
});
test('prequential evaluation uses earlier stored prediction rather than fitted hindsight',()=>{
 const m={...initialModel(),weights:[1,1,1,1]};
 const next=learn(m,{features:[1,1,1,1],prediction:.2,baseline:.5},1);
 assert.ok(Math.abs(next.brier-.64)<1e-10);assert.ok(Math.abs(next.baselineBrier-.25)<1e-10);
});
test('outcome route rejects injection and does not label nonfinal, provisional, mismatched or missing payouts',async()=>{
 const oldFetch=globalThis.fetch;let calls=0;
 const ticker='KXBTC15M-26OCT300900-00';
 const call=t=>legacy.handler({httpMethod:'GET',queryStringParameters:{mode:'outcomes',tickers:t}});
 try{
  globalThis.fetch=async()=>{calls++;throw Error('must not fetch');};
  assert.equal((await call('https://attacker.test')).statusCode,400);assert.equal(calls,0);
  for(const patch of [{status:'determined'},{is_provisional:true},{settlement_value_dollars:null},{ticker:'wrong'},{result:'scalar'}]){
   globalThis.fetch=async()=>({ok:true,json:async()=>({market:{ticker,market_type:'binary',status:'finalized',settlement_ts:new Date().toISOString(),result:'yes',settlement_value_dollars:'1.0000',...patch}})});
   const d=JSON.parse((await call(ticker)).body);assert.equal(d.results[0].finalized,false);
  }
  globalThis.fetch=async()=>({ok:true,json:async()=>({market:{ticker,market_type:'binary',status:'finalized',settlement_ts:new Date().toISOString(),result:'yes',settlement_value_dollars:'1.0000'}})});
  const d=JSON.parse((await call(ticker)).body);assert.equal(d.results[0].result,'yes');assert.equal(d.results[0].finalized,true);
 }finally{globalThis.fetch=oldFetch;}
});
test('moving legacy handler preserves live markets and candle routing',async()=>{
 const oldFetch=globalThis.fetch;
 try{
  globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/candlesticks')?{candlesticks:[]}:{markets:[]}});
  const markets=await legacy.handler({httpMethod:'GET',queryStringParameters:{mode:'markets'}});assert.equal(markets.statusCode,200);assert.equal(JSON.parse(markets.body).results.length,8);assert.ok(JSON.parse(markets.body).results.every(r=>r.available));
  const candles=await legacy.handler({httpMethod:'GET',queryStringParameters:{mode:'candles',asset:'BTC',ticker:'KXBTC15M-26OCT300900-00'}});assert.equal(candles.statusCode,200);
 }finally{globalThis.fetch=oldFetch;}
});

test('paper momentum requires recent scheduled observations before any BUY',()=>{
 const now=Date.parse('2026-10-31T09:45:00Z');
 const market={ticker:'KXBTC15M-TEST',yes_bid_dollars:'0.48',yes_ask_dollars:'0.50',no_bid_dollars:'0.50',no_ask_dollars:'0.52',expected_expiration_time:new Date(now+5*60000).toISOString()};
 const fresh=[{ticker:market.ticker,t:now-90000,yesMid:.40},{ticker:market.ticker,t:now-30000,yesMid:.48}];
 const valid=paperSignal(market,fresh,null,now);
 assert.equal(valid.action,'BUY UP');
 const stale=fresh.map(x=>({...x,t:x.t-180000}));
 const blocked=paperSignal(market,stale,null,now);
 assert.equal(blocked.action,'WAIT');
 assert.match(blocked.reason,/Stale momentum history/);
});


test('shadow committee requires fresh same-contract features and normalized executable ask',()=>{
 const now=Date.parse('2026-10-31T10:00:00Z');
 const market={ticker:'KXBTC15M-TEST',yes_bid_dollars:'0.48',yes_ask_dollars:'0.50',no_bid_dollars:'0.50',no_ask_dollars:'0.52',expected_expiration_time:new Date(now+5*60000).toISOString()};
 const records=[{ticker:market.ticker,t:now-90000,yesMid:.40},{ticker:market.ticker,t:now-30000,yesMid:.48}];
 const good=buildCommitteeSnapshot(market,records,now);
 assert.equal(good.status,'READY');
 assert.equal(good.ask,.5);
 assert.equal(good.features.length,4);
 assert.ok(good.features.every(Number.isFinite));
 assert.equal(good.sampleCount,2);
 const report=coordinateEngines(good);
 assert.equal(report.status,'SHADOW_ONLY');
 assert.equal(report.votes.length,7);
 assert.equal(report.execution.authorized,false);
 assert.equal(report.champion.promoted,false);
 const cents=buildCommitteeSnapshot({ticker:market.ticker,yes_bid:48,yes_ask:50,no_bid:50,no_ask:52,expected_expiration_time:market.expected_expiration_time},records,now);
 assert.equal(cents.status,'READY');
 assert.equal(cents.ask,.5);
 const stale=buildCommitteeSnapshot(market,records.map(x=>({...x,t:x.t-180000})),now);
 assert.equal(stale.status,'MISSING_INPUT');
 assert.ok(stale.missing.some(x=>x.includes('fresh')));
 const wrongTicker=buildCommitteeSnapshot(market,records.map(x=>({...x,ticker:'OTHER'})),now);
 assert.equal(wrongTicker.status,'MISSING_INPUT');
 assert.ok(wrongTicker.missing.some(x=>x.includes('same-contract')));
 const invalidQuote=buildCommitteeSnapshot({...market,yes_ask_dollars:'NaN'},records,now);
 assert.equal(invalidQuote.status,'MISSING_INPUT');
 assert.ok(invalidQuote.missing.some(x=>x.includes('bid/ask')));
});
