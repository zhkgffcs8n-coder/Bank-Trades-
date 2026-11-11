import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,submitIntent} from '../src/live-execution.mjs';
import {eligibleDemoLifecycleMarket} from '../netlify/functions/lib/demo-market-discovery.mjs';

const now=Date.now(),ticker='DEMO-ROUND';
for(const exchangeIndex of [0,2,'2',-1,null])test('Demo exchange routing: '+String(exchangeIndex),async()=>{
 const valid=typeof exchangeIndex==='number'&&exchangeIndex>=0;
 const market={ticker,exchange_index:exchangeIndex,status:'active',market_type:'binary',close_time:new Date(now+600000).toISOString(),
  yes_ask_dollars:'.50',yes_bid_dollars:'.49',no_ask_dollars:'.51',no_bid_dollars:'.50'};
 assert.equal(eligibleDemoLifecycleMarket(market,[],now,true),valid);
 const state=initialState();state.enabled=true;state.stopped=false;
 let funds=0,submitted=0;
 const options={state,client:{buyingPower:async index=>{assert.equal(index,exchangeIndex);return funds;},
  create:async order=>{assert.equal(order.exchange_index,exchangeIndex);submitted++;return {order_id:'demo-id'};}},
  persist:async()=>{},checkStopped:async()=>false,snapshot:{complete:true,at:now,balanceCents:500,orders:[],fills:[],positions:[],settlements:[]},
  signal:{ticker,at:now,action:'BUY UP'},quote:{ticker,at:now,expiresAt:now+600000,upAsk:50,upBid:49,exchangeIndex},
  trialCaps:true,now,clock:()=>now};
 await assert.rejects(submitIntent(options),valid?/EXCHANGE_BUYING_POWER_LIMIT/:/INVALID_EXCHANGE_INDEX/);
 assert.equal(submitted,0);
 assert.equal(state.intents.length,0);
 if(valid){funds=100;const intent=await submitIntent(options);assert.equal(intent.exchangeIndex,exchangeIndex);assert.equal(submitted,1);}
});
