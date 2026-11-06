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
 fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.6}'}}]})})});
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

test('scheduled heartbeat includes all three research engine statuses without live authorization',async()=>{
 const data=new Map([['latest/'+asset,sample]]);
 const db={get:async key=>data.get(key)||null,setJSON:async(key,value)=>{data.set(key,value)}};
 const report=await runOmegaScheduled({nowMs:now,db,env:{}});
 assert.equal(report.sharedEngineReview.ticker,sample.ticker);
 assert.equal(typeof report.sharedEngineReview.spiderStatus,'string');
 assert.equal(typeof report.sharedEngineReview.primalStatus,'string');
 assert.equal(report.sharedEngineReview.omegaStatus,'PROVIDERS_UNCONFIGURED');
 assert.equal(report.sharedEngineReview.ordersAuthorized,false);
 assert.equal(data.get('omega/heartbeat').realOrdersAuthorized,false);
});
