import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeDemoLifecycleReceipt,sanitizeDemoLockEvidence} from '../src/kaibot-demo-lifecycle-telemetry.mjs';

test('stale Demo lock inspection exposes only fixed safe evidence',()=>{
 const raw={status:'LOCK_REQUIRES_REVIEW',lockAt:1794511000000,authenticatedSnapshot:true,
  intents:2,matchedOrders:1,unresolvedIntents:1,
  reconciliation:{status:'RECONCILIATION_UNAVAILABLE',openPositions:0,secret:'hide'},
  ownerId:'private-owner',orderIds:['private-order'],credentials:'private-key'};
 const result=sanitizeDemoLifecycleReceipt({status:'DEMO_LIFECYCLE_UNAVAILABLE',error:'EXECUTION_BUSY',lockEvidence:raw});
 assert.equal(result.lockEvidence.status,'LOCK_REQUIRES_REVIEW');
 assert.equal(result.lockEvidence.unresolvedIntents,1);
 assert.equal(result.lockEvidence.reconciliation.openPositions,0);
 assert.doesNotMatch(JSON.stringify(result),/private-owner|private-order|private-key|hide/);
});

test('untrusted lock evidence is not echoed into health telemetry',()=>{
 const result=sanitizeDemoLockEvidence({status:'<secret>',lockAt:-5,intents:-1,matchedOrders:999999999,
  reconciliation:{status:'<secret>',openPositions:-3},token:'sensitive'});
 assert.equal(result.status,'UNRECOGNIZED_LOCK_STATUS');
 assert.equal(result.lockAt,null);
 assert.equal(result.intents,null);
 assert.equal(result.matchedOrders,null);
 assert.equal(result.reconciliation.status,'UNRECOGNIZED_RECONCILIATION');
 assert.equal(result.reconciliation.openPositions,null);
 assert.doesNotMatch(JSON.stringify(result),/sensitive|<secret>/);
 assert.equal(sanitizeDemoLockEvidence(null),null);
});
