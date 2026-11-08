import test from 'node:test';
import assert from 'node:assert/strict';
import {observeScalpHunter,learnScalpHunter,forecastScalpHunter,scoreScalpHunter} from '../src/scalp-hunter.mjs';

const quote=(ticker,at)=>({ticker,at,yes:{price:.005,size:4},no:{price:.99,size:4}});
const setup=(ticker,at)=>({ticker,at,expiresAt:at+300000,spread:.005,imbalance:.5,acceleration:.03});

test('learns executable one-percent entries only from distinct completed rounds',()=>{
 let tape=[];
 for(let i=0;i<12;i++){
  const at=i*1000000,ticker='ROUND'+i;
  tape=observeScalpHunter(tape,setup(ticker,at),quote(ticker,at));
  tape=observeScalpHunter(tape,{...setup(ticker,at+60000),acceleration:0},
   {...quote(ticker,at+60000),yes:{price:.2,size:5},no:{price:.79,size:5}});
 }
 const at=12000000,ticker='NEXT';
 const profile=learnScalpHunter(tape,at);
 const idea=forecastScalpHunter(setup(ticker,at),quote(ticker,at),profile).A;
 assert.ok(Math.abs(idea.ask-.01)<1e-9);
 assert.ok(Math.abs(idea.target-.20)<1e-9);
 assert.equal(idea.sampleSize,12);
 assert.equal(idea.horizonSeconds,60);
 assert.equal(forecastScalpHunter(setup(ticker,at),{...quote(ticker,at),no:{price:.99,size:.5}},profile).A,null);
 assert.equal(forecastScalpHunter(setup(ticker,at),quote(ticker,at),learnScalpHunter(tape,11060000)).A,null);
 const pending=observeScalpHunter([],setup(ticker,at),quote(ticker,at),{A:idea});
 const exit={...quote(ticker,at+60000),yes:{price:.2,size:.5}};
 assert.equal(scoreScalpHunter(pending,exit)[0].status,'INSUFFICIENT_EXIT_DEPTH');
 assert.equal(scoreScalpHunter(pending,{...exit,ticker:'OTHER'}).length,0);
});

test('learning accepts collector jitter without reading observations at or after prediction time',()=>{
 const ticker='JITTER';
 const entry=observeScalpHunter([],setup(ticker,10000),quote(ticker,10000));
 const tape=observeScalpHunter(entry,setup(ticker,68000),quote(ticker,68000));
 assert.equal(Object.keys(learnScalpHunter(tape,68000)).length,0);
 assert.ok(Object.keys(learnScalpHunter(tape,68001)).length>0);
 const checks={};
 forecastScalpHunter(setup(ticker,10000),quote(ticker,10000),{},checks);
 assert.ok(checks.A.some(check=>check.reason==='INSUFFICIENT_COMPARABLE_ROUNDS'));
});

test('persistent comparable-round archive deduplicates and keeps only observations known before forecast',async()=>{
 const {collectComparableRounds,mergeComparableRounds,profileComparableRounds}=await import('../src/scalp-hunter.mjs');
 const ticker='ARCHIVE';
 const start=observeScalpHunter([],setup(ticker,10000),quote(ticker,10000));
 const tape=observeScalpHunter(start,setup(ticker,70000),{...quote(ticker,70000),yes:{price:.2,size:5},no:{price:.79,size:5}});
 const incoming=collectComparableRounds(tape,71000);
 const archive=mergeComparableRounds({},incoming,71000);
 const id=Object.keys(archive)[0];
 assert.equal(mergeComparableRounds(archive,incoming,72000)[id].length,1);
 assert.equal(mergeComparableRounds(archive,{},72000)[id].length,1);
 assert.equal(mergeComparableRounds({},incoming,70000)[id].length,0);
 const experimental={};
 const ideas=forecastScalpHunter(setup('NEXT',72000),quote('NEXT',72000),profileComparableRounds(archive),{},experimental);
 assert.equal(ideas.A,null);
 assert.equal(experimental.A.mode,'EXPERIMENTAL_SHADOW');
 assert.equal(experimental.A.sampleSize,1);
});

test('VOLT ranks supported setups by net return relative to observed downside',()=>{
 const ticker='NEXT',at=12000000;
 const snapshot={...setup(ticker,at),spread:.02,velocity:.04,breakout:.03};
 const depth={ticker,at,yes:{price:.83,size:5},no:{price:.15,size:5}};
 const profile={
  'B/UP/8/60':{n:12,wins:9,meanNet:.07,meanMove:.12,downside:.025},
  'B/UP/8/120':{n:12,wins:9,meanNet:.08,meanMove:.12,downside:.08}
 };
 const idea=forecastScalpHunter(snapshot,depth,profile).B;
 assert.equal(idea.ask,.85);
 assert.equal(idea.horizonSeconds,60);
 assert.ok(Math.abs(idea.estimatedNet-.06)<1e-9);
 assert.equal(forecastScalpHunter(snapshot,depth,{'B/UP/8/60':{...profile['B/UP/8/60'],meanMove:.04}}).B,null);
});
