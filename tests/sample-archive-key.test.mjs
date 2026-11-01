import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTimestampFromKey} from '../src/sample-archive-key.mjs';

const minute=1793530800000;

test('market-history finds current ticker-qualified sample keys',()=>{
 assert.equal(sampleTimestampFromKey('samples/BTC/'+minute+'/KXBTC15M-TEST','BTC'),minute);
 assert.equal(sampleTimestampFromKey('samples/ZEC/'+minute+'/KXZEC15M-TEST','ZEC'),minute);
});

test('market-history preserves legacy three-part sample keys',()=>{
 assert.equal(sampleTimestampFromKey('samples/BTC/'+minute,'BTC'),minute);
});

test('market-history rejects malformed or cross-asset keys rather than inferring ticker as time',()=>{
 for(const key of [
  'samples/ETH/'+minute+'/KXETH15M-TEST',
  'samples/BTC/KXBTC15M-TEST',
  'samples/BTC/not-a-time/KXBTC15M-TEST',
  'samples/BTC/'+minute+'/',
  'samples/BTC/'+minute+'/TICKER/EXTRA',
  'outcomes/BTC/'+minute,
  'samples/BTC/NaN',
  'samples/BTC/0000000000000'
 ]) assert.equal(sampleTimestampFromKey(key,'BTC'),null,key);
});

test('market-history current key timestamp can be filtered by four-hour cutoff',()=>{
 const keys=['samples/BTC/'+(minute-60000)+'/OLD','samples/BTC/'+minute+'/NEW'];
 assert.deepEqual(keys.filter(key=>sampleTimestampFromKey(key,'BTC')>=minute),[keys[1]]);
});
