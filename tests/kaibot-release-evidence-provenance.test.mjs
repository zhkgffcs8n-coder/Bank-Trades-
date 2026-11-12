import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sanitizeDemoLifecycleReceipt,readSanitizedDemoLifecycle} from '../src/kaibot-demo-lifecycle-telemetry.mjs';

test('Demo lifecycle telemetry exposes only allowlisted release diagnostics',()=>{
 const raw={status:'DEMO_LIFECYCLE_FAILED',checkedAt:1794480000000,finished:true,
  stage:'ACCOUNT_SNAPSHOT',attempts:2,error:'DEMO_SNAPSHOT_BALANCE_READ_FAILED',
  snapshotCause:'KALSHI_HTTP_401',upRoundTripVerified:false,downRoundTripVerified:false,
  commit:'a'.repeat(40),ownerId:'private',keyId:'secret',orders:[{orderId:'secret'}],
  envelope:'private',accessToken:'private'};
 const result=sanitizeDemoLifecycleReceipt(raw);
 assert.deepEqual(result,{status:'DEMO_LIFECYCLE_FAILED',checkedAt:1794480000000,finished:true,
  stage:'ACCOUNT_SNAPSHOT',attempts:2,error:'DEMO_SNAPSHOT_BALANCE_READ_FAILED',
  snapshotCause:'KALSHI_HTTP_401',upRoundTripVerified:false,downRoundTripVerified:false,
  executionTest:false,commit:'a'.repeat(40)});
 assert.doesNotMatch(JSON.stringify(result),/secret|private|ownerId|envelope|accessToken/);
});
test('unrecognized lifecycle fields fail closed and storage failures are explicit',async()=>{
 const receipt=sanitizeDemoLifecycleReceipt({status:'bad',stage:'INJECTED',attempts:999,
  error:'raw network error: credentials',commit:'bad'});
 assert.equal(receipt.status,'UNRECOGNIZED_DEMO_LIFECYCLE_STATUS');
 assert.equal(receipt.stage,null);assert.equal(receipt.attempts,null);
 assert.equal(receipt.error,null);assert.equal(receipt.commit,null);
 assert.deepEqual(await readSanitizedDemoLifecycle({get:async()=>{throw Error('secret')}}),
  {status:'LIFECYCLE_RECEIPT_READ_UNAVAILABLE'});
});
test('scheduled Demo probes use the embedded build SHA and worker publishes sanitized lifecycle',()=>{
 for(const path of ['kalshi-demo-check.mjs','kalshi-demo-lifecycle.mjs',
  'kalshi-demo-status.mjs','kalshi-demo-snapshot-diagnostic.mjs']){
  const source=readFileSync(new URL('../netlify/functions/'+path,import.meta.url),'utf8');
  assert.match(source,/liveBuildCommit\(\)/,path);
 }
 const worker=readFileSync(new URL('../scripts/predator-worker.mjs',import.meta.url),'utf8');
 assert.match(worker,/readSanitizedDemoLifecycle\(demoProbeStore\)/);
 assert.match(worker,/demoSnapshotReceipt,demoLifecycleReceipt/);
 assert.match(worker,/nextDemoLifecycleRead=now\+60000/);
});
