import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const listener=source.slice(source.indexOf('// Each coin quote is delivered'),source.indexOf('const state=box.querySelector'));
test('BTC exit checks use fresh exact-ticker depth and ignore newer listing quotes',async()=>{
 let receive,onEvidence;const calls=[],quotes=new Map();
 let now=100000;
 const ticker='KXBTC15M-TEST';
 const positions=new Map([['BTC',{ticker,expiresAt:now+60000}]]);
 const book=source.slice(source.indexOf('function bestBid('),source.indexOf('// One-contract research estimate.'));
 const refresh=runInNewContext(book+'\n'+listener+'\nrefreshBtcScalpBook',{
  window:{addEventListener:(name,fn)=>{if(name==='banktrades:kalshi-quote')receive=fn;if(name==='banktrades:shared-signals')onEvidence=fn;}},
  Date:class extends Date {static now(){return now;}},Number,scalpQuotes:quotes,positions,selectedCoin:'BTC',
  document:{hidden:false},AbortSignal,btcScalpBookMaxAge:1800,btcEntryQuoteMaxAge:1000,btcScalpBookPending:false,latestBtcStreamQuote:null,btcEntryMarket:null,
  async fetch(url){
   assert.equal(url,'/api/data?mode=orderbook&live=1&ticker='+ticker);
   return {ok:true,json:async()=>({fetched_at:new Date(now).toISOString(),orderbook:{orderbook_fp:{
    yes_dollars:[['0.7125','0.50']],no_dollars:[['0.2775','2.00']]
   }}})};
  },
  price:(m,k)=>Number((Number(m[k+'_dollars'])*100).toFixed(2)),scalp:(...args)=>calls.push(args),
  scalpExitEvidence:()=>null,setInterval(){},rememberBtcEntryMarket(){},evaluateBtcEntry(){}
 });
 const row={asset:'BTC',available:true,quote_received_at:new Date(now-100).toISOString(),
  market:{ticker,close_time:new Date(now+60000).toISOString(),yes_bid_dollars:'0.60',no_bid_dollars:'0.38'}};
 const first=receive({detail:row});
 assert.equal(calls.length,0,'listing alone cannot drive a BTC exit');
 await first;
 assert.equal(calls.length,1);
 assert.equal(calls[0][4].up.bid,71.25);
 assert.equal(calls[0][4].up.ask,72.25);
 assert.equal(calls[0][4].down.bid,27.75);
 now+=1;
 await receive({detail:{...row,quote_received_at:new Date(now).toISOString()}});
 await refresh();
 assert.equal(quotes.get('BTC').up,71.25,'newer listings cannot replace depth');
 now+=1;
 quotes.set('BTC',{ticker:'KXBTC15M-NEXT',at:now+1});
 await refresh();
 assert.equal(quotes.get('BTC').ticker,ticker,'an active call recovers depth without a matching listing snapshot');
 now+=1801;
 const checks=calls.length;
 onEvidence();
 assert.equal(calls.length,checks,'stale depth cannot authorize an evidence-triggered exit');
});
test('browser forwards same-millisecond stream bids in order and invalidates on interruption',()=>{
 const ticker='KXBTC15M-TEST';
 const calls=[],snapshots=new Map();
 const {apply,reset}=runInNewContext(listener+'\n({apply:applyBtcStreamQuote,reset:invalidateBtcStream})',{
  window:{addEventListener(){}},setInterval(){},Date,scalpQuotes:snapshots,
  selectedCoin:'BTC',positions:new Map([['BTC',{ticker}]]),
  btcScalpBookMaxAge:1800,latestBtcStreamQuote:null,btcEntryMarket:null,
  price:(market,key)=>Number(market[key+'_dollars'])*100,
  scalp:(_market,_left,_side,_strong,quotes)=>calls.push(quotes.up.bid),
  scalpExitEvidence:()=>null,showScalp(){}
 });
 const now=Date.now();
 const quote={ticker,receivedAt:now,expiresAt:now+60000,yesBid:80,noBid:19};
 assert.equal(apply({...quote,ticker:'KXBTC15M-WRONG'}),false);
 assert.equal(apply(quote),true);
 assert.equal(apply({...quote,yesBid:43,noBid:56}),true);
 assert.deepEqual(calls,[80,43]);
 assert.equal(snapshots.get('BTC').isStream,true);
 reset();
 assert.equal(snapshots.get('BTC').at,0);
 assert.equal(snapshots.get('BTC').isStream,false);
});
test('single asset endpoint does not wait for unrelated markets',async()=>{
 const previous=globalThis.fetch;let count=0;
 globalThis.fetch=async url=>{count++;assert.equal(new URL(url).searchParams.get('series_ticker'),'KXBTC15M');return {ok:true,json:async()=>({markets:[{ticker:'KXBTC15M-TEST',status:'active',close_time:new Date(Date.now()+60000).toISOString(),yes_ask_dollars:'0.7225'}]})};};
 try{
  const {handler}=require('../netlify/functions/lib/legacy/data.cjs');
  const result=JSON.parse((await handler({httpMethod:'GET',queryStringParameters:{mode:'markets',asset:'BTC',live:'1'}})).body);
  assert.equal(count,1);assert.equal(result.results.length,1);assert.equal(result.results[0].market.yes_ask_dollars,'0.7225');
  assert.ok(Date.now()-Date.parse(result.results[0].quote_received_at)<5000);
 }finally{globalThis.fetch=previous;}
});
test('silent quote stream reconnects automatically while REST refresh stays active',()=>{
 const lifecycle=source.slice(source.indexOf('let btcQuoteStream,lastBtcStreamActivity;'),source.indexOf('connectBtcQuoteStream();\nsetInterval'));
 const streams=[];
 let now=0,invalidations=0,refreshes=0;
 const {connect,maintain}=runInNewContext(lifecycle+'\n({connect:connectBtcQuoteStream,maintain:maintainBtcQuoteStream})',{
  EventSource:class {
   constructor(){this.handlers={};streams.push(this);}
   addEventListener(name,callback){this.handlers[name]=callback;}
   close(){this.closed=true;}
  },
  performance:{now:()=>now},Date,document:{hidden:false},
  invalidateBtcStream:()=>invalidations++,refreshBtcScalpBook:()=>refreshes++
 });
 connect();
 now=3999;maintain();
 assert.equal(streams.length,1);
 now=4000;maintain();
 assert.equal(streams.length,2);
 assert.equal(streams[0].closed,true);
 streams[0].handlers.error();
 assert.equal(invalidations,1,'events from a replaced connection are ignored');
 streams[1].handlers.error();
 assert.equal(invalidations,2);
 assert.equal(refreshes,3);
});

