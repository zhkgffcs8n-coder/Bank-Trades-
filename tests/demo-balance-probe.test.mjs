import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRefreshSavedDemoBalanceProbe as shouldRefresh, SAVED_DEMO_BALANCE_PROBE_MAX_AGE_MS as TTL} from '../netlify/functions/lib/demo-balance-probe-policy.mjs';

const now=Date.parse('2026-11-11T10:00:00.000Z');
const receipt={commit:'abc',credentialCheckedAt:'credential-v1',
  checkedAt:new Date(now-60_000).toISOString(),status:'KALSHI_HTTP_401'};

test('saved Demo balance probe rechecks after bounded age even without a new deploy',()=>{
 assert.equal(shouldRefresh(receipt,{commit:'abc',credentialCheckedAt:'credential-v1',now}),false);
 assert.equal(shouldRefresh({...receipt,checkedAt:new Date(now-TTL+1).toISOString()},
   {commit:'abc',credentialCheckedAt:'credential-v1',now}),false);
 assert.equal(shouldRefresh({...receipt,checkedAt:new Date(now-TTL).toISOString()},
   {commit:'abc',credentialCheckedAt:'credential-v1',now}),true);
});

test('changed deploy or credential envelope invalidates a saved balance receipt',()=>{
 assert.equal(shouldRefresh(receipt,{commit:'new',credentialCheckedAt:'credential-v1',now}),true);
 assert.equal(shouldRefresh(receipt,{commit:'abc',credentialCheckedAt:'credential-v2',now}),true);
 assert.equal(shouldRefresh(null,{commit:'abc',credentialCheckedAt:'credential-v1',now}),true);
});

test('missing, invalid and future timestamps fail closed to a fresh read-only probe',()=>{
 for(const checkedAt of [undefined,'not-a-time',new Date(now+1).toISOString()])
  assert.equal(shouldRefresh({...receipt,checkedAt},{commit:'abc',credentialCheckedAt:'credential-v1',now}),true);
});

test('repeated scheduler invocations do not issue unnecessary balance requests',()=>{
 for(const status of ['DEMO_AUTHENTICATED','KALSHI_HTTP_401','DEMO_TRANSPORT_ERROR'])
  assert.equal(shouldRefresh({...receipt,status},{commit:'abc',credentialCheckedAt:'credential-v1',now}),false);
});
