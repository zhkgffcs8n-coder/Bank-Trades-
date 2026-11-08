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
