import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWakeLifecycleStatus,demoWakeReceipt} from '../src/demo-wake-outcome.mjs';

test('204 wake reports a lifecycle rejection, not an exchange fill',()=>{
 const response=new Response(null,{status:204,headers:{'x-demo-lifecycle-status':'DEMO_CHAMPION_CONTRACT_INELIGIBLE'}});
 const receipt=demoWakeReceipt({response,intake:{status:'SHADOW_PARITY_MATCH',ticker:'KXBTC15M-TEST',action:'BUY UP'},receivedAt:100,completedAt:200});
 assert.equal(receipt.httpStatus,204);
 assert.equal(receipt.lifecycleStatus,'DEMO_CHAMPION_CONTRACT_INELIGIBLE');
 assert.equal(receipt.status,'SHADOW_PARITY_MATCH');
 assert.equal(receipt.filled,undefined);
});

test('missing or untrusted outcome is not promoted to a fill',()=>{
 for(const status of [undefined,'','ENTRY_RECONCILED','DEMO_BAD-STATUS','DEMO_FILLED\\r\\nx-secret: value'])
  assert.equal(demoWakeLifecycleStatus(status),'DEMO_OUTCOME_UNVERIFIED');
 const receipt=demoWakeReceipt({response:new Response(null,{status:503}),intake:{status:'STALE_OR_UNAUTHENTICATED'},receivedAt:10,completedAt:20});
 assert.equal(receipt.lifecycleStatus,'DEMO_OUTCOME_UNVERIFIED');
 assert.equal(receipt.httpStatus,503);
});

test('valid lifecycle statuses distinguish waiting from reconciled entry and exit',()=>{
 for(const status of ['DEMO_WAITING_FOR_CHAMPION_ENTRY','DEMO_CHAMPION_ASK_ABOVE_REFERENCE','DEMO_ENTRY_RECONCILED','DEMO_EXIT_RECONCILED'])
  assert.equal(demoWakeLifecycleStatus(status),status);
});

test('Netlify receipt records the precise safe market gate but never implies an order',()=>{
 const response=new Response(null,{status:204,headers:{
  'x-demo-lifecycle-status':'DEMO_CHAMPION_CONTRACT_INELIGIBLE',
  'x-demo-market-rejection-reason':'DEMO_MARKET_CLOSING_SOON'
 }});
 const receipt=demoWakeReceipt({response,intake:{status:'SHADOW_PARITY_MATCH',ticker:'KXBTC15M-TEST',action:'BUY DOWN'},receivedAt:100,completedAt:200});
 assert.equal(receipt.lifecycleStatus,'DEMO_CHAMPION_CONTRACT_INELIGIBLE');
 assert.equal(receipt.marketRejectionReason,'DEMO_MARKET_CLOSING_SOON');
 assert.equal(receipt.filled,undefined);
 const fake=demoWakeReceipt({response:new Response(null,{status:204,headers:{
  'x-demo-lifecycle-status':'DEMO_CHAMPION_CONTRACT_INELIGIBLE',
  'x-demo-market-rejection-reason':'DEMO_ORDER_FILLED'
 }}),intake:{},receivedAt:100,completedAt:200});
 assert.equal(fake.marketRejectionReason,'DEMO_MARKET_NOT_VERIFIED');
});
