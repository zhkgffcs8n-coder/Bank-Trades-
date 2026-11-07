import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validCollectorQuote,parseCollectorPrice} from '../src/collector-quote.mjs';

const good={yesBid:.48,yesAsk:.50,noBid:.49,noAsk:.51};

test('collector accepts a finite non-crossed binary market quote and zero bids',()=>{
 assert.equal(validCollectorQuote(good),true);
 assert.equal(validCollectorQuote({...good,yesBid:0,noBid:0}),true);
});

test('collector rejects missing, malformed, crossed and out-of-range quote fields',()=>{
 for(const [field,value] of [
  ['yesBid',-0.01],['noBid',-0.01],['yesAsk',0],['noAsk',0],
  ['yesAsk',1],['noAsk',1],['yesBid',1.1],['noBid',1.1],
  ['yesBid',.60],['noBid',.70],['yesAsk',1.01],['noAsk',1.01],
  ['yesAsk',NaN],['noBid',Infinity],['noAsk',null],['yesBid','0.48']
 ]){
  assert.equal(validCollectorQuote({...good,[field]:value}),false,field+'='+String(value));
 }
 for(const field of Object.keys(good)){
  const incomplete={...good};delete incomplete[field];
  assert.equal(validCollectorQuote(incomplete),false,'missing '+field);
 }
 assert.equal(validCollectorQuote(null),false);
});

test('binary collector quote rejects contradictory complementary books but allows zero bids',()=>{
 const base={yesBid:.44,yesAsk:.45,noBid:.54,noAsk:.55};
 assert.equal(validCollectorQuote(base),true);
 assert.equal(validCollectorQuote({...base,yesBid:0,noBid:0}),true);
 assert.equal(validCollectorQuote({...base,yesBid:.60,noBid:.50,yesAsk:.61,noAsk:.51}),false,
  'YES and NO bids cannot exceed the full binary payout');
 assert.equal(validCollectorQuote({...base,yesBid:.10,noBid:.10,yesAsk:.20,noAsk:.20}),false,
  'YES and NO asks cannot both be below the full binary payout');
});

test('scheduled collector selects only strictly validated contracts before archiving or coverage',()=>{
 const collector=readFileSync(new URL('../netlify/functions/market-collector.mjs',import.meta.url),'utf8');
 const selector=readFileSync(new URL('../src/select-eligible-round.mjs',import.meta.url),'utf8');
 assert.match(collector,/import \{selectEligibleRound\} from '\.\.\/\.\.\/src\/select-eligible-round\.mjs'/);
 assert.match(selector,/import \{validCollectorQuote,parseCollectorPrice\} from '\.\/collector-quote\.mjs'/);
 assert.match(selector,/validCollectorQuote\(\{yesBid,yesAsk,noBid,noAsk\}\)/);
 assert.match(selector,/typeof m\.ticker==='string'&&m\.ticker\.trim\(\)/);
 const validation=collector.indexOf('const selection=selectEligibleRound(markets,now)');
 const noSelection=collector.indexOf('if(!selection)');
 const archive=collector.indexOf("const sampleKey='samples/'");
 const coverage=collector.indexOf('collection.sampled.add(asset)');
 assert.ok(validation>0&&noSelection>validation&&archive>noSelection&&coverage>archive);
});

test('quote parser rejects blank and malformed dollar prices instead of coercing zero',()=>{
 assert.equal(parseCollectorPrice({yes_bid_dollars:'0.4800'},'yes_bid'),.48);
 assert.equal(parseCollectorPrice({yes_bid:48},'yes_bid'),.48);
 assert.equal(parseCollectorPrice({yes_bid:'48'},'yes_bid'),.48);
 for(const bad of ['', ' ', 'NaN', 'Infinity', '0x30', '5e-1', false, true, {}, -1]){
  const value=parseCollectorPrice({yes_bid_dollars:bad},'yes_bid');
  if(bad===-1)assert.equal(value,-1);
  else assert.equal(Number.isNaN(value),true,'malformed '+String(bad));
 }
 assert.equal(Number.isNaN(parseCollectorPrice({},'yes_bid')),true);
 assert.equal(Number.isNaN(parseCollectorPrice({yes_bid_dollars:'',yes_bid:48},'yes_bid')),true);
});

test('scheduled collector normalizes public quote fields through strict parser',()=>{
 const collector=readFileSync(new URL('../netlify/functions/market-collector.mjs',import.meta.url),'utf8');
 assert.match(collector,/const price=parseCollectorPrice;/);
});
