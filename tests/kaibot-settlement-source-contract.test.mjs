import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../netlify/functions/kaibot-runner.mjs',import.meta.url),'utf8');

test('new KaiBot settled paper positions record strict official outcome provenance',()=>{
 assert.match(source,/result=verifiedFinalizedBinaryOutcome\(official\?\.market,t\.ticker\)/);
 assert.match(source,/result=trustedStoredFinalizedOutcome\(o,t\.ticker\)/);
 assert.match(source,/t\.status='SETTLED';t\.marketResult=result/);
 assert.match(source,/t\.outcomeVerification=SETTLEMENT_VERIFICATION;t\.outcomeVerifiedAt=now/);
});

test('legacy paper settlements are reverified without replaying payouts',()=>{
 const start=source.indexOf(' // Gradually reverify legacy SETTLED paper records');
 const end=source.indexOf(' // Paper-only exit simulation:');
 assert.ok(start>0&&end>start);
 const review=source.slice(start,end);
 assert.match(review,/const reviewCount=Math\.min\(4,legacySettled\.length\)/);
 assert.match(review,/await Promise\.all\(Array\.from\(\{length:reviewCount\},async/);
 assert.match(review,/trustedStoredFinalizedOutcome/);
 assert.match(review,/verifiedFinalizedBinaryOutcome/);
 assert.match(review,/if\(result===t\.marketResult\)/);
 assert.match(review,/t\.outcomeVerification=SETTLEMENT_VERIFICATION/);
 assert.match(review,/t\.outcomeConflict=true/);
 assert.doesNotMatch(review,/ledger\.cash\s*=/);
 assert.doesNotMatch(review,/t\.pnl\s*=/);
 assert.match(source,/unverifiedSettledRecordCount:/);
 assert.match(source,/settlementConflictCount:/);
});
