import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleDemoLifecycleMarket,demoLifecycleMarketRejection} from '../netlify/functions/lib/demo-market-discovery.mjs';
import {runDemoLifecycle} from '../netlify/functions/lib/kalshi-demo-lifecycle.mjs';
import {initialState} from '../src/live-execution.mjs';

const now=Date.parse('2026-11-10T17:00:00Z');
const base=()=>({
 ticker:'KXBTC15M-TEST',exchange_index:0,status:'active',market_type:'binary',
 close_time:new Date(now+600000).toISOString(),
 yes_ask_dollars:'0.50',yes_bid_dollars:'0.48',
 no_ask_dollars:'0.52',no_bid_dollars:'0.50'
});

test('diagnostic reason matches every existing Demo market rejection without relaxing eligibility',()=>{
 const cases=[
  [null,'DEMO_MARKET_NOT_FOUND'],
  [{exchange_index:1},'DEMO_MARKET_NONDEFAULT_EXCHANGE'],
  [{status:'closed'},'DEMO_MARKET_INACTIVE'],
  [{market_type:'scalar'},'DEMO_MARKET_NOT_BINARY'],
  [{close_time:new Date(now+300000).toISOString()},'DEMO_MARKET_CLOSING_SOON'],
  [{yes_ask_dollars:'0.09'},'DEMO_MARKET_ASK_OUT_OF_RANGE'],
  [{no_ask_dollars:'0.81'},'DEMO_MARKET_ASK_OUT_OF_RANGE'],
  [{yes_bid_dollars:'0'},'DEMO_MARKET_BID_UNAVAILABLE'],
  [{no_bid_dollars:'0.40'},'DEMO_MARKET_SPREAD_UNSAFE'],
  [{yes_bid_dollars:'0.51'},'DEMO_MARKET_SPREAD_UNSAFE']
 ];
 assert.equal(demoLifecycleMarketRejection(base(),[],now),null);
 assert.equal(eligibleDemoLifecycleMarket(base(),[],now),true);
 for(const [change,reason] of cases){
  const market=change?{...base(),...change}:null;
  assert.equal(demoLifecycleMarketRejection(market,[],now),reason);
  if(market)assert.equal(eligibleDemoLifecycleMarket(market,[],now),false);
 }
 assert.equal(demoLifecycleMarketRejection(base(),['KXBTC15M-TEST'],now),'DEMO_MARKET_ALREADY_USED');
 assert.equal(eligibleDemoLifecycleMarket(base(),['KXBTC15M-TEST'],now),false);
});

test('ineligible champion contract persists only safe diagnostic code; no order attempt',async()=>{
 const state=initialState(),runtimeNow=Date.now();
 let creates=0,persists=0;
 const repo={async acquire(){return {state,async persist(){persists++;},async release(){}};}};
 const client={
  async snapshot(){return {at:runtimeNow,complete:true,balanceCents:10000,orders:[],fills:[],positions:[],settlements:[]};},
  async create(){creates++;throw Error('UNEXPECTED_DEMO_ORDER');}
 };
 const result=await runDemoLifecycle({
  repo,client,findMarket:async()=>null,
  marketRejection:()=> 'DEMO_MARKET_SPREAD_UNSAFE',
  championSignals:async()=>[{ticker:'KXBTC15M-TEST',action:'BUY DOWN',at:runtimeNow,entryReference:50}],
  quoteFor:async()=>{throw Error('UNEXPECTED_DEMO_QUOTE');},
  commit:'test',clock:()=>runtimeNow
 });
 assert.equal(result.status,'DEMO_CHAMPION_CONTRACT_INELIGIBLE');
 assert.equal(result.marketRejectionReason,'DEMO_MARKET_SPREAD_UNSAFE');
 assert.equal(result.attempts,0);
 assert.equal(creates,0);
 assert.ok(persists>0);
});
