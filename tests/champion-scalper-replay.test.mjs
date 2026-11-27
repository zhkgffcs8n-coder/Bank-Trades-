import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {replayChampionScalper} from '../src/champion-scalper-replay.mjs';

const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const cost=source.match(/function estimatedCost[^\n]+/)[0];
const entryDisplay=source.slice(source.indexOf('const scalpEntryVisibleUntil='),source.indexOf('function scalpQuoteStatus('));
const scalp=source.slice(source.indexOf('function scalp(market'),source.indexOf('// Each coin quote is delivered'));
for(const side of ['up','down']){
 for(const exit of ['profit','loss','clock','flip','80% target','88% target','79% target','20% return target','fees']){
  test(`shadow replay matches dashboard for ${side} / ${exit}`,()=>{
   const positions=new Map();
   let displayed;
   const voice=[];
   const prices={};
   let now=Date.now();
   const browser=runInNewContext(cost+'\n'+entryDisplay+scalp+'\nscalp',{Date:class extends Date {static now(){return now;}},setTimeout(){},requestAnimationFrame(callback){callback();},refreshScalpExit(){},positions,reversalReadings:new Map(),confirmedScalpReversal:(_p,_q,e)=>({confirmed:!!e,reading:null}),persistScalpPosition(){},refreshBtcScalpBook(){},selectedCoin:'BTC',paintScalpPrices(position,exit){prices.entry=position.entry;prices.cash=exit?position.exitBid:undefined;},window:{dispatchEvent:event=>voice.push(event.detail)},
    CustomEvent:class {constructor(_type,{detail}){this.detail=detail;}},
    showScalp(message,exitSide){
     const label=message.split(' · ')[0].replace(/ \d+\.\d+% ASK$/,'');
     displayed=exitSide?label+' '+exitSide.toUpperCase():label;
    }});
   const target=exit.endsWith('target');
   const entry=(exit==='79% target'||exit==='20% return target')?63:exit==='88% target'||exit==='fees'?78:target?67:60;
   const base={ticker:'KXBTC15M-example',secondsLeft:200,side,strong:true,exitPolicy:'confirmed-reversal',
    quotes:{up:{ask:entry,bid:entry-1},down:{ask:entry,bid:entry-1}}};
   const last={...base,reversalConfirmed:!target,secondsLeft:exit==='clock'?90:150,side:exit==='flip'?(side==='up'?'down':'up'):side,
    quotes:{...base.quotes,[side]:{ask:target?81:74,bid:exit==='20% return target'?75.6:exit==='79% target'?79:exit==='88% target'?88:target||exit==='fees'?80:exit==='profit'?74:exit==='loss'?55:59}}};
   let previous;
   const beforeTarget=target?{...last,quotes:{...last.quotes,[side]:{ask:80,bid:Math.min(80,entry*1.2)-0.01}}}:{...base,strong:false};
   for(const [index,tick] of [{...base,strong:false},base,beforeTarget,last,base].entries()){
    now+=1000;
    browser({ticker:tick.ticker},tick.secondsLeft,tick.side,tick.strong,tick.quotes,undefined,tick.reversalConfirmed);
    const result=replayChampionScalper(tick,previous);
    assert.equal(displayed,index>=1&&index<=3?'BUY '+side.toUpperCase():result.action);
    const {expiresAt, entryAt, exitAt, ...browserSignal} = positions.get('BTC') ?? {};
    assert.deepEqual(result.position, expiresAt == null ? null : browserSignal);
    previous=result.position;
    if(index===1){
     browser({ticker:tick.ticker},tick.secondsLeft,tick.side,tick.strong,
      {...tick.quotes,[side]:{ask:89,bid:88}});
     assert.equal(displayed,'BUY '+side.toUpperCase());
     assert.equal(positions.get('BTC').exit,null);
     assert.deepEqual(voice.map(call=>call.stage),['entry']);
    }
   }
   if(exit!=='profit'&&!target){
    assert.deepEqual(voice.map(call=>call.stage),['entry']);
    assert.equal(previous.exit,null);
    return;
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

test('official dashboard scope can read fractional depth and estimate exit costs',()=>{
 const helpers=runInNewContext(source.replace('const box=', 'return {bestBid,estimatedCost}; const box='));
 assert.equal(helpers.bestBid({no_dollars:[['0.82','0.5']]},'no',0).price,.82);
 assert.ok(.82-.63-helpers.estimatedCost(.63)-helpers.estimatedCost(.82)>0);
});
