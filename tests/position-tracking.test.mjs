import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync('premium.js','utf8');
const fn=source.slice(source.indexOf('function positionAdvice('),source.indexOf('window.bankPositionAdvice='));
const ctx={Date,Number,String,Math,price:(m,k)=>m[k],expiry:m=>m.expires};vm.createContext(ctx);vm.runInContext(fn,ctx);
function advice(side,entry,bid,extra={}){return ctx.positionAdvice({side,entry,qty:10,fees:.1,ticker:'round',...extra},{ticker:'round',expires:Date.now()+120000,yes_bid:bid,yes_ask:bid+1,no_bid:bid,no_ask:bid+1},Date.now());}
test('UP and DOWN use cents consistently and subtract fees',()=>{for(const side of ['UP','down']){const r=advice(side,60,66);assert.equal(r.action,side.toUpperCase()+' · HOLD');assert.ok(Math.abs(r.pnl-.5)<1e-9);}});
test('loss, profit pullback, zero bid and stale quote',()=>{assert.match(advice('up',60,50).action,/SELL FAST/);assert.match(advice('down',60,74,{peak:85}).action,/CASH OUT/);assert.match(advice('up',60,0).action,/SELL FAST/);const p={side:'up',entry:60,ticker:'round'};assert.match(ctx.positionAdvice(p,{ticker:'other'},Date.now()).action,/CHANGED/);assert.match(ctx.positionAdvice(p,{ticker:'round',expires:Date.now()+60000},Date.now()-20000).action,/UNAVAILABLE/);});
test('dashboard scripts parse and conflicting easy-mode writer is removed',()=>{const html=readFileSync('private/dashboard.html','utf8');for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);assert.ok(!html.includes('src="/easy-mode.js'));});
