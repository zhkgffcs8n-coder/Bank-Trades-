import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPredatorTrades,openPredatorTape} from '../src/predator-stream.mjs';
import {scorePredatorSamples} from '../src/predator-forward.mjs';

test('stream keeps one causal BTC tick per trade and disconnects on stale tape',()=>{
 const now=20000,row={trade_id:'1',product_id:'BTC-USD',time:new Date(now-500).toISOString(),side:'SELL',price:'100000',size:'.2'};
 const message={channel:'market_trades',events:[{type:'update',trades:[row,row,{...row,trade_id:'2',time:new Date(now+1).toISOString()}]}]};
 assert.deepEqual(appendPredatorTrades([],message,now),[{id:'1',time:19500,price:100000,flow:.2}]);
 let instance,clock=now;
 class Socket extends EventTarget{
  constructor(){super();instance=this;this.readyState=1;}
  send(){this.subscribed=true;}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 const session=openPredatorTape({Socket,clock:()=>clock});
 instance.dispatchEvent(new Event('open'));
 assert.equal(instance.subscribed,true);
 instance.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)}));
 assert.equal(session.snapshot().tape.length,1);
 clock+=7000;
 assert.equal(session.snapshot().tape.length,0);
 session.close();
});

test('sub-minute scores cannot borrow the loose minute-collector timing window',()=>{
 const book={yes:{price:.4},no:{price:.58}};
 const row={ticker:'T',at:1000,expiresAt:20000,book,sourceEventAt:900};
 assert.equal(scorePredatorSamples([row],{...row,at:4000},[3,6,9],1200)[0].horizon,3);
 assert.equal(scorePredatorSamples([row],{...row,at:1800},[3,6,9],1200).length,0);
});
