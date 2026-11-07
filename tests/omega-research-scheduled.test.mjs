import test from 'node:test';
import assert from 'node:assert/strict';
import {selectOmegaObservation,runOmegaScheduled} from '../netlify/functions/omega-research-scheduled.mjs';
const now=Date.parse('2026-11-05T12:00:00Z');
const asset=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'][Math.floor(now/60000)%8];
const sample={asset,ticker:'KXBTC15M-TEST',observedAt:now-1000,expiresAt:now+500000,yesBid:.45,yesAsk:.5,noBid:.5,noAsk:.55};
test('fresh collector sample becomes a matched research observation',()=>{
 const r=selectOmegaObservation({latest:sample,nowMs:now,asset});
 assert.equal(r.marketBaseline.upProbability,.475);assert.equal(r.roundId,sample.ticker);
 assert.equal(selectOmegaObservation({latest:{...sample,observedAt:now-180000},nowMs:now,asset}),null);
});
test('OMEGA rejects crossed, zero-ask and missing quotes before model research',()=>{
 for(const bad of [{yesBid:.7,yesAsk:.5},{noBid:.7,noAsk:.55},{yesAsk:0},{noAsk:1},{yesBid:NaN},{noAsk:undefined}]){
  assert.equal(selectOmegaObservation({latest:{...sample,...bad},nowMs:now,asset}),null,JSON.stringify(bad));
 }
 assert.ok(selectOmegaObservation({latest:{...sample,yesBid:0,noBid:0},nowMs:now,asset}));
});
test('unconfigured providers do not create invented predictions',async()=>{
 const data=new Map([['latest/'+asset,sample]]);
 const db={get:async key=>data.get(key)||null,setJSON:async(key,value)=>{data.set(key,value)}};
 const r=await runOmegaScheduled({nowMs:now,db,env:{}});
 assert.equal(r.status,'PROVIDERS_UNCONFIGURED');
 assert.equal(data.get('omega/heartbeat').ordersAuthorized,false);
 assert.equal([...data.keys()].some(x=>x.startsWith('omega/predictions/')),false);
});
test('configured providers produce stored pre-settlement shadow research',async()=>{
 const data=new Map([['latest/'+asset,sample]]);
 const db={get:async key=>data.get(key)||null,setJSON:async(key,value)=>{data.set(key,value)}};
 const r=await runOmegaScheduled({nowMs:now,db,env:{OPENAI_API_KEY:'a',DEEPSEEK_API_KEY:'b'},
 fetchImpl:async url=>({ok:true,json:async()=>url.includes('/markets/')?{market:{ticker:sample.ticker,status:'active',yes_bid:45,yes_ask:50,no_bid:50,no_ask:55}}:{choices:[{message:{content:'{"upProbability":0.6}'}}]}})});
 assert.equal(r.status,'SHADOW_RESEARCH');
 assert.equal([...data.keys()].some(x=>x.startsWith('omega/predictions/')),true);
 assert.equal(r.ordersAuthorized,false);
});

test('open paper positions are monitored without configured AI providers',async()=>{
 const ticker=sample.ticker;
 const state={positions:{[ticker]:{status:'OPEN',roundId:ticker,side:'YES',entryCostDollars:2.25}},entered:{}};
 const data=new Map([['latest/'+asset,sample],['omega/paper/v1/'+ticker,{state}]]);
 const db={get:async key=>data.get(key)||null,setJSON:async(key,value)=>data.set(key,value)};
 let quoteRequests=0;
 const fetchImpl=async()=>{quoteRequests++;return {ok:false};};
 const report=await runOmegaScheduled({nowMs:now,db,env:{},fetchImpl});
 assert.equal(report.status,'PROVIDERS_UNCONFIGURED');
 assert.equal(report.paperMonitoring.open,1);
 assert.equal(report.paperMonitoring.unpriced,1);
 assert.equal(quoteRequests,1);
 assert.equal(data.get('omega/paper/v1/'+ticker).state.positions[ticker].status,'OPEN');
 assert.equal(data.get('omega/heartbeat').paperMonitoring.open,1);
 assert.equal([...data.keys()].some(k=>k.startsWith('omega/predictions/')),false);
});

