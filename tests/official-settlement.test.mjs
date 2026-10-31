import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedFinalizedBinaryOutcome, trustedStoredFinalizedOutcome, SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';
const market = {ticker:'KXBTC15M-TEST',status:'finalized',market_type:'binary',is_provisional:false,result:'no',settlement_value_dollars:'0.0000'};
test('accepts finalized binary payout only for exact ticker',()=>{
  assert.equal(verifiedFinalizedBinaryOutcome(market,market.ticker),'no');
  assert.equal(verifiedFinalizedBinaryOutcome({...market,result:'yes',settlement_value_dollars:'1.0000'},market.ticker),'yes');
  assert.equal(verifiedFinalizedBinaryOutcome({...market,ticker:'OTHER'},market.ticker),null);
});
test('rejects provisional, non-final, nonbinary, missing or inconsistent payouts',()=>{
  for (const patch of [{status:'settled'},{status:'determined'},{market_type:'scalar'},{is_provisional:true},{settlement_value_dollars:null},{settlement_value_dollars:''},{settlement_value_dollars:'NaN'},{settlement_value_dollars:'1.0000'},{result:'yes'},{result:'scalar'}]) {
    assert.equal(verifiedFinalizedBinaryOutcome({...market,...patch},market.ticker),null,JSON.stringify(patch));
  }
});
test('legacy unverified stored outcomes cannot authorize a paper settlement',()=>{
  assert.equal(trustedStoredFinalizedOutcome({ticker:market.ticker,result:'no',source:'Kalshi official finalized market'},market.ticker),null);
  assert.equal(trustedStoredFinalizedOutcome({ticker:market.ticker,result:'no',verification:SETTLEMENT_VERIFICATION},market.ticker),'no');
  assert.equal(trustedStoredFinalizedOutcome({ticker:'OTHER',result:'yes',verification:SETTLEMENT_VERIFICATION},market.ticker),null);
});

// Wiring regression: prevent the collector from silently reaccepting legacy
// unverified outcomes or counting an already-labeled training example twice.
test('collector rechecks legacy outcomes and gates all new research resolutions',()=>{
  const source=readFileSync(new URL('../netlify/functions/market-collector.mjs',import.meta.url),'utf8');
  assert.match(source,/const cached=await db\.get\(labelKey,/);
  assert.match(source,/trustedStoredFinalizedOutcome\(cached,rec\.ticker\)/);
  assert.match(source,/if\(!cached&&Array\.isArray\(rec\.features\)/);
  const verifiedReaders=source.match(/trustedStoredFinalizedOutcome\(outcome,rec\.ticker\)/g)||[];
  assert.equal(verifiedReaders.length,2,'both shadow comparison readers must require verified finality');
  assert.doesNotMatch(source,/if\(!\['yes','no'\]\.includes\(outcome\?\.result\)\)continue;/);
});
