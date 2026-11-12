import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeDemoProbeReceipt,readSanitizedDemoProbe} from '../src/kaibot-demo-probe-telemetry.mjs';

test('KaiBot receipt telemetry exposes only fixed diagnostic fields',async()=>{
 const secret='private-key-DO-NOT-LOG';
 const receipt=await readSanitizedDemoProbe({get:async(key,opts)=>{
  assert.equal(key,'saved-balance-probe');assert.equal(opts.type,'json');
  return {status:'KALSHI_HTTP_401',checkedAt:'2026-11-12T09:00:00Z',
   failedPhase:'BALANCE',httpStatus:401,transportCause:'AUTHENTICATION_OR_PERMISSION',
   commit:'fb6ce7ff5b46aa1e763a67e89a0d82c1a1eee08d',secret,account:{balance:123},envelope:{key:secret}};
 }});
 assert.deepEqual(receipt,{status:'KALSHI_HTTP_401',checkedAt:'2026-11-12T09:00:00.000Z',
  failedPhase:'BALANCE',httpStatus:401,transportCause:'AUTHENTICATION_OR_PERMISSION',
  commit:'fb6ce7ff5b46aa1e763a67e89a0d82c1a1eee08d'});
 assert.doesNotMatch(JSON.stringify(receipt),/private-key|balance|envelope|account/);
});

test('KaiBot receipt telemetry fails closed on invalid data and storage errors',async()=>{
 const invalid=sanitizeDemoProbeReceipt({status:'SECRET',failedPhase:'SECRET',httpStatus:999,
  transportCause:'SECRET',checkedAt:'bad',commit:'private-token',responseBody:'secret'});
 assert.deepEqual(invalid,{status:'UNRECOGNIZED_DEMO_PROBE_STATUS',checkedAt:null,failedPhase:null,
  httpStatus:null,transportCause:null,commit:null});
 assert.deepEqual(await readSanitizedDemoProbe({get:async()=>{throw Error('private data')}}),
  {status:'PROBE_RECEIPT_READ_UNAVAILABLE'});
 assert.deepEqual(await readSanitizedDemoProbe(null),{status:'PROBE_STORE_UNCONFIGURED'});
});
