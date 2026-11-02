import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecentMarketHistory} from '../src/recent-market-history.mjs';

const asset='BTC', now=1_800_000, cutoff=now-4*60*60*1000;
const row=(t,ticker='KXBTC15M-A',extra={})=>({asset,ticker,t,yesMid:.5,...extra});

test('recent cache recovers newest samples when bounded archive only sees older keys',()=>{
  const old=row(now-120_000), fresh=row(now-60_000);
  const result=mergeRecentMarketHistory([old],[fresh],asset,cutoff,now);
  assert.deepEqual(result.records,[old,fresh]);
  assert.equal(result.recoveredFromRolling,1);
});

test('immutable archive sample wins duplicate cache keys; reject cross-asset and future rows',()=>{
  const stored=row(now-60_000,'KXBTC15M-A',{yesMid:.35});
  const duplicate=row(now-60_000,'KXBTC15M-A',{yesMid:.95});
  const other=row(now-30_000,'KXETH15M-A',{asset:'ETH'});
  const future=row(now+60_000);
  const stale=row(cutoff-1);
  const malformed=row(NaN);
  const result=mergeRecentMarketHistory([stored],[duplicate,other,future,stale,malformed,null],asset,cutoff,now);
  assert.deepEqual(result.records,[stored]);
  assert.equal(result.recoveredFromRolling,0);
});

test('same-minute different contracts survive and newest limit is deterministic',()=>{
  const a=row(now-120_000,'KXBTC15M-A');
  const b=row(now-120_000,'KXBTC15M-B');
  const c=row(now-60_000,'KXBTC15M-C');
  const result=mergeRecentMarketHistory([c,a],[b],asset,cutoff,now,2);
  assert.deepEqual(result.records,[b,c]);
  assert.equal(result.recoveredFromRolling,1);
});

test('invalid window settings fail closed',()=>{
  assert.throws(()=>mergeRecentMarketHistory([],[],asset,cutoff,now,0),/Invalid/);
  assert.throws(()=>mergeRecentMarketHistory([],[],asset,cutoff,NaN),/Invalid/);
});

test('recovery count excludes rolling rows discarded by output limit',()=>{
  const newest=row(now-30_000,'KXBTC15M-NEW');
  const old=row(now-120_000,'KXBTC15M-OLD');
  const result=mergeRecentMarketHistory([newest],[old],asset,cutoff,now,1);
  assert.deepEqual(result.records,[newest]);
  assert.equal(result.recoveredFromRolling,0);
});

test('conflicting archive quotes for one minute are quarantined regardless of order',()=>{
  const a=row(now-60_000,'KXBTC15M-A',{yesBid:.48,yesAsk:.52});
  const conflict={...a,yesBid:.46}; // Same midpoint, different executable quote.
  const good=row(now-30_000,'KXBTC15M-B');
  for (const copies of [[a,conflict],[conflict,a]]) {
    const result=mergeRecentMarketHistory([...copies,good],[a],asset,cutoff,now);
    assert.deepEqual(result.records,[good]);
    assert.equal(result.conflictingSampleCount,1);
    assert.equal(result.recoveredFromRolling,0);
  }
});

test('conflicting rolling-cache copies are quarantined, identical copies are deduplicated',()=>{
  const a=row(now-60_000,'KXBTC15M-A',{yesBid:.48});
  const conflict={...a,yesBid:.47};
  const bad=mergeRecentMarketHistory([],[a,conflict],asset,cutoff,now);
  assert.deepEqual(bad.records,[]);
  assert.equal(bad.conflictingSampleCount,1);
  assert.equal(bad.recoveredFromRolling,0);
  const clean=mergeRecentMarketHistory([],[a,{...a}],asset,cutoff,now);
  assert.deepEqual(clean.records,[a]);
  assert.equal(clean.conflictingSampleCount,0);
  assert.equal(clean.recoveredFromRolling,1);
});
