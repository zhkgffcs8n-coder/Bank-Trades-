import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateScalperV8,parseDepthV8,scoreScalperV8,summarizeScalperV8} from '../src/scalper-v8.mjs';
import {SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';

const ticker='KXBTC15M-TEST',at=600000;
const quote={ticker,observedAt:at,expiresAt:at+300000,yesBid:.59,yesAsk:.61,noBid:.39,noAsk:.41};
const prior=[
 {ticker,t:at-120000,observedAt:at-120000,yesMid:.48},
 {ticker,t:at-60000,observedAt:at-60000,yesMid:.51}
];

test('V8 rejects mixed rounds and future samples and freezes independent forecasts',()=>{
 const invalid=[{...prior[0],ticker:'OTHER'},{...prior[1],observedAt:at+1}];
 assert.equal(evaluateScalperV8(quote,invalid),null);
 const row=evaluateScalperV8(quote,prior);
 assert.equal(row.mode,'SHADOW_ONLY');
 assert.equal(row.radar,'UP LOCK WATCH');
 assert.ok(row.engines.A.probability>row.engines.Market.probability);
 assert.equal(row.engines.Market.decision,'SKIP');
});

test('V8 depth requires matching quotes and rejects stale observations',()=>{
 const payload={orderbook_fp:{yes_dollars:[['.59','30']],no_dollars:[['.39','10']]}};
 const depth=parseDepthV8(payload,ticker,at+100,quote);
 assert.equal(depth.imbalance,.5);
 assert.equal(parseDepthV8(payload,ticker,at,{...quote,yesBid:.51}),null);
 assert.equal(evaluateScalperV8(quote,prior,depth).at,at+100);
 assert.equal(evaluateScalperV8(quote,prior,{...depth,at:at+6000}).imbalance,null);
});

test('V8 scores a frozen comparison only after verified settlement and reports modeled costs',()=>{
 const row=evaluateScalperV8(quote,prior);
 const label={ticker,result:'yes',verification:SETTLEMENT_VERIFICATION,labeledAt:quote.expiresAt};
 assert.equal(scoreScalperV8(row,{...label,verification:null},label.labeledAt),null);
 assert.equal(scoreScalperV8(row,label,label.labeledAt-1),null);
 const scored=scoreScalperV8(row,label,label.labeledAt);
 const report=summarizeScalperV8([scored]);
 assert.equal(report.A.wins,1);
 assert.equal(report.A.sampleSize,1);
 assert.equal(report.A.simulatedNetDollars,1-row.engines.A.ask-row.engines.A.cost);
 assert.equal(report.Market.simulatedNetDollars,0);
});

test('shared paper signals explain WAIT without relaxing entry protection',async()=>{
 const {paperSignal}=await import('../netlify/functions/lib/shared-paper-signals.mjs');
 const market={ticker,close_time:new Date(at+300000).toISOString(),yes_bid:54,yes_ask:61,no_bid:39,no_ask:46};
 assert.match(paperSignal(market,[],null,at).reason,/Spread exceeds 5¢/);
 const closing={...market,yes_bid:59,no_ask:41,close_time:new Date(at+60000).toISOString()};
 assert.equal(paperSignal(closing,[],null,at).action,'WAIT');
 assert.match(paperSignal(closing,[],null,at).reason,/Late entry blocked/);
});

test('exit replay waits for a subsequent liquid bid and retains settlement fallback',async()=>{
 const {replayScalperExits}=await import('../src/scalper-v8-exits.mjs');
 const row={ticker,at,expiresAt:at+300000,regime:'RANGE',engines:{
  A:{decision:'UP',won:true,ask:.6,cost:.03,net:.37},
  B:{decision:'DOWN',won:false,ask:.4,cost:.03,net:-.43}
 }};
 const quotes=[
  {ticker,at:at+1000,yes:{price:.8,size:10}},
  {ticker,at:at+2000,yes:{price:.75,size:.5}},
  {ticker:'OTHER',at:at+3000,yes:{price:.9,size:10}},
  {ticker,at:at+4000,yes:{price:.7,size:2}},
  {ticker,at:row.expiresAt,no:{price:.9,size:10}}
 ];
 const result=replayScalperExits(row,quotes);
 assert.equal(result.A.trigger,'TAKE PROFIT');
 assert.equal(result.A.at,at+4000);
 assert.equal(result.A.bid,.7);
 assert.equal(result.B.method,'SETTLEMENT_FALLBACK');
 assert.equal(result.B.net,-.43);
});

test('walk-forward calibration excludes labels received after the forecast',async()=>{
 const {walkForwardScalperCalibration}=await import('../src/scalper-v8-calibration.mjs');
 const engines=Object.fromEntries(['A','B','C','Market'].map(name=>[name,{probability:.55}]));
 const earlier=Array.from({length:10},(_,i)=>({at:i,resolvedAt:100+i,outcome:1,baseline:.5,engines}));
 const target={at:109,resolvedAt:200,outcome:1,baseline:.5,engines};
 assert.equal(walkForwardScalperCalibration([...earlier,target]).A.sampleSize,0);
 const report=walkForwardScalperCalibration([...earlier,{...target,at:110}]);
 assert.equal(report.A.sampleSize,1);
 assert.ok(report.A.calibratedBrier<report.A.rawBrier);
});
