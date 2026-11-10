import test from 'node:test';
import assert from 'node:assert/strict';
import {findDemoLifecycleMarket} from '../netlify/functions/lib/demo-market-discovery.mjs';

test('Demo discovery follows the cursor without weakening market eligibility',async()=>{
 const now=Date.now();
 const valid={ticker:'ELIGIBLE',exchange_index:0,status:'active',market_type:'binary',
  close_time:new Date(now+600000).toISOString(),yes_ask_dollars:'.51',yes_bid_dollars:'.49',
  no_ask_dollars:'.51',no_bid_dollars:'.49'};
 const paths=[];
 const client={request:async(method,path)=>{
  assert.equal(method,'GET');
  paths.push(path);
  return paths.length===1?{cursor:'second',markets:[{...valid,ticker:'WIDE',yes_ask_dollars:'.70'},
   {...valid,ticker:'EXCLUDED'}]}:{markets:[valid]};
 }};
 assert.equal(await findDemoLifecycleMarket(client,['EXCLUDED'],()=>now),valid);
 assert.match(paths[1],/cursor=second/);
});
