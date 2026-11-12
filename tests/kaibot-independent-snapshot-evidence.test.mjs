import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readSanitizedDemoProbe} from '../src/kaibot-demo-probe-telemetry.mjs';

test('independent snapshot evidence cannot be overwritten by scheduled balance-only probe',async()=>{
 const records=new Map([
  ['saved-balance-probe',{status:'DEMO_AUTHENTICATED',checkedAt:'2026-11-12T10:00:00Z'}],
  ['saved-snapshot-probe',{status:'DEMO_SNAPSHOT_READS_OK',checkedAt:'2026-11-12T10:01:00Z',operation:'INDEPENDENT_READ_ONLY_SNAPSHOT'}]
 ]);
 const store={get:async key=>records.get(key)};
 const balance=await readSanitizedDemoProbe(store);
 const snapshot=await readSanitizedDemoProbe(store,'saved-snapshot-probe');
 assert.equal(balance.status,'DEMO_AUTHENTICATED');
 assert.equal(snapshot.status,'DEMO_SNAPSHOT_READS_OK');
 records.set('saved-balance-probe',{status:'KALSHI_HTTP_503',checkedAt:'2026-11-12T10:15:00Z'});
 assert.equal((await readSanitizedDemoProbe(store,'saved-snapshot-probe')).status,'DEMO_SNAPSHOT_READS_OK');
});

test('scheduled full snapshot writes a separate durable receipt and exposes it in worker and owner status',()=>{
 const lifecycle=readFileSync(new URL('../netlify/functions/kalshi-demo-lifecycle.mjs',import.meta.url),'utf8');
 const check=readFileSync(new URL('../netlify/functions/kalshi-demo-check.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../scripts/predator-worker.mjs',import.meta.url),'utf8');
 const status=readFileSync(new URL('../netlify/functions/kalshi-demo-status.mjs',import.meta.url),'utf8');
 assert.match(lifecycle,/db\.get\('saved-snapshot-probe'/);
 assert.match(lifecycle,/db\.setJSON\('saved-snapshot-probe',\{\.\.\.demoSnapshotProbeReceipt/);
 assert.match(check,/store\.setJSON\('saved-balance-probe'/);
 assert.match(check,/store\.setJSON\('saved-snapshot-probe'/);
 assert.match(worker,/readSanitizedDemoProbe\(demoProbeStore,'saved-snapshot-probe'\)/);
 assert.match(worker,/demoProbeReceipt,demoSnapshotReceipt/);
 assert.match(status,/savedBalanceProbe,savedSnapshotProbe,championWake/);
});
