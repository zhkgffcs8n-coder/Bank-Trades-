import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sanitizeDemoLifecycleReceipt} from '../src/kaibot-demo-lifecycle-telemetry.mjs';
import {shouldRefreshDemoLockInspection,DEMO_LOCK_INSPECTION_INTERVAL_MS}
 from '../netlify/functions/lib/demo-lock-inspection-policy.mjs';

test('busy Demo lock inspection reuses a recent read-only receipt',()=>{
 const now=Date.parse('2026-11-12T21:00:00Z');
 assert.equal(DEMO_LOCK_INSPECTION_INTERVAL_MS,600000);
 assert.equal(shouldRefreshDemoLockInspection(null,now),true);
 assert.equal(shouldRefreshDemoLockInspection({lockEvidence:{status:'LOCK_REQUIRES_REVIEW'}},now),true);
 const previous={lockEvidence:{status:'LOCK_REQUIRES_REVIEW',
  reconciliation:{status:'SETTLEMENT_REVENUE_MISMATCH',revenuePattern:'ZERO_PAYOUT'}},
  lockEvidenceCheckedAt:now-9*60000};
 assert.equal(shouldRefreshDemoLockInspection(previous,now),false);
 assert.equal(shouldRefreshDemoLockInspection({...previous,lockEvidenceCheckedAt:now-600000},now),true);
 assert.equal(shouldRefreshDemoLockInspection({...previous,lockEvidenceCheckedAt:now+1},now),true);
 assert.equal(shouldRefreshDemoLockInspection({...previous,lockEvidenceCheckedAt:null},now),true);
});

test('busy-lock evidence is diagnostic only and does not unlock trading',()=>{
 const source=readFileSync(new URL('../netlify/functions/kalshi-demo-lifecycle.mjs',import.meta.url),'utf8');
 assert.match(source,/shouldRefreshDemoLockInspection\(previous,now\)/);
 assert.match(source,/lockEvidence=previous\.lockEvidence/);
 assert.match(source,/lockEvidenceCheckedAt=previous\.lockEvidenceCheckedAt/);
 assert.match(source,/status:'DEMO_LIFECYCLE_UNAVAILABLE'/);
 assert.doesNotMatch(source,/probeDemoSnapshot|shouldProbeTerminalDemo/);
 const policy=readFileSync(new URL('../netlify/functions/lib/demo-lock-inspection-policy.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(policy,/allowWrites|submitIntent|releaseFailures|recoverTerminalDemoState|emergencyStop/);
});

test('cached lock inspection reports its own age instead of lifecycle wake age',()=>{
 const now=Date.parse('2026-11-12T21:00:00Z');
 const safe=sanitizeDemoLifecycleReceipt({status:'DEMO_LIFECYCLE_UNAVAILABLE',
  checkedAt:now,lockEvidenceCheckedAt:now-8*60000,
  lockEvidence:{status:'LOCK_REQUIRES_REVIEW',token:'private',account:'secret'}});
 assert.equal(safe.checkedAt,now);
 assert.equal(safe.lockEvidenceCheckedAt,now-8*60000);
 assert.doesNotMatch(JSON.stringify(safe),/private|secret|account|token/);
 const invalid=sanitizeDemoLifecycleReceipt({status:'DEMO_LIFECYCLE_UNAVAILABLE',
  lockEvidenceCheckedAt:'private',lockEvidence:{status:'INSPECTION_UNAVAILABLE'}});
 assert.equal(invalid.lockEvidenceCheckedAt,null);
});
