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
test('missing rotating asset uses a valid next asset without forcing a paper entry',async()=>{
 const assets=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
 const fallback=assets[(assets.indexOf(asset)+1)%assets.length];
 const alternate={...sample,asset:fallback,ticker:'KXFALLBACK15M-TEST'};
 const data=new Map([['latest/'+fallback,alternate]]);
 const db={get:async key=>data.get(key)??null,setJSON:async(key,value)=>data.set(key,value)};
 const report=await runOmegaScheduled({nowMs:now,db,env:{},fetchImpl:async()=>{throw Error('No provider or quote request expected')}});
 assert.equal(report.asset,fallback);
 assert.equal(report.status,'PROVIDERS_UNCONFIGURED');
 assert.equal(report.observationGate,'COLLECTOR_SAMPLE_VALID');
 assert.equal([...data.keys()].some(key=>key.startsWith('omega/predictions/')),false);
 assert.equal(report.ordersAuthorized,false);
});

test('fallback still requires independent live quote and freezes only one prospective market',async()=>{
 const assets=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
 const first=assets[(assets.indexOf(asset)+1)%assets.length];
 const second=assets[(assets.indexOf(asset)+2)%assets.length];
 const alternate={...sample,asset:first,ticker:'KXFALLBACK15M-TEST'};
 const later={...sample,asset:second,ticker:'KXSECOND15M-TEST'};
 const data=new Map([['latest/'+first,alternate],['latest/'+second,later]]);
 const db={get:async key=>data.get(key)??null,setJSON:async(key,value,opts={})=>{
  if(opts.onlyIfNew&&data.has(key))return;data.set(key,value);
 }};
 let providerCalls=0,marketCalls=0;
 const report=await runOmegaScheduled({nowMs:now,db,env:{OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'},
  fetchImpl:async url=>{
   if(url.includes('/markets/')){marketCalls++;return {ok:true,json:async()=>({market:{
    ticker:alternate.ticker,status:'active',yes_bid:45,yes_ask:50,no_bid:50,no_ask:55
   }})};}
   providerCalls++;return {ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.6}'}}]})};
  }});
 assert.equal(report.asset,first);
 assert.equal(report.status,'SHADOW_RESEARCH');
 assert.equal(report.observationGate,'INDEPENDENT_QUOTE_VERIFIED');
 assert.equal(providerCalls,2);
 assert.ok(marketCalls>=1);
 assert.equal([...data.keys()].filter(key=>key.startsWith('omega/predictions/')).length,1);
 assert.equal([...data.keys()].some(key=>key.includes(later.ticker)),false);
 assert.equal(report.ordersAuthorized,false);
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

test('provider circuit opens on quota exhaustion and probes again after cooldown',async()=>{
 const data=new Map([['latest/'+asset,sample]]);
 const db={get:async key=>data.get(key)||null,setJSON:async(key,value)=>data.set(key,value)};
 const env={OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'};
 let gptCalls=0;
 const fetchImpl=async url=>{
  if(url.includes('/markets/'))return {ok:true,json:async()=>({market:{ticker:sample.ticker,status:'active',yes_bid:45,yes_ask:50,no_bid:50,no_ask:55}})};
  if(url.includes('openai')&&++gptCalls===1)return {ok:false,status:429,json:async()=>({error:{type:'insufficient_quota'}})};
  return {ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.6}'}}]})};
 };
 const initial=await runOmegaScheduled({nowMs:now,db,env,fetchImpl});
 assert.equal(initial.providerStatus.find(x=>x.provider==='gpt').retryAtMs,now+900000);
 const rotated=await runOmegaScheduled({nowMs:now,db,env,fetchImpl});
 assert.equal(gptCalls,1);
 assert.equal(rotated.status,'INSUFFICIENT_DATA');
 assert.equal([...data.keys()].some(key=>key.startsWith('omega/predictions/')),false);
 const later=now+16*60000;
 data.set('latest/'+asset,{...sample,observedAt:later,expiresAt:later+500000});
 const recovered=await runOmegaScheduled({nowMs:later,db,env,fetchImpl});
 assert.equal(gptCalls,2);
 assert.equal(recovered.status,'SHADOW_RESEARCH');
 assert.equal(recovered.providerStatus.find(x=>x.provider==='gpt').retryAtMs,undefined);
});


function durableForecastTestStore({existing=null,dropForecastWrites=false}={}){
 const key='omega/predictions/v1/'+sample.ticker+'/'+Math.floor(now/60000);
 const values=new Map([['latest/'+asset,sample],...(existing?[[key,existing]]:[])]);
 return {key,values,
  async get(k){return values.get(k)||null;},
  async setJSON(k,v,opts={}){
   if(k.startsWith('omega/predictions/')&&dropForecastWrites)return;
   if(opts.onlyIfNew&&values.has(k))return;
   values.set(k,v);
  }
 };
}
const confidentForecastFetch=async url=>({
 ok:true,
 json:async()=>url.includes('/markets/')?
  {market:{ticker:sample.ticker,status:'active',yes_bid:45,yes_ask:50,no_bid:50,no_ask:55}}:
  {choices:[{message:{content:'{"upProbability":0.95}'}}]}
});
const configuredResearch={OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'};

test('OMEGA never simulates entry when the prospective forecast write is not durable',async()=>{
 const db=durableForecastTestStore({dropForecastWrites:true});
 const report=await runOmegaScheduled({nowMs:now,db,env:configuredResearch,fetchImpl:confidentForecastFetch});
 assert.equal(report.status,'SHADOW_RESEARCH');
 assert.equal(report.paperStatus,'FORECAST_NOT_NEWLY_PERSISTED');
 assert.equal(db.values.has(db.key),false);
 assert.equal(db.values.has('omega/paper/v1/'+sample.ticker),false);
 assert.equal(report.ordersAuthorized,false);
});

test('a previously frozen same-minute forecast cannot authorize another paper decision',async()=>{
 const original={freezeId:'older-run',ticker:sample.ticker,recordedAtMs:now-1000,status:'SHADOW_RESEARCH'};
 const db=durableForecastTestStore({existing:original});
 const report=await runOmegaScheduled({nowMs:now,db,env:configuredResearch,fetchImpl:confidentForecastFetch});
 assert.equal(report.status,'SHADOW_RESEARCH');
 assert.equal(report.paperStatus,'FORECAST_NOT_NEWLY_PERSISTED');
 assert.deepEqual(db.values.get(db.key),original);
 assert.equal(db.values.has('omega/paper/v1/'+sample.ticker),false);
});

test('a newly frozen, read-back verified forecast can still open paper-only entry',async()=>{
 const db=durableForecastTestStore();
 const report=await runOmegaScheduled({nowMs:now,db,env:configuredResearch,fetchImpl:confidentForecastFetch});
 assert.equal(report.status,'SHADOW_RESEARCH');
 assert.equal(report.paperStatus,'PAPER_ENTRY');
 assert.equal(db.values.get(db.key).freezeId.length>0,true);
 assert.equal(db.values.get(db.key).expiresAtMs,sample.expiresAt);
 assert.ok(db.values.get(db.key).recordedAtMs<db.values.get(db.key).expiresAtMs);
 assert.equal(db.values.get('omega/paper/v1/'+sample.ticker).state.positions[sample.ticker].status,'OPEN');
 assert.equal(db.values.get('omega/paper/latest').realOrdersAuthorized,false);
});

test('malformed previous provider heartbeat cannot interrupt paper position monitoring',async()=>{
 const ticker=sample.ticker;
 for(const providerStatus of [{invalid:'object'},[null,{status:'FAILED'},42]]){
  const state={positions:{[ticker]:{status:'OPEN',roundId:ticker,side:'YES',entryCostDollars:2.25}},entered:{}};
  const data=new Map([
   ['latest/'+asset,sample],
   ['omega/heartbeat',{providerStatus}],
   ['omega/paper/v1/'+ticker,{state}]
  ]);
  const db={get:async key=>data.get(key)??null,setJSON:async(key,value)=>data.set(key,value)};
  let quoteRequests=0;
  const report=await runOmegaScheduled({nowMs:now,db,env:{},fetchImpl:async()=>{
   quoteRequests++;return {ok:false};
  }});
  assert.equal(report.status,'PROVIDERS_UNCONFIGURED');
  assert.equal(report.paperMonitoring.open,1);
  assert.equal(report.paperMonitoring.unpriced,1);
  assert.equal(quoteRequests,1);
  assert.deepEqual(report.providerStatus,[]);
  assert.equal(data.get('omega/paper/v1/'+ticker).state.positions[ticker].status,'OPEN');
  assert.equal(data.get('omega/heartbeat').ordersAuthorized,false);
 }
});

test('expired during live quote retrieval: skip providers and archive no forecast',async()=>{
 const expired={...sample,expiresAt:now+500};
 const data=new Map([['latest/'+asset,expired]]);
 const db={get:async k=>data.get(k)??null,setJSON:async(k,v)=>data.set(k,v)};
 let marketCalls=0,providerCalls=0;
 const report=await runOmegaScheduled({nowMs:now,db,
  env:{OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'},clock:()=>now+600,
  fetchImpl:async url=>{
   if(url.includes('/markets/')){
    marketCalls++;
    return {ok:true,json:async()=>({market:{ticker:expired.ticker,status:'active',
     yes_bid:45,yes_ask:50,no_bid:50,no_ask:55}})};
   }
   providerCalls++;
   throw Error('Expired market must not call an AI provider');
  }});
 assert.equal(report.status,'NO_FRESH_MARKET_OBSERVATION');
 assert.equal(marketCalls,1);
 assert.equal(providerCalls,0);
 assert.equal([...data.keys()].some(k=>k.startsWith('omega/predictions/')),false);
 assert.equal(report.ordersAuthorized,false);
});

test('live quote receipt time remains prospective during provider research',async()=>{
 const data=new Map([['latest/'+asset,sample]]);
 const db={get:async k=>data.get(k)??null,setJSON:async(k,v)=>data.set(k,v)};
 const receiptAt=now+1000;
 const report=await runOmegaScheduled({nowMs:now,db,clock:()=>receiptAt,
  env:{OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'},
  fetchImpl:async url=>({ok:true,json:async()=>url.includes('/markets/')?
   {market:{ticker:sample.ticker,status:'active',yes_bid:45,yes_ask:50,no_bid:50,no_ask:55}}:
   {choices:[{message:{content:'{"upProbability":0.6}'}}]}})});
 assert.equal(report.status,'SHADOW_RESEARCH');
 assert.equal(report.observedAtMs,receiptAt);
 const forecast=[...data.entries()].find(([k])=>k.startsWith('omega/predictions/'))?.[1];
 assert.ok(forecast);
 assert.equal(forecast.recordedAtMs,receiptAt);
 assert.equal(forecast.observedAtMs,receiptAt);
 assert.equal(report.ordersAuthorized,false);
});

test('delayed Kalshi quote can exit paper using post-receipt decision time',async()=>{
 const ticker='KXBTC15M-DELAYED',receivedAt=now+1200,decisionAt=now+1350;
 const position={status:'OPEN',ticker,roundId:ticker,side:'UP',quantity:2,
  entryCostDollars:.5,openedAtMs:now-60000};
 const db=indexedPaperStore([
  ['latest/'+asset,sample],
  ['omega/paper/v1/'+ticker,{state:{positions:{[ticker]:position},entered:{}}}],
  ['omega/paper/open/v1/'+ticker,{ticker,realOrdersAuthorized:false}]
 ]);
 let clockCalls=0;
 const report=await runOmegaScheduled({nowMs:now,db,env:{},
  clock:()=>++clockCalls===1?receivedAt:decisionAt,
  fetchImpl:async()=>({ok:true,json:async()=>({market:{
   ticker,status:'active',yes_bid_dollars:'0.90',yes_ask_dollars:'0.91',
   no_bid_dollars:'0.08',no_ask_dollars:'0.09'
  }})})
 });
 const closed=db.values.get('omega/paper/v1/'+ticker).state.positions[ticker];
 assert.equal(clockCalls,2);
 assert.equal(report.paperMonitoring.exits,1);
 assert.equal(report.paperMonitoring.unpriced,0);
 assert.equal(closed.status,'CLOSED');
 assert.equal(closed.closedAtMs,decisionAt);
 assert.equal(db.values.get('omega/paper/latest').updatedAtMs,decisionAt);
 assert.equal(db.values.get('omega/paper/latest').realOrdersAuthorized,false);
});


test('slow provider responses cannot freeze stale forecasts or open paper positions',async()=>{
 const data=new Map([['latest/'+asset,sample]]);
 const db={get:async k=>data.get(k)??null,setJSON:async(k,v)=>data.set(k,v)};
 let clockCalls=0,providerCalls=0;
 // First quote receipt, observation and provider request are timely.
 // The provider response returns after the 15-second freshness budget.
 const clock=()=>++clockCalls<=3?now:now+20000;
 const report=await runOmegaScheduled({nowMs:now,db,clock,
  env:{OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'},
  fetchImpl:async url=>{
   if(url.includes('/markets/'))return {ok:true,json:async()=>({market:{
    ticker:sample.ticker,status:'active',yes_bid:45,yes_ask:50,no_bid:50,no_ask:55
   }})};
   providerCalls++;
   return {ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.95}'}}]})};
  }});
 assert.equal(providerCalls,2);
 assert.equal(report.status,'STALE_PROVIDER_RESEARCH');
 assert.equal(report.paperStatus,'FORECAST_STALE_BEFORE_FREEZE');
 assert.equal([...data.keys()].some(k=>k.startsWith('omega/predictions/')),false);
 assert.equal([...data.keys()].some(k=>k.startsWith('omega/paper/v1/')),false);
 assert.equal(data.get('omega/heartbeat').ordersAuthorized,false);
});


test('unreadable indexed OMEGA paper ledger retains its marker for later exit recovery',async()=>{
 const ticker='KXBTC15M-RETRY',marker='omega/paper/open/v1/'+ticker;
 const db=indexedPaperStore([
  ['latest/'+asset,sample],
  [marker,{ticker,realOrdersAuthorized:false}]
 ]);
 let quoteRequests=0;
 const fetchImpl=async()=>{
  quoteRequests++;
  return {ok:true,json:async()=>({market:{ticker,status:'active',
   yes_bid_dollars:'0.90',yes_ask_dollars:'0.91',no_bid_dollars:'0.08',no_ask_dollars:'0.09'}})};
 };
 const first=await runOmegaScheduled({nowMs:now,db,env:{},fetchImpl});
 assert.equal(first.paperMonitoring.open,0);
 assert.equal(first.paperMonitoring.unpriced,1);
 assert.equal(quoteRequests,0);
 assert.equal(db.values.has(marker),true,'missing ledger must not erase open marker');
 db.values.set('omega/paper/v1/'+ticker,olderPaperPosition(ticker));
 const second=await runOmegaScheduled({nowMs:now+60000,db,env:{},fetchImpl});
 assert.equal(second.paperMonitoring.open,1);
 assert.equal(second.paperMonitoring.exits,1);
 assert.equal(quoteRequests,1);
 assert.equal(db.values.get('omega/paper/v1/'+ticker).state.positions[ticker].status,'CLOSED');
 assert.equal(db.values.has(marker),false,'confirmed closed ledger may clear marker');
 assert.equal(second.ordersAuthorized,false);
});

test('OMEGA records the exact safe observation gate without bypassing quote checks',async()=>{
 const configured={OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'};
 const createDb=latest=>{
  const data=new Map(latest?[['latest/'+asset,latest]]:[]);
  return {data,db:{get:async k=>data.get(k)??null,setJSON:async(k,v)=>data.set(k,v)}};
 };
 const missing=createDb(null);
 const absent=await runOmegaScheduled({nowMs:now,db:missing.db,env:configured,fetchImpl:async()=>{throw Error('No request expected')}});
 assert.equal(absent.status,'NO_FRESH_MARKET_OBSERVATION');
 assert.equal(absent.observationGate,'COLLECTOR_SAMPLE_UNAVAILABLE');
 const unavailable=createDb(sample);
 const failed=await runOmegaScheduled({nowMs:now,db:unavailable.db,env:configured,fetchImpl:async()=>({ok:false})});
 assert.equal(failed.status,'NO_FRESH_MARKET_OBSERVATION');
 assert.equal(failed.observationGate,'INDEPENDENT_QUOTE_UNAVAILABLE');
 assert.equal(unavailable.data.get('omega/heartbeat').observationGate,'INDEPENDENT_QUOTE_UNAVAILABLE');
 assert.equal([...unavailable.data.keys()].some(k=>k.startsWith('omega/predictions/')),false);
 const good=createDb(sample);
 const verified=await runOmegaScheduled({nowMs:now,db:good.db,env:configured,fetchImpl:confidentForecastFetch});
 assert.equal(verified.observationGate,'INDEPENDENT_QUOTE_VERIFIED');
 assert.equal(verified.ordersAuthorized,false);
});
