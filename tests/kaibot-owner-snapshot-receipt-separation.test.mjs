import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../netlify/functions/kalshi-demo-status.mjs',import.meta.url),'utf8');

test('owner read-only five-phase probe persists its own receipt without overwriting balance evidence',()=>{
 const begin=source.indexOf("if(action==='PROBE_DEMO_SNAPSHOT')");
 const end=source.indexOf("if(['DEMO_EXECUTION_TEST'",begin);
 assert.ok(begin>=0&&end>begin);
 const handler=source.slice(begin,end);
 assert.match(handler,/await probeDemoSnapshot\(credentials\)/);
 assert.match(handler,/await store\.setJSON\('saved-snapshot-probe',receipt\)/);
 assert.doesNotMatch(handler,/store\.setJSON\('saved-balance-probe'/);
 assert.match(handler,/return json\(\{\.\.\.result,status:receipt\.status,commit:receipt\.commit\}/);
});
