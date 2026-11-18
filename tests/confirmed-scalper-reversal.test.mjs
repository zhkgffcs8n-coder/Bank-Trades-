import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import {replayChampionScalper} from '../src/champion-scalper-replay.mjs';
const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function confirmedScalpReversal('),source.indexOf('function scalpExitEvidence('));
const confirm=runInNewContext(code+'\nconfirmedScalpReversal');
test('requires distinct fresh opposite evidence and Kalshi agreement',()=>{
 const p={ticker:'round',side:'up'},q={up:{ask:40,bid:39},down:{ask:61,bid:60}},now=100000;
 const e={ticker:'round',source:'tradingview',direction:'down',at:98000};
 const first=confirm(p,q,e,null,now);assert.equal(first.confirmed,false);
 assert.equal(confirm(p,q,e,first.reading,now).confirmed,false);
 assert.equal(confirm(p,q,{...e,at:99000},first.reading,now).confirmed,true);
 for(const invalid of [{...e,at:1},{...e,ticker:'other'},{...e,direction:'up'}])assert.equal(confirm(p,q,invalid,first.reading,now).confirmed,false);
 assert.equal(confirm(p,{up:{ask:70},down:{ask:31,bid:30}},{...e,at:99000},first.reading,now).confirmed,false);
});
test('dip, profit and timer alone keep HOLD; confirmed reversal freezes exit',()=>{
 let p={ticker:'round',side:'up',entry:57,exit:null};
 for(const bid of [49,76]){
  const result=replayChampionScalper({ticker:'round',secondsLeft:30,side:'mixed',strong:false,quotes:{up:{ask:bid+1,bid}},exitPolicy:'confirmed-reversal'},p);
  assert.equal(result.action,'HOLD UP');assert.equal(result.position.exit,null);p=result.position;
 }
 const result=replayChampionScalper({ticker:'round',secondsLeft:200,quotes:{up:{ask:40,bid:39}},exitPolicy:'confirmed-reversal',reversalConfirmed:true},p);
 assert.equal(result.position.exit,'SELL FAST');assert.equal(result.position.exitBid,39);
});
