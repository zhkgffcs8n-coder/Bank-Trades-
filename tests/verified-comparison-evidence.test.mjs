import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedComparisonEvidence} from '../src/verified-comparison-evidence.mjs';
import {SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';

const market = (ticker='KXBTC15M-TEST', outcome='yes') => ({
 ticker,asset:'BTC',at:100,expiresAt:200,resolvedAt:250,status:'RESOLVED',
 outcome,outcomeVerification:SETTLEMENT_VERIFICATION,
 engines:{original:{action:'BUY UP',side:'up',ask:50,resolved:true,won:outcome==='yes',pnl:outcome==='yes'?.5:-.5},
  upgraded:{action:'WAIT',reason:'Conservative gate'}}
});

test('gross research evidence requires a prospective, strictly verified official settlement',()=>{
 const valid=market();
 const invalid=[
  {...market('legacy'),outcomeVerification:undefined},
  {...market('unresolved'),status:'PENDING'},
  {...market('leaked'),at:200},
  {...market('premature'),resolvedAt:199},
  {...market('bad-price'),engines:{...valid.engines,original:{...valid.engines.original,ask:0}}},
  {...market('fake-win'),engines:{...valid.engines,original:{...valid.engines.original,won:false}}},
  {...market('fake-pnl'),engines:{...valid.engines,original:{...valid.engines.original,pnl:2}}},
  {...market('fake-candidate'),engines:{...valid.engines,upgraded:{action:'BUY DOWN',side:'down',ask:50,resolved:true,won:true,pnl:.5}}}
 ];
 const report=verifiedComparisonEvidence([valid,...invalid]);
 assert.equal(report.rows.length,1);
 assert.equal(report.rejected,invalid.length);
 assert.equal(report.conflictingMarketCount,0);
});

test('accepts verified candidate fills and excludes conflicting duplicate tickers in any order',()=>{
 const base=market(), changed={...market(),outcome:'no',engines:{
  original:{action:'BUY UP',side:'up',ask:50,resolved:true,won:false,pnl:-.5},
  upgraded:{action:'WAIT'}}};
 const verifiedCandidate={...market('candidate'),engines:{
  ...base.engines,upgraded:{action:'BUY UP',side:'up',ask:60,resolved:true,won:true,pnl:.4}}};
 for (const input of [[base,changed,verifiedCandidate],[changed,verifiedCandidate,base]]){
  const report=verifiedComparisonEvidence(input);
  assert.deepEqual(report.rows.map(x=>x.ticker),['candidate']);
  assert.equal(report.conflictingMarketCount,1);
 }
 assert.equal(verifiedComparisonEvidence([base,{...base,resolvedAt:300}]).rows.length,1);
});

test('unverified and malformed duplicate tickers quarantine gross lessons and reports',()=>{
 const good=market('duplicate'),other=market('independent');
 for(const duplicate of [
  {...good,outcomeVerification:null},
  {...good,outcome:'no',outcomeVerification:null},
  {...good,engines:{...good.engines,original:{...good.engines.original,pnl:2}}},
  {...good,status:'PENDING'}
 ]){
  for(const records of [[good,duplicate,other],[duplicate,other,good]]){
   const result=verifiedComparisonEvidence(records);
   assert.deepEqual(result.rows.map(r=>r.ticker),['independent']);
   assert.equal(result.conflictingMarketCount,1);
   assert.equal(result.rejected,1);
  }
 }
 const invalidOnly=verifiedComparisonEvidence([{...market('bad'),outcomeVerification:null}]);
 assert.equal(invalidOnly.rows.length,0);
 assert.equal(invalidOnly.conflictingMarketCount,0);
 assert.equal(invalidOnly.rejected,1);
});
