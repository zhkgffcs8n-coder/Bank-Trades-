import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../scripts/predator-worker.mjs',import.meta.url),'utf8');
test('invalid Kalshi book frames cannot mask the no-valid-book timeout',()=>{
 assert.match(src,/if\(update\.status==='INVALID_BOOK'\)\{\s*\/\/ Invalid frames must not extend/);
 const invalid=src.match(/if\(update\.status==='INVALID_BOOK'\)\{([\s\S]*?)\n\s*\}/)?.[1];
 assert.ok(invalid);
 assert.doesNotMatch(invalid,/lastDepthAt\s*=/);
 assert.match(invalid,/counters\.invalidBookFrames\+\+/);
 assert.match(src,/if\(update\.status==='READY'\)\{\s*lastDepthAt=update\.receivedAt/);
 assert.match(src,/Date\.now\(\)-lastDepthAt>10000/);
 assert.match(src,/counters\.depthTimeouts\+\+/);
});
