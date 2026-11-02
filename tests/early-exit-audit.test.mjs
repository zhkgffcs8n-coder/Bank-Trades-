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

test('does not invent a completed last-quote exit while round remains open',()=>{
 const r=earlyExitAudit([round([{t:100,ask:.5,bid:.48},{t:200,ask:.58,bid:.55}])],{asOf:500});
 assert.equal(r.trades,0);
});
test('rejects a stale last quote at expiry rather than assuming a sale',()=>{
 const r=earlyExitAudit([{id:'old',signalAt:100,expiresAt:300000,quotes:[{t:100,ask:.5,bid:.48},{t:200,ask:.6,bid:.55}]}],{asOf:300000});
 assert.equal(r.trades,0);
});
test('never reads future quotes or entries after the contract expired',()=>{
 const future=earlyExitAudit([round([{t:100,ask:.5,bid:.48},{t:800,ask:.85,bid:.8}])],{asOf:500});
 assert.equal(future.trades,0);
 const late=earlyExitAudit([round([{t:1000,ask:.5,bid:.48},{t:1100,ask:.85,bid:.8}],1000)],{asOf:1200});
 assert.equal(late.trades,0);
});

test('quarantines conflicting same-timestamp bids rather than choosing a profitable quote by ordering',()=>{
 const quotes=[{t:100,ask:.5,bid:.48},{t:200,ask:.82,bid:.8},{t:200,ask:.5,bid:.2}];
 for(const ordered of [quotes,[...quotes].reverse()]){
  const result=earlyExitAudit([round(ordered)]);
  assert.equal(result.trades,0);
  assert.equal(result.quarantinedQuoteRounds,1);
 }
});

test('identical repeated quote timestamps count once and preserve the same exit',()=>{
 const quotes=[{t:100,ask:.5,bid:.48},{t:200,ask:.82,bid:.8}];
 const result=earlyExitAudit([round([...quotes,quotes[1],quotes[0]])]);
 assert.equal(result.trades,1);
 assert.equal(result.quarantinedQuoteRounds,0);
 assert.ok(Math.abs(result.netPnlPerOneContract-.27)<1e-12);
});

test('contradictory duplicate round archives are quarantined in either order',()=>{
 const validRound=round([{t:100,ask:.5,bid:.48},{t:200,ask:.82,bid:.8}]);
 const conflicting={...validRound,quotes:[{t:100,ask:.5,bid:.48},{t:200,ask:.6,bid:.25}]};
 for(const rows of [[validRound,conflicting],[conflicting,validRound]]){
  const result=earlyExitAudit(rows);
  assert.equal(result.trades,0);
  assert.equal(result.conflictingRoundCount,1);
 }
 const identical=earlyExitAudit([validRound,{...validRound,quotes:[...validRound.quotes].reverse()}]);
 assert.equal(identical.trades,1);
 assert.equal(identical.conflictingRoundCount,0);
});

test('malformed pre-expiry quote and missing expiry cannot fabricate an exit',()=>{
 const quotes=[{t:100,ask:.5,bid:.48},{t:200,ask:.82,bid:.8}];
 const malformed=earlyExitAudit([round([...quotes,{t:200,ask:.3,bid:.6}])]);
 assert.equal(malformed.trades,0);
 assert.equal(malformed.quarantinedQuoteRounds,1);
 assert.equal(earlyExitAudit([{id:'no-expiry',signalAt:100,quotes}]).trades,0);
});
