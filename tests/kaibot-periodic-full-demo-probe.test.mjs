import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldRefreshFullDemoSnapshotProbe} from '../netlify/functions/kalshi-demo-snapshot-diagnostic.mjs';

test('independent full Demo snapshot cadence is bounded and invalidated by new credentials or commit',()=>{
 const now=Date.parse('2026-11-12T11:30:00Z');
 const opts={now,commit:'abc123',credentialCheckedAt:'credential-v1'};
 assert.equal(shouldRefreshFullDemoSnapshotProbe(null,opts),true);
 const previous={commit:'abc123',credentialCheckedAt:'credential-v1',checkedAt:new Date(now-9*60000).toISOString()};
 assert.equal(shouldRefreshFullDemoSnapshotProbe(previous,opts),false);
 assert.equal(shouldRefreshFullDemoSnapshotProbe({...previous,checkedAt:new Date(now-10*60000).toISOString()},opts),true);
 assert.equal(shouldRefreshFullDemoSnapshotProbe(previous,{...opts,commit:'def456'}),true);
 assert.equal(shouldRefreshFullDemoSnapshotProbe(previous,{...opts,credentialCheckedAt:'credential-v2'}),true);
});

test('scheduled full Demo snapshot remains read-only, distinct, and independent of lifecycle completion',()=>{
 const source=readFileSync(new URL('../netlify/functions/kalshi-demo-check.mjs',import.meta.url),'utf8');
 assert.match(source,/shouldRefreshFullDemoSnapshotProbe\(previousSnapshot/);
 assert.match(source,/await probeDemoSnapshot\(credentials\)/);
 assert.match(source,/store\.setJSON\('saved-snapshot-probe'/);
 assert.match(source,/store\.setJSON\('saved-balance-probe'/);
 assert.ok(source.indexOf("saved-snapshot-probe")<source.indexOf("saved-balance-probe"));
 assert.doesNotMatch(source,/allowWrites:true|submitIntent|placeOrder|cancelOrder/);
});
