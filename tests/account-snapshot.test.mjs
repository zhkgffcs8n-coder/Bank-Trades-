import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountSnapshot} from '../netlify/functions/kalshi-account-snapshot.mjs';
test('account snapshot exposes paginated data without credentials or invented P/L',async()=>{
 const handler=createAccountSnapshot({getOwner:async()=>({id:'owner1234'}),getRuntime:async()=>({client:async()=>({snapshot:async()=>({at:1,balanceCents:500,positions:[{ticker:'BTC-ROUND',position_fp:'0.50'}],orders:[],fills:[]})})})});
 const r=await handler(new Request('https://site.test/account')),d=await r.json();assert.equal(r.status,200);assert.equal(d.balance,500);assert.equal(d.positions[0].realizedPnlDollars,null);assert.equal(d.reconciled,false);assert.equal(d.positionsHaveMore,false);
});
test('non-owners cannot read account balances',async()=>{
 let accessed=false;const handler=createAccountSnapshot({getOwner:async()=>{throw Object.assign(Error('Owner access required'),{status:403})},getRuntime:async()=>{accessed=true}});
 assert.equal((await handler(new Request('https://site.test/account'))).status,403);assert.equal(accessed,false);
});
