import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {Readable} from 'node:stream';
import {createBtcQuoteRelay} from '../src/btc-quote-relay.mjs';

test('public listener serves only BTC bids and forwards a brief spike before its pullback',async()=>{
 let now=100;
 const relay=createBtcQuoteRelay({now:()=>now});
 relay.server.listen(0,'127.0.0.1');
 await once(relay.server,'listening');
 const url='http://127.0.0.1:'+relay.server.address().port;
 try{
  for(const path of ['/', '/health','/api/orders']){
   assert.equal((await fetch(url+path)).status,404);
  }
  assert.equal((await fetch(url+'/btc-quotes',{method:'POST'})).status,404);
  assert.equal((await fetch(url+'/btc-quotes',{headers:{Origin:'https://other.example'}})).status,403);
  const response=await fetch(url+'/btc-quotes');
  assert.equal(response.headers.get('content-type'),'text/event-stream');
  const lines=createInterface({input:Readable.fromWeb(response.body)})[Symbol.asyncIterator]();
  async function event(){
   const name=(await lines.next()).value;
   const data=JSON.parse((await lines.next()).value.slice(6));
   await lines.next();
   return {name,data};
  }
  assert.equal((await event()).name,'event: unavailable');
  const tick={status:'READY',ticker:'KXBTC15M-TEST',no:{price:.19},receivedAt:100,eventAt:99,credential:'private'};
  relay.publish({...tick,yes:{price:.8}},200);
  relay.publish({...tick,yes:{price:.43}},200);
  const spike=await event();
  assert.deepEqual(spike.data,{ticker:tick.ticker,yesBid:80,noBid:19,receivedAt:100,eventAt:99,expiresAt:200});
  assert.equal((await event()).data.yesBid,43);
  const fallback={ticker:tick.ticker,at:100,yes:{price:.38},no:{price:.61}};
  relay.publishRest(fallback,200);
  assert.equal(relay.hasFreshStream(tick.ticker),true);
  relay.reset();
  assert.equal((await event()).name,'event: unavailable');
  relay.publishRest(fallback,200);
  relay.resetStream();
  const rest=await event();
  assert.equal(rest.data.source,'REST');
  assert.equal(rest.data.yesBid,38);
  assert.equal(relay.hasFreshStream(tick.ticker),false);
  now=1200;
  relay.publishRest(fallback,2000);
  relay.publish({...tick,receivedAt:now,yes:{price:.43}},2000);
  assert.equal((await event()).data.yesBid,43,'delayed REST is discarded and the stream takes over');
  await lines.return();
 }finally{relay.close();}
});