test('minute-old collector baseline is refreshed before provider comparison',async()=>{
 const data=new Map([['latest/'+asset,{...sample,observedAt:now-60000}]]);
 const db={get:async k=>data.get(k)||null,setJSON:async(k,v)=>data.set(k,v)};
 let providerCalls=0;
 const report=await runOmegaScheduled({nowMs:now,db,env:{OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'},fetchImpl:async url=>{
  if(url.includes('/markets/'))return {ok:true,json:async()=>({market:{ticker:sample.ticker,status:'active',yes_bid:48,yes_ask:50,no_bid:50,no_ask:52}})};
  providerCalls++;return {ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.6}'}}]})};
 }});
 assert.equal(report.status,'SHADOW_RESEARCH');assert.equal(report.baseline,.49);assert.equal(report.observedAtMs,now);assert.equal(providerCalls,2);
});
test('failed fresh market read skips provider spending and never relabels stale data',async()=>{
 const data=new Map([['latest/'+asset,{...sample,observedAt:now-60000}]]);
 const db={get:async k=>data.get(k)||null,setJSON:async(k,v)=>data.set(k,v)};
 let calls=0;const report=await runOmegaScheduled({nowMs:now,db,env:{OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'},fetchImpl:async url=>{assert.ok(url.includes('/markets/'));calls++;return {ok:false};}});
 assert.equal(report.status,'NO_FRESH_MARKET_OBSERVATION');assert.equal(calls,1);assert.equal([...data.keys()].some(k=>k.startsWith('omega/predictions/')),false);
});
test('provider failures retain safe HTTP diagnostics without response body or credentials',async()=>{
 const data=new Map([['latest/'+asset,sample]]),db={get:async k=>data.get(k)||null,setJSON:async(k,v)=>data.set(k,v)};
 const report=await runOmegaScheduled({nowMs:now,db,env:{OPENAI_API_KEY:'secret-a',DEEPSEEK_API_KEY:'secret-b'},fetchImpl:async url=>url.includes('/markets/')?{ok:true,json:async()=>({market:{ticker:sample.ticker,status:'active',yes_bid:45,yes_ask:50,no_bid:50,no_ask:55}})}:{ok:false,status:401,json:async()=>({secret:'must not read'})}});
 assert.equal(report.status,'INSUFFICIENT_DATA');assert.ok(report.reasons.length);assert.equal(report.providerStatus[0].httpStatus,401);assert.equal(JSON.stringify(report).includes('secret-'),false);
});

function indexedPaperStore(entries){
 const values=new Map(entries);
 return {
  values,
  async get(key){return values.get(key)??null},
  async setJSON(key,value){values.set(key,value)},
  async delete(key){values.delete(key)},
  async *list({prefix,paginate}){
   assert.equal(paginate,true);
   yield {blobs:[...values.keys()].filter(key=>key.startsWith(prefix)).sort().map(key=>({key}))};
  }
 };
}
function olderPaperPosition(ticker){
 return {state:{positions:{[ticker]:{status:'OPEN',ticker,roundId:ticker,side:'UP',quantity:2,entryCostDollars:.5}},entered:{}}};
}
test('an indexed older-round position is exited even when collector latest rotated',async()=>{
 const ticker='KXBTC15M-OLDER';
 const db=indexedPaperStore([
  ['latest/'+asset,sample],
  ['omega/paper/v1/'+ticker,olderPaperPosition(ticker)],
  ['omega/paper/open/v1/'+ticker,{ticker,realOrdersAuthorized:false}]
 ]);
 const requested=[];
 const report=await runOmegaScheduled({nowMs:now,db,env:{},fetchImpl:async url=>{
  requested.push(url);
  return {ok:true,json:async()=>({market:{ticker,status:'active',yes_bid_dollars:'0.90',yes_ask_dollars:'0.91',no_bid_dollars:'0.08',no_ask_dollars:'0.09'}})};
 }});
 assert.equal(report.status,'PROVIDERS_UNCONFIGURED');
 assert.equal(report.paperMonitoring.open,1);
 assert.equal(report.paperMonitoring.exits,1);
 assert.equal(db.values.get('omega/paper/v1/'+ticker).state.positions[ticker].status,'CLOSED');
 assert.equal(db.values.has('omega/paper/open/v1/'+ticker),false);
 assert.equal(db.values.get('omega/paper/latest').realOrdersAuthorized,false);
 assert.equal(requested.length,1);
 assert.ok(requested[0].includes(ticker));
});
test('legacy older-round positions are backfilled without a duplicate entry',async()=>{
 const ticker='KXBTC15M-LEGACY';
 const db=indexedPaperStore([['latest/'+asset,sample],['omega/paper/v1/'+ticker,olderPaperPosition(ticker)]]);
 const report=await runOmegaScheduled({nowMs:now,db,env:{},fetchImpl:async()=>({
  ok:true,json:async()=>({market:{ticker,status:'active',yes_bid_dollars:'0.50',yes_ask_dollars:'0.60',no_bid_dollars:'0.40',no_ask_dollars:'0.50'}})
 })});
 assert.equal(report.paperMonitoring.backfilled,1);
 assert.equal(report.paperMonitoring.open,1);
 assert.equal(report.paperMonitoring.holds,1);
 assert.equal(db.values.get('omega/paper/v1/'+ticker).state.positions[ticker].status,'OPEN');
 assert.equal(db.values.get('omega/paper/open/v1/'+ticker).realOrdersAuthorized,false);
 assert.equal([...db.values.keys()].filter(k=>k==='omega/paper/v1/'+ticker).length,1);
});
