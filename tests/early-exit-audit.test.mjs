import test from 'node:test';
import assert from 'node:assert/strict';
import {earlyExitAudit} from '../src/early-exit-audit.mjs';
const round=(quotes,signalAt=100)=>({id:'BTC-round-1',signalAt,expiresAt:1000,quotes});
test('records 40-60 cent entry followed by executable 80 cent bid',()=>{
 const r=earlyExitAudit([round([{t:100,ask:.5,bid:.48},{t:200,ask:.82,bid:.8}])]);
 assert.equal(r.trades,1);assert.equal(r.wins,1);assert.ok(Math.abs(r.netPnlPerOneContract-.27)<1e-12);
});
test('uses sell bid, not optimistic last ask',()=>{
 const r=earlyExitAudit([round([{t:100,ask:.5,bid:.48},{t:200,ask:.85,bid:.55}])]);
 assert.equal(r.trades,1);assert.ok(Math.abs(r.netPnlPerOneContract-.02)<1e-12);
});
test('does not select an entry after seeing future prices',()=>{
 const r=earlyExitAudit([round([{t:100,ask:.75,bid:.7},{t:200,ask:.5,bid:.48},{t:300,ask:.85,bid:.8}])]);
 assert.equal(r.trades,0);
});
test('records stop-loss and its full cost',()=>{
 const r=earlyExitAudit([round([{t:100,ask:.5,bid:.48},{t:200,ask:.26,bid:.25}])]);
 assert.equal(r.losses,1);assert.ok(Math.abs(r.netPnlPerOneContract+.28)<1e-12);
});
test('no exit quotes means no invented profit',()=>{
 const r=earlyExitAudit([round([{t:100,ask:.5,bid:.48}])]);
 assert.equal(r.trades,0);
});
