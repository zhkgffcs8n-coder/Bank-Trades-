import test from 'node:test';
import assert from 'node:assert/strict';
import {initialModel,predict,learn} from '../src/research-model.mjs';
import legacy from '../netlify/functions/lib/legacy/data.cjs';

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
