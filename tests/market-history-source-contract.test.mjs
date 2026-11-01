import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../netlify/functions/market-history.mjs',import.meta.url),'utf8');

test('market-history filters timestamp from the immutable sample key, not its contract ticker',()=>{
 assert.match(source,/sampleTimestampFromKey\(b\.key,asset\)\s*>=\s*cutoff/);
 assert.doesNotMatch(source,/Number\(b\.key\.split\('\/'\)\.at\(-1\)\)/);
});
