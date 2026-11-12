import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../scripts/predator-worker.mjs',import.meta.url),'utf8');
test('worker health publishes sanitized market discovery status',()=>{
 assert.match(source,/marketDiscovery=\{status:'NOT_ATTEMPTED'/);
 assert.match(source,/status:selected\?'MARKET_SELECTED':'NO_ELIGIBLE_MARKET'/);
 assert.match(source,/errorCode:code/);
 assert.match(source,/counters,marketDiscovery,gaps/);
 assert.doesNotMatch(source,/errorCode:error\.message/);
});
