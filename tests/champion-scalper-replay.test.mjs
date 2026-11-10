import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {replayChampionScalper} from '../src/champion-scalper-replay.mjs';

const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const scalp=source.slice(source.indexOf('function scalp(market'),source.indexOf('const state=box.querySelector'));
for(const side of ['up','down']){
 for(const exit of ['profit','loss','clock','flip']){
  test(`shadow replay matches dashboard for ${side} / ${exit}`,()=>{
   const positions=new Map();
   let displayed;
   const browser=runInNewContext(scalp+'\nscalp',{positions,selectedCoin:'BTC',
    showScalp(message,exitSide){
     const label=message.split(' · ')[0].replace(' SETUP','');
     displayed=exitSide?label+' '+exitSide.toUpperCase():label;
    }});
   const base={ticker:'KXBTC15M-example',secondsLeft:200,side,strong:true,
    quotes:{up:{ask:60,bid:59},down:{ask:60,bid:59}}};
   const last={...base,secondsLeft:exit==='clock'?90:150,side:exit==='flip'?(side==='up'?'down':'up'):side,
    quotes:{...base.quotes,[side]:{ask:60,bid:exit==='profit'?74:exit==='loss'?55:59}}};
   let previous;
   for(const tick of [{...base,strong:false},base,{...base,strong:false},last,base]){
    browser({ticker:tick.ticker},tick.secondsLeft,tick.side,tick.strong,tick.quotes);
    const result=replayChampionScalper(tick,previous);
    assert.equal(result.action,displayed);
    assert.deepEqual(result.position,positions.has('BTC')?JSON.parse(JSON.stringify(positions.get('BTC'))):null);
    previous=result.position;
   }
  });
 }
}
