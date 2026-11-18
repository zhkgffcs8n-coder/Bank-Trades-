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
 const positions=new Map([['BTC',{ticker}]]);
 const book=source.slice(source.indexOf('function bestBid('),source.indexOf('// One-contract research estimate.'));
 const refresh=runInNewContext(book+'\n'+listener+'\nrefreshBtcScalpBook',{
  window:{addEventListener:(name,fn)=>{if(name==='banktrades:kalshi-quote')receive=fn;if(name==='banktrades:shared-signals')onEvidence=fn;}},
  Date:{parse:Date.parse,now:()=>now},Number,scalpQuotes:quotes,positions,selectedCoin:'BTC',
  document:{hidden:false},AbortSignal,btcScalpBookMaxAge:1800,btcScalpBookPending:false,latestBtcStreamQuote:null,
  async fetch(url){
   assert.equal(url,'/api/data?mode=orderbook&live=1&ticker='+ticker);
   return {ok:true,json:async()=>({fetched_at:new Date(now).toISOString(),orderbook:{orderbook_fp:{
    yes_dollars:[['0.7125','0.50']],no_dollars:[['0.2775','2.00']]
   }}})};
  },
  price:(m,k)=>Number((Number(m[k+'_dollars'])*100).toFixed(2)),scalp:(...args)=>calls.push(args),
  scalpExitEvidence:()=>null,setInterval(){}
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
  btcScalpBookMaxAge:1800,latestBtcStreamQuote:null,
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
