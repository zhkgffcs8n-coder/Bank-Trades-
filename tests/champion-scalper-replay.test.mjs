import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {replayChampionScalper} from '../src/champion-scalper-replay.mjs';

const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const scalp=source.slice(source.indexOf('function scalp(market'),source.indexOf('// Each coin quote is delivered'));
for(const side of ['up','down']){
 for(const exit of ['profit','loss','clock','flip','80% target']){
  test(`shadow replay matches dashboard for ${side} / ${exit}`,()=>{
   const positions=new Map();
   let displayed;
   const voice=[];
   const prices={};
   const browser=runInNewContext(scalp+'\nscalp',{positions,reversalReadings:new Map(),confirmedScalpReversal:(_p,_q,e)=>({confirmed:!!e,reading:null}),persistScalpPosition(){},refreshBtcScalpBook(){},selectedCoin:'BTC',paintScalpPrices(position,bid){prices.entry=position.entry;prices.cash=position.exitBid??bid;},window:{dispatchEvent:event=>voice.push(event.detail)},
    CustomEvent:class {constructor(_type,{detail}){this.detail=detail;}},
    showScalp(message,exitSide){
     const label=message.split(' · ')[0].replace(' SETUP','');
     displayed=exitSide?label+' '+exitSide.toUpperCase():label;
    }});
   const target=exit==='80% target';
   const entry=target?44:60;
   const base={ticker:'KXBTC15M-example',secondsLeft:200,side,strong:true,exitPolicy:'confirmed-reversal',
    quotes:{up:{ask:entry,bid:entry-1},down:{ask:entry,bid:entry-1}}};
   const last={...base,reversalConfirmed:!target,secondsLeft:exit==='clock'?90:150,side:exit==='flip'?(side==='up'?'down':'up'):side,
    quotes:{...base.quotes,[side]:{ask:target?81:74,bid:target?80:exit==='profit'?74:exit==='loss'?55:59}}};
   let previous;
   const beforeTarget=target?{...last,quotes:{...last.quotes,[side]:{ask:80,bid:79.99}}}:{...base,strong:false};
   for(const tick of [{...base,strong:false},base,beforeTarget,last,base]){
    browser({ticker:tick.ticker},tick.secondsLeft,tick.side,tick.strong,tick.quotes,undefined,tick.reversalConfirmed);
    const result=replayChampionScalper(tick,previous);
    assert.equal(result.action,displayed);
    assert.deepEqual(result.position,positions.has('BTC')?JSON.parse(JSON.stringify(positions.get('BTC'))):null);
    previous=result.position;
   }
   assert.deepEqual(voice.map(call=>call.stage),['entry','exit']);
   assert.equal(voice[0].entry,entry);
   if(target)assert.equal(voice[1].action,'TAKE PROFIT');
   assert.equal(voice[1].exitBid,last.quotes[side].bid);
   assert.equal(prices.entry,voice[0].entry);
   assert.equal(prices.cash,voice[1].exitBid);
  });
 }
}
