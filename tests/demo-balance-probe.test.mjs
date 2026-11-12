import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRefreshSavedDemoBalanceProbe as shouldRefresh, SAVED_DEMO_BALANCE_PROBE_MAX_AGE_MS as TTL,
 SAVED_DEMO_BALANCE_TRANSIENT_RETRY_MS as RETRY} from '../netlify/functions/lib/demo-balance-probe-policy.mjs';

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

test('transient transport and retryable HTTP failures are re-probed after a bounded two-minute delay',()=>{
 for(const status of ['DEMO_TRANSPORT_ERROR','KALSHI_HTTP_408','KALSHI_HTTP_429','KALSHI_HTTP_500','KALSHI_HTTP_502','KALSHI_HTTP_503','KALSHI_HTTP_504']){
  const prior={...receipt,status};
  assert.equal(shouldRefresh({...prior,checkedAt:new Date(now-RETRY+1).toISOString()},
    {commit:'abc',credentialCheckedAt:'credential-v1',now}),false,status);
  assert.equal(shouldRefresh({...prior,checkedAt:new Date(now-RETRY).toISOString()},
    {commit:'abc',credentialCheckedAt:'credential-v1',now}),true,status);
 }
});

test('successful and persistent authentication failures retain fifteen-minute cadence',()=>{
 for(const status of ['DEMO_AUTHENTICATED','KALSHI_HTTP_400','KALSHI_HTTP_401','KALSHI_HTTP_403','DEMO_CREDENTIAL_ENVELOPE_UNAVAILABLE']){
  assert.equal(shouldRefresh({...receipt,status,checkedAt:new Date(now-RETRY).toISOString()},
    {commit:'abc',credentialCheckedAt:'credential-v1',now}),false,status);
 }
});