test('BTC BUY is readable before a fast cash-out without moving the recorded exit',()=>{
 let now=Date.now();
 const ticker='KXBTC15M-TEST',close=new Date(now+600000).toISOString();
 const market={ticker,close_time:close,expires_at:close,quote_received_at:new Date(now).toISOString(),
  floor_strike:95000,yes_ask:21,yes_bid:20,no_ask:80,no_bid:79};
 const feed={enabled:true,ticker:'KXBTC15M-PREVIOUS',status:'FRESH',direction:'DOWN',candleCloseAt:now-1000};
 const positions=new Map(),statuses=[],events=[],frames=[],cashouts=[],timers=[];
 const display=source.slice(source.indexOf('const scalpEntryVisibleUntil='),source.indexOf('function scalpQuoteStatus('));
 const strategy=source.slice(source.indexOf('function scalp(market'),source.indexOf('// Each coin quote is delivered'));
 const assess=source.slice(source.indexOf('function assess('),source.indexOf("waitForData('Checking '+selectedCoin+' market and spot feed');"));
 const price=source.match(/^const price=.*;$/m)[0];
 const {evaluate,scalp}=runInNewContext([price,display,strategy,assess,'({evaluate:assess,scalp})'].join('\n'),{
  Date:class extends Date {static now(){return now;}},
  selectedCoin:'BTC',positions,scalpQuotes:new Map(),latestScalpEvidence:new Map(),
  directions:new Map(),reversalReadings:new Map(),
  sharedV8:[{asset:'BTC',tradingView:feed}],scalpExitEvidence:()=>null,
  confirmedScalpReversal:()=>({confirmed:false,reading:null}),estimatedCost:()=>0.01,
  showScalp:status=>statuses.push(status),paintScalpPrices:(position,exit)=>cashouts.push(exit?position.exitBid:undefined),
  persistScalpPosition(){},setTimeout:(callback,delay)=>timers.push({callback,delay}),requestAnimationFrame:callback=>frames.push(callback),
  waitForData:status=>assert.fail(status),state:{},facts:{},
  refreshBtcScalpBook(){},refreshScalpExit:()=>{checkExit();return true;},window:{dispatchEvent:event=>events.push(event)},
  CustomEvent:class {constructor(type,{detail}){Object.assign(this,{type,detail});}}
 });
 let bid=87;
 const checkExit=()=>scalp(market,598,'mixed',false,{up:{ask:100-bid,bid:99-bid},down:{ask:bid+1,bid}});
 const options={feed,entryOnly:true};
 evaluate('BTC',market,undefined,true,options);
 assert.match(statuses.at(-1),/Awaiting fresh TradingView BTC 1s/);
 assert.equal(positions.size,0);
 feed.ticker=ticker;
 evaluate('BTC',market,undefined,true,options);
 assert.equal(positions.get('BTC').side,'down');
 assert.equal(positions.get('BTC').entry,80);
 assert.equal(positions.get('BTC').entryAt,now);
 assert.match(statuses.at(-1),/^BUY DOWN/);
 assert.deepEqual(events.map(event=>event.detail.stage),['entry']);
 now+=2000;
 checkExit();
 frames.shift()();
 checkExit();
 assert.match(statuses.at(-1),/^BUY DOWN/);
 assert.equal(cashouts.at(-1),undefined);
 frames.shift()();
 assert.equal(positions.get('BTC').exitBid,87);
 assert.equal(positions.get('BTC').exitAt,now);
 assert.deepEqual(events.map(event=>event.detail.stage),['entry','exit']);
 bid=89;
 now+=2999;
 checkExit();
 assert.match(statuses.at(-1),/^BUY DOWN/);
 assert.equal(cashouts.at(-1),undefined);
 now+=1;
 timers.find(timer=>timer.delay===3000).callback();
 assert.match(statuses.at(-1),/^TAKE PROFIT/);
 assert.equal(cashouts.at(-1),87);
 assert.deepEqual(events.map(event=>event.detail.stage),['entry','exit']);
});

