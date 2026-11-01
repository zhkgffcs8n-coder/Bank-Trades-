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
