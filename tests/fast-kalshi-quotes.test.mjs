import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const listener=source.slice(source.indexOf('// Each coin quote is delivered'),source.indexOf('const state=box.querySelector'));
test('individual Kalshi quote immediately reaches active scalper with fractional prices',()=>{
 let receive;const calls=[],quotes=new Map();
 runInNewContext(listener,{window:{addEventListener:(_name,fn)=>receive=fn},Date,Number,scalpQuotes:quotes,
 positions:new Map([['BTC',{ticker:'KXBTC15M-TEST'}]]),selectedCoin:'BTC',
 price:(m,k)=>Number(m[k+'_dollars'])*100,scalp:(...args)=>calls.push(args),setInterval(){}});
 const row={asset:'BTC',available:true,quote_received_at:new Date().toISOString(),market:{ticker:'KXBTC15M-TEST',close_time:new Date(Date.now()+60000).toISOString(),yes_bid_dollars:'0.7125',yes_ask_dollars:'0.7225',no_bid_dollars:'0.2775',no_ask_dollars:'0.2875'}};
 receive({detail:row});
 assert.equal(calls.length,1);assert.equal(calls[0][4].up.bid,71.25);assert.equal(calls[0][4].up.ask,72.25);
 receive({detail:{...row,quote_received_at:new Date(Date.now()-6000).toISOString()}});
 assert.equal(calls.length,1);
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
