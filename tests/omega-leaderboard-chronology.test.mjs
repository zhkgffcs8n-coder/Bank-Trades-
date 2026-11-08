import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaLeaderboard} from '../netlify/functions/omega-leaderboard.mjs';
import {scoreOmegaArchive} from '../netlify/functions/omega-settlement-scheduled.mjs';
import {SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';

function store(entries=[]){
 const values=new Map(entries);
 return {
  values,
  async get(key){return values.get(key)??null},
  async setJSON(key,value,options){
   if(options?.onlyIfNew&&values.has(key))throw Error('Duplicate immutable record');
   values.set(key,value);
  },
  async *list({prefix,paginate}){
   assert.equal(paginate,true);
   yield {blobs:[...values.keys()].filter(key=>key.startsWith(prefix)).sort().map(key=>({key}))};
  }
 };
}
function scored(ticker,extra={}){
 return {status:'VERIFIED_SHADOW_SCORE',marketTicker:ticker,roundId:ticker,
  predictedAtMs:95000,recordedAtMs:95000,expiresAtMs:100000,settledAtMs:110000,
  forecastKey:'omega/predictions/v1/'+ticker+'/1',
  scores:[{provider:'omega_consensus',brier:.04},{provider:'kalshi_baseline',brier:.25}],
  ordersAuthorized:false,...extra};
}
test('public OMEGA Brier summary excludes unproven legacy, post-expiry and mismatched archive scores',async()=>{
 const rows=[
  ['BTC-VALID',scored('BTC-VALID')],
  ['ETH-LEGACY',scored('ETH-LEGACY',{expiresAtMs:undefined})],
  ['SOL-LATE',scored('SOL-LATE',{expiresAtMs:90000})],
  ['DOGE-MISMATCH',scored('DOGE-MISMATCH',{forecastKey:'omega/predictions/v1/OTHER/1'})],
  ['ZEC-VALID',scored('ZEC-VALID')]
 ].map(([ticker,record])=>['omega/verified-scores/v1/'+ticker,record]);
 const report=await omegaLeaderboard(store(rows));
 assert.equal(report.inspectedRecords,5);
 assert.equal(report.observedRecords,2);
 assert.equal(report.excludedUnproven,3);
 assert.equal(report.scores.find(x=>x.provider==='omega_consensus').verifiedRounds,2);
 assert.equal(report.scores.find(x=>x.provider==='omega_consensus').meanBrier,.04);
 assert.equal(report.champion,null);
 assert.equal(report.realOrdersAuthorized,false);
});
test('official OMEGA scoring retains frozen expiry needed by the public chronology audit',async()=>{
 const ticker='BTC-FROZEN',recordedAtMs=95000,expiresAtMs=100000;
 const forecast={ticker,status:'SHADOW_RESEARCH',recordedAtMs,expiresAtMs,baseline:.5,
  accepted:[{provider:'gpt',upProbability:.8,observedAtMs:90000},
   {provider:'claude',upProbability:.7,observedAtMs:91000}]};
 const db=store([
  ['omega/predictions/v1/'+ticker+'/1',forecast],
  ['outcomes/'+ticker,{ticker,result:'yes',verification:SETTLEMENT_VERIFICATION,
   settledAt:new Date(110000).toISOString()}]
 ]);
 await scoreOmegaArchive(db);
 const archived=db.values.get('omega/verified-scores/v1/'+ticker);
 assert.equal(archived.expiresAtMs,expiresAtMs);
 assert.equal(archived.predictedAtMs,recordedAtMs);
 const report=await omegaLeaderboard(db);
 assert.equal(report.observedRecords,1);
 assert.equal(report.excludedUnproven,0);
 assert.equal(report.scores.find(x=>x.provider==='omega_consensus').verifiedRounds,1);
 assert.equal(report.realOrdersAuthorized,false);
});

test('OMEGA scoring waits for official settlement time instead of trusting a future-dated label',async()=>{
 const ticker='BTC-FUTURE-LABEL',recordedAtMs=95000,expiresAtMs=100000,settledAtMs=121000;
 const forecast={ticker,status:'SHADOW_RESEARCH',recordedAtMs,expiresAtMs,baseline:.5,
  accepted:[{provider:'gpt',upProbability:.8,observedAtMs:90000},
   {provider:'claude',upProbability:.7,observedAtMs:91000}]};
 const db=store([
  ['omega/predictions/v1/'+ticker+'/1',forecast],
  ['outcomes/'+ticker,{ticker,result:'yes',verification:SETTLEMENT_VERIFICATION,
   settledAt:new Date(settledAtMs).toISOString()}]
 ]);
 await scoreOmegaArchive(db,{nowMs:settledAtMs-1});
 assert.equal(db.values.has('omega/verified-scores/v1/'+ticker),false);
 await scoreOmegaArchive(db,{nowMs:settledAtMs});
 const scored=db.values.get('omega/verified-scores/v1/'+ticker);
 assert.equal(scored?.status,'VERIFIED_SHADOW_SCORE');
 assert.equal(scored.settledAtMs,settledAtMs);
 assert.equal(scored.ordersAuthorized,false);
});
