import test from 'node:test';
import assert from 'node:assert/strict';
import {pairedShadow,engineBTrend,resolvePairedShadow} from '../src/paired-shadow.mjs';
import {SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';

const now=Date.parse('2026-10-31T11:30:00Z');
const ticker='KXBTC15M-TEST';
const market={ticker,yes_bid_dollars:'0.50',yes_ask_dollars:'0.52',no_bid_dollars:'0.46',no_ask_dollars:'0.48',expected_expiration_time:new Date(now+300000).toISOString()};
const samples=values=>values.map((yesMid,i)=>({ticker,t:now-30000-(values.length-i-1)*60000,yesMid}));
const verified={ticker,result:'yes',verification:SETTLEMENT_VERIFICATION};

test('paired shadow freezes independent A and B on same quote and timestamp, never authorizes a trade',()=>{
 const rows=samples([.40,.44,.48,.52]);
 const x=pairedShadow(market,rows,now);
 assert.equal(x.status,'PENDING');assert.equal(x.at,now);assert.equal(x.ticker,ticker);
 assert.equal(x.quote.yesAsk,.52);assert.equal(x.engines.A.action,'BUY UP');
 assert.equal(x.engines.B.action,'BUY UP');assert.equal(x.hybrid.researchConsensus,'UP');
 assert.equal(x.hybrid.action,'WAIT');assert.equal(x.hybrid.authorized,false);
 assert.equal(x.costs.feePerContract,null);assert.equal(x.costs.slippagePerContract,null);
 assert.equal(x.costs.costAdjustedPnl,null);
});

test('missing B prediction, stale sample, and invalid quote force WAIT with diagnostic',()=>{
 const tooShort=pairedShadow(market,samples([.40,.48]),now);
 assert.equal(tooShort.engines.A.action,'BUY UP');
 assert.equal(tooShort.engines.B.action,'WAIT');
 assert.equal(tooShort.hybrid.researchConsensus,null);
 assert.match(tooShort.hybrid.reason,/B: fewer than four/);
 const stale=samples([.40,.44,.48,.52]).map(x=>({...x,t:x.t-180000}));
 const stalePair=pairedShadow(market,stale,now);
 assert.equal(stalePair.hybrid.researchConsensus,null);
 assert.match(stalePair.hybrid.reason,/stale|older than/i);
 const bad=pairedShadow({...market,yes_ask_dollars:'NaN'},samples([.40,.44,.48,.52]),now);
 assert.equal(bad.hybrid.researchConsensus,null);
 assert.match(bad.hybrid.reason,/Invalid paired quote/);
 const wrong=pairedShadow(market,samples([.40,.44,.48,.52]).map(x=>({...x,ticker:'OTHER'})),now);
 assert.equal(wrong.hybrid.researchConsensus,null);
});

test('A/B disagreement never becomes a research consensus',()=>{
 const x=pairedShadow(market,samples([.20,.28,.36,.44,.52,.60,.53,.46]),now);
 assert.equal(x.engines.A.action,'BUY UP');
 assert.equal(x.engines.B.action,'BUY DOWN');
 assert.equal(x.hybrid.researchConsensus,null);
 assert.match(x.hybrid.reason,/disagree/);
});

test('settlement requires exact trusted outcome; keeps gross and unavailable net distinct',()=>{
 const row=pairedShadow(market,samples([.40,.44,.48,.52]),now);
 assert.equal(resolvePairedShadow(row,verified,now+299999),null,'no pre-expiry settlement even with a forged verified label');
 assert.equal(resolvePairedShadow(row,verified,NaN),null,'invalid resolution clock is not evidence');
 assert.equal(resolvePairedShadow(row,{ticker,result:'yes'},now+400000),null);
 assert.equal(resolvePairedShadow(row,{...verified,ticker:'OTHER'},now+400000),null);
 const settled=resolvePairedShadow(row,verified,now+400000);
 assert.equal(settled.status,'RESOLVED');assert.equal(settled.settlement.verified,true);
 assert.equal(settled.evaluation.A.correct,true);assert.equal(settled.evaluation.B.correct,true);
 assert.equal(settled.evaluation.hybrid.grossPnl,.48);
 assert.equal(settled.evaluation.hybrid.netPnl,null);
 assert.equal(resolvePairedShadow(settled,verified,now+500000),null);
});

test('B is a separate trend rule rather than copying A or committee vote',()=>{
 const x=engineBTrend(market,samples([.40,.44,.48,.52]),now);
 assert.equal(x.action,'BUY UP');assert.match(x.reason,/short-window trend/);
});

test('B prefers newest observed quote when minute bucket has conflicting duplicates',()=>{
 const rows=samples([.40,.45,.50,.35]);
 const stale={...rows.at(-1),yesMid:.35,observedAt:now-20000};
 const newest={...rows.at(-1),yesMid:.55,observedAt:now-10000};
 for(const candidate of [[...rows.slice(0,-1),stale,newest],[...rows.slice(0,-1),newest,stale]]){
  const result=engineBTrend(market,candidate,now);
  assert.equal(result.action,'BUY UP');
  assert.equal(result.side,'up');
 }
});

test('A and B share deduplicated pre-freeze samples; future quote cannot create agreement',()=>{
 const rows=samples([.40,.44,.48,.52]);
 const future={...rows.at(-1),yesMid:.70,observedAt:now+1000};
 const pair=pairedShadow(market,[...rows,future],now);
 assert.equal(pair.at,now);
 assert.equal(pair.engines.A.action,'BUY UP');
 assert.equal(pair.engines.B.action,'BUY UP');
 assert.equal(pair.hybrid.action,'WAIT');
 assert.equal(pair.hybrid.authorized,false);
 assert.equal(pair.engines.B.askCents,52);
});
