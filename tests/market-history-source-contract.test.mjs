import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../netlify/functions/market-history.mjs',import.meta.url),'utf8');

test('market-history filters timestamp from the immutable sample key, not its contract ticker',()=>{
 assert.match(source,/sampleTimestampFromKey\(b\.key,asset\)\s*>=\s*cutoff/);
 assert.doesNotMatch(source,/Number\(b\.key\.split\('\/'\)\.at\(-1\)\)/);
});

test('market-history excludes unverified cached labels from official outcome results',()=>{
 assert.match(source,/import \{trustedStoredFinalizedOutcome\} from '\.\.\/\.\.\/src\/official-settlement\.mjs'/);
 assert.match(source,/if\(trustedStoredFinalizedOutcome\(o,ticker\)\)outcomes\[ticker\]=o/);
 assert.match(source,/else if\(o\)unverifiedOutcomeRecords\+\+/);
 assert.match(source,/records,outcomes,unverifiedOutcomeRecords,hasMore/);
 assert.doesNotMatch(source,/if\(o\)outcomes\[ticker\]=o/);
});

test('bounded archive history uses fresh rolling samples and discloses incomplete coverage',()=>{
 assert.match(source,/import \{mergeRecentMarketHistory\} from '\.\.\/\.\.\/src\/recent-market-history\.mjs'/);
 assert.match(source,/db\.get\('recent\/'\+asset,\{type:'json'\}\)/);
 assert.match(source,/mergeRecentMarketHistory\(archiveRecords,rolling,asset,cutoff,Date\.now\(\)\)/);
 assert.match(source,/historyIncomplete:hasMore,recentCacheRecovered:recoveredFromRolling/);
});
