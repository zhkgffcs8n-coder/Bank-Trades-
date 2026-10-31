import test from 'node:test';
import assert from 'node:assert/strict';
import {matchLiveObservation} from '../src/paired-live-match.mjs';
const pair={ticker:'KXBTC15M-TEST',at:1000,status:'RESOLVED',settlement:{verified:true,result:'yes'},
 quote:{yesAsk:.52,noAsk:.48,yesBid:.50,noBid:.46},hybrid:{researchConsensus:'UP'}};
const live={ticker:pair.ticker,at:1000,status:'RESOLVED',outcome:'yes',outcomeVerification:'STRICT_FINALIZED_BINARY_V1',action:'BUY UP',
 quote:{yesAsk:52,noAsk:48,yesBid:50,noBid:46}};
test('exact timestamp, ticker, quote and verified settlement can be matched without profit attribution',()=>{
 const x=matchLiveObservation(pair,live);
 assert.equal(x.status,'EXACT_VERIFIED_MATCH');assert.equal(x.costAdjustedPnl,null);
 assert.equal(x.tradeAuthorization,false);assert.equal(x.liveAction,'BUY UP');
});
test('never credit different ticker, timestamp or quote to paired Primal',()=>{
 for (const changed of [{...live,ticker:'OTHER'},{...live,at:1001},
  {...live,quote:{...live.quote,yesAsk:53}},{...live,quote:{...live.quote,noBid:null}}]) {
  assert.equal(matchLiveObservation(pair,changed).status,'UNMATCHED');
 }
});
test('requires separately recorded live observation and matching verified outcome',()=>{
 assert.equal(matchLiveObservation(pair,null).status,'NO_LIVE_OBSERVATION');
 assert.equal(matchLiveObservation({...pair,status:'PENDING'},live).status,'PENDING_VERIFICATION');
 assert.equal(matchLiveObservation(pair,{...live,outcome:'no'}).status,'PENDING_VERIFICATION');
 assert.equal(matchLiveObservation(pair,{...live,status:'PENDING'}).status,'PENDING_VERIFICATION');
 assert.equal(matchLiveObservation({...pair,quote:{...pair.quote,yesBid:0}},{...live,quote:{...live.quote,yesBid:null}}).status,'UNMATCHED');
 assert.equal(matchLiveObservation(pair,{...live,outcomeVerification:null}).status,'PENDING_VERIFICATION');
 assert.equal(matchLiveObservation(pair,{...live,outcomeVerification:'LEGACY_UNVERIFIED'}).status,'PENDING_VERIFICATION');
});
