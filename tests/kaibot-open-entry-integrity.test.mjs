import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validOpenPaperPosition} from '../netlify/functions/lib/paper-performance.mjs';

test('OPEN paper positions must reconcile before a simulated settlement',()=>{
 const t={status:'OPEN',ticker:'KXBTC15M-TEST',side:'up',qty:10,ask:55,cost:5.50};
 assert.equal(validOpenPaperPosition(t),true);
 assert.equal(validOpenPaperPosition({...t,qty:'10',ask:'55',cost:'5.50'}),true);
 for(const change of [
  {status:'CLOSED'},{ticker:''},{ticker:' '},{side:'unknown'},
  {qty:0},{qty:1.5},{qty:Number.MAX_SAFE_INTEGER+1},{qty:null},
  {ask:0},{ask:100},{ask:null},{cost:0},{cost:1},
  {cost:null},{cost:Infinity},{cost:''}
 ])assert.equal(validOpenPaperPosition({...t,...change}),false,JSON.stringify(change));
});

test('scheduled KaiBot quarantines invalid OPEN positions before paying and audits their count',()=>{
 const source=readFileSync(new URL('../netlify/functions/kaibot-runner.mjs',import.meta.url),'utf8');
 const guard=source.indexOf("if(t.status==='OPEN'&&!validOpenPaperPosition(t))continue;");
 const lookup=source.indexOf("let o=await hdb.get('outcomes/'+t.ticker",guard);
 const payout=source.indexOf('ledger.cash=Math.round((ledger.cash+payout)*100)/100;',guard);
 assert.ok(guard>0&&lookup>guard&&payout>lookup);
 assert.match(source,/invalidOpenPaperPositionCount:ledger\.trades\.filter\(t=>t\.status==='OPEN'&&!validOpenPaperPosition\(t\)\)\.length/);
 assert.match(source,/const entryPaused=true/);
});
