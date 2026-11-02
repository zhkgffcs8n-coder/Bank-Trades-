import test from 'node:test';
import assert from 'node:assert/strict';
import {costAwarePairedAudit} from '../src/cost-aware-paired-audit.mjs';
import {SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';

const row=(i,{result='yes',candidate='BUY UP'}={})=>({
 ticker:'KXBTC15M-'+i,at:100,expiresAt:200,resolvedAt:250,status:'RESOLVED',
 outcome:result,outcomeVerification:SETTLEMENT_VERIFICATION,
 engines:{
  original:{action:'BUY UP',side:'up',ask:50,resolved:true},
  upgraded:candidate==='WAIT'?{action:'WAIT'}:{action:candidate,side:candidate==='BUY UP'?'up':'down',ask:50,resolved:true}
 }
});

test('requires prospective, verified, settled matched markets and deduplicates tickers',()=>{
 const x=row(1),bad={...row(2),outcomeVerification:null};
 const report=costAwarePairedAudit([x,x,bad,{...row(3),at:200},{...row(4),resolvedAt:199},{...row(5),status:'PENDING'}]);
 assert.equal(report.matchedOfficialMarkets,1);
 assert.equal(report.sufficientMatchedMarkets,false);
 assert.equal(report.automaticPromotionAllowed,false);
});

test('costs reduce hypothetical PnL and WAIT is an abstention on the same market',()=>{
 const r=costAwarePairedAudit([row(1),row(2,{result:'no',candidate:'WAIT'})],{minimum:2,feeCents:2,slippageCents:1});
 assert.equal(r.matchedOfficialMarkets,2);
 assert.equal(r.sufficientMatchedMarkets,true);
 assert.equal(r.original.trades,2);
 assert.equal(r.original.costStressedPnl,-.06);
 assert.equal(r.candidate.trades,1);
 assert.equal(r.candidate.abstentions,1);
 assert.equal(r.candidate.costStressedPnl,.47);
 assert.equal(r.candidateMinusOriginalPnl,.53);
 assert.equal(r.brierCandidate,null);
 assert.equal(r.automaticPromotionAllowed,false);
});

test('rejects malformed buy direction, prices and fabricated fills',()=>{
 const wrong={...row(1),engines:{...row(1).engines,original:{action:'BUY UP',side:'down',ask:50,resolved:true}}};
 const noFill={...row(2),engines:{...row(2).engines,original:{action:'BUY UP',side:'up',ask:50,resolved:false}}};
 const badCandidate={...row(3),engines:{...row(3).engines,upgraded:{action:'BUY UP',side:'up',ask:NaN,resolved:true}}};
 assert.equal(costAwarePairedAudit([wrong,noFill,badCandidate]).matchedOfficialMarkets,0);
});

test('fee/slippage assumptions are bounded and cannot silently be negative',()=>{
 assert.throws(()=>costAwarePairedAudit([],{feeCents:-1}));
 assert.throws(()=>costAwarePairedAudit([],{slippageCents:Infinity}));
 assert.throws(()=>costAwarePairedAudit([],{minimum:0}));
});

test('drawdown and losses use chronological matched contract order',()=>{
 const r=costAwarePairedAudit([row(3,{result:'yes'}),row(1,{result:'no'}),row(2,{result:'no'})],{feeCents:0,slippageCents:0,minimum:3});
 assert.equal(r.original.trades,3);
 assert.equal(r.original.costStressedPnl,-.5);
 assert.equal(r.original.maxDrawdown,1);
 assert.equal(r.original.losses,2);
});

test('a truncated first-page archive cannot establish sufficient matched evidence',()=>{
 const records=[row(1),row(2),row(3)];
 const partial=costAwarePairedAudit(records,{minimum:2,archiveComplete:false});
 assert.equal(partial.matchedOfficialMarkets,3);
 assert.equal(partial.archiveComplete,false);
 assert.equal(partial.scope,'PARTIAL_FIRST_PAGE');
 assert.equal(partial.sufficientMatchedMarkets,false);
 assert.equal(partial.automaticPromotionAllowed,false);
 assert.match(partial.note,/Incomplete archive/);
 const complete=costAwarePairedAudit(records,{minimum:2,archiveComplete:true});
 assert.equal(complete.sufficientMatchedMarkets,true);
 assert.equal(complete.scope,'COMPLETE_ARCHIVE');
 assert.throws(()=>costAwarePairedAudit(records,{archiveComplete:'false'}));
});

test('quarantines conflicting official outcomes regardless of archive ordering',()=>{
 const first=row(1,{result:'yes'}),conflict=row(1,{result:'no'}),other=row(2);
 for(const rows of [[first,conflict,other],[conflict,other,first]]){
  const report=costAwarePairedAudit(rows,{minimum:1});
  assert.equal(report.conflictingMarketCount,1);
  assert.equal(report.matchedOfficialMarkets,1);
  assert.equal(report.original.trades,1);
  assert.equal(report.sufficientMatchedMarkets,false);
  assert.equal(report.automaticPromotionAllowed,false);
  assert.match(report.note,/Conflicting duplicate contracts quarantined/);
 }
});

test('quarantines different frozen entry prices but accepts exact duplicate records',()=>{
 const first=row(1),changed={...row(1),engines:{...row(1).engines,
  upgraded:{...row(1).engines.upgraded,ask:60}}};
 const report=costAwarePairedAudit([first,first,changed,row(2)],{minimum:1});
 assert.equal(report.conflictingMarketCount,1);
 assert.equal(report.matchedOfficialMarkets,1);
 assert.equal(report.sufficientMatchedMarkets,false);
 const duplicate=costAwarePairedAudit([first,{...first,resolvedAt:300}],{minimum:1});
 assert.equal(duplicate.conflictingMarketCount,0);
 assert.equal(duplicate.matchedOfficialMarkets,1);
 assert.equal(duplicate.sufficientMatchedMarkets,true);
});

test('unverified or malformed duplicate cannot hide behind a verified market',()=>{
 const clean=Array.from({length:100},(_,i)=>row(i));
 assert.equal(costAwarePairedAudit(clean,{minimum:100}).sufficientMatchedMarkets,true);
 const verified=row(100);
 for(const duplicate of [
  {...verified,outcomeVerification:null},
  {...verified,outcome:'no',outcomeVerification:null},
  {...verified,engines:{...verified.engines,original:{...verified.engines.original,ask:NaN}}},
  {...verified,status:'PENDING'}
 ]){
  for(const records of [[...clean,verified,duplicate],[duplicate,verified,...clean]]){
   const report=costAwarePairedAudit(records,{minimum:100});
   assert.equal(report.matchedOfficialMarkets,100);
   assert.equal(report.conflictingMarketCount,1);
   assert.equal(report.sufficientMatchedMarkets,false);
   assert.equal(report.automaticPromotionAllowed,false);
  }
 }
 const singleInvalid=costAwarePairedAudit([{...row(999),outcomeVerification:null}],{minimum:1});
 assert.equal(singleInvalid.matchedOfficialMarkets,0);
 assert.equal(singleInvalid.conflictingMarketCount,0);
});

test('conflicting frozen strategy scores or asset labels cannot inflate matched cost evidence',()=>{
 const original=row('score');original.asset='BTC';original.engines.original.score=80;
 const independent=row('independent');independent.asset='ETH';
 const conflicting=[
  {...original,asset:'ETH'},
  {...original,engines:{...original.engines,original:{...original.engines.original,score:90}}},
  {...original,engines:{...original.engines,upgraded:{...original.engines.upgraded,score:75}}}
 ];
 for(const duplicate of conflicting){
  for(const rows of [[original,duplicate,independent],[duplicate,independent,original]]){
   const audit=costAwarePairedAudit(rows,{minimum:1});
   assert.equal(audit.conflictingMarketCount,1);
   assert.equal(audit.matchedOfficialMarkets,1);
   assert.equal(audit.original.trades,1);
   assert.equal(audit.sufficientMatchedMarkets,false);
   assert.equal(audit.automaticPromotionAllowed,false);
  }
 }
 const identical={...original,engines:{...original.engines,original:{...original.engines.original}}};
 const deduped=costAwarePairedAudit([original,identical],{minimum:1});
 assert.equal(deduped.conflictingMarketCount,0);
 assert.equal(deduped.matchedOfficialMarkets,1);
});
