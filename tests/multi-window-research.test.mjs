import test from 'node:test';
import assert from 'node:assert/strict';
import {multiWindowMomentum,learningReport} from '../src/research-model.mjs';
test('multi-window momentum uses actual timestamped history',()=>{
 const now=600000,rows=Array.from({length:11},(_,i)=>({t:i*60000,yesMid:.4+i*.01}));
 const r=multiWindowMomentum(rows,now);
 assert.equal(r.sampleCount,11);
 for(const w of r.windows){assert.equal(w.available,true);assert.ok(Math.abs(w.change-w.minutes*.01)<1e-9);}
});
test('multi-window momentum never invents missing windows',()=>{
 const r=multiWindowMomentum([{t:60000,yesMid:.5}],60000);
 assert.ok(r.windows.every(w=>!w.available&&w.change===null));
});
test('multi-window momentum excludes future observations',()=>{
 const r=multiWindowMomentum([{t:0,yesMid:.3},{t:60000,yesMid:.4},{t:120000,yesMid:.9}],60000);
 assert.equal(r.asOf,60000);
 assert.equal(r.windows[0].change,.4-.3);
});