test('BTC entry rejects the 45% listing and evaluates the fresh 62% ask immediately',()=>{
 const now=100000,ticker='KXBTC15M-TEST',close=now+420000;
 const market={ticker,close_time:new Date(close).toISOString(),quote_received_at:new Date(now-300).toISOString(),no_ask:45};
 const feed={ticker,enabled:true,status:'FRESH',candleCloseAt:now-1000,direction:'UP'};
 const depth={ticker,expiresAt:close,at:now-50,up:38,down:61,isOrderBook:true,market:{no_ask_dollars:'0.6200'}};
 const inputs=source.slice(source.indexOf('function btcDirectionFor('),source.indexOf('async function refreshBtcDirection('));
 const positions=new Map(),scalpQuotes=new Map(),calls=[];
 const context={
  selectedCoin:'BTC',document:{hidden:false},window:{},positions,btcEntryMarket:market,
  btcEntryDirection:feed,sharedV8:[],btcEntryQuoteMaxAge:1000,scalpQuotes,
  Date:class extends Date {static now(){return now;}},
  assess:(...args)=>calls.push(args)
 };
 const evaluate=runInNewContext(inputs+'\nevaluateBtcEntry',context);
 evaluate();
 assert.equal(calls.length,0,'listings cannot start an entry');
 scalpQuotes.set('BTC',{...depth,ticker:'KXBTC15M-PREVIOUS'});
 evaluate();
 scalpQuotes.set('BTC',{...depth,at:now-1001});
 evaluate();
 assert.equal(calls.length,0,'old round and stale quotes cannot start an entry');
 scalpQuotes.set('BTC',depth);
 evaluate();
 assert.equal(calls[0][1].no_ask_dollars,'0.6200');
 assert.equal(calls[0][4].feed,feed);
 positions.set('BTC',{ticker});
 evaluate();
 assert.equal(calls.length,1,'a same-round call is already active');
});
