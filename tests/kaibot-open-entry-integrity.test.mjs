import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validOpenPaperPosition,duplicatePaperTradeIds} from '../netlify/functions/lib/paper-performance.mjs';

test('OPEN paper positions must reconcile before a simulated settlement',()=>{
 const t={id:'srv-valid-1',status:'OPEN',ticker:'KXBTC15M-TEST',side:'up',qty:10,ask:55,cost:5.50};
 assert.equal(validOpenPaperPosition(t),true);
 assert.equal(validOpenPaperPosition({...t,qty:'10',ask:'55',cost:'5.50'}),true);
 for(const change of [
  {status:'CLOSED'},{id:''},{id:null},{id:'   '},{ticker:''},{ticker:' '},{side:'unknown'},
  {qty:0},{qty:1.5},{qty:Number.MAX_SAFE_INTEGER+1},{qty:null},
  {ask:0},{ask:100},{ask:null},{cost:0},{cost:1},
  {cost:null},{cost:Infinity},{cost:''}
 ])assert.equal(validOpenPaperPosition({...t,...change}),false,JSON.stringify(change));
});

test('scheduled KaiBot quarantines invalid OPEN positions before paying and audits their count',()=>{
 const source=readFileSync(new URL('../netlify/functions/kaibot-runner.mjs',import.meta.url),'utf8');
 const guard=source.indexOf("if(t.status==='OPEN'&&(!validOpenPaperPosition(t)||hasDuplicateId(t)))continue;");
 const lookup=source.indexOf("let o=await hdb.get('outcomes/'+t.ticker",guard);
 const payout=source.indexOf('ledger.cash=Math.round((ledger.cash+payout)*100)/100;',guard);
 assert.ok(guard>0&&lookup>guard&&payout>lookup);
 assert.match(source,/invalidOpenPaperPositionCount:ledger\.trades\.filter\(t=>t\.status==='OPEN'&&!validOpenPaperPosition\(t\)\)\.length/);
 assert.match(source,/const entryPaused=stats\?\.gateRecent50/);
 assert.match(source,/if\(entryPaused\)/);
 assert.match(source,/gatePaperEntry\(/);
});

test('duplicate paper trade IDs quarantine every copy, including identical open rows',()=>{
 const first={id:'paper-1',status:'OPEN',ticker:'KXBTC15M-TEST',qty:10,ask:55,cost:5.5};
 const records=[first,{...first},{...first,id:'paper-2',status:'SETTLED'},
  {...first,id:'paper-2',status:'OPEN'},{...first,id:'paper-3'},
  {...first,id:''},{...first,id:null}];
 assert.deepEqual([...duplicatePaperTradeIds(records)].sort(),['paper-1','paper-2']);
 assert.deepEqual([...duplicatePaperTradeIds([first,{...first,id:'paper-4'}])],[]);
 assert.deepEqual([...duplicatePaperTradeIds([{id:' paper-1 '},{id:'paper-1'}])],['paper-1']);
 assert.deepEqual([...duplicatePaperTradeIds(null)],[]);
});

test('KaiBot blocks duplicate open IDs from both official payouts and early-exit cash',()=>{
 const source=readFileSync(new URL('../netlify/functions/kaibot-runner.mjs',import.meta.url),'utf8');
 const dup=source.indexOf('const duplicateIds=duplicatePaperTradeIds(ledger.trades);');
 const guard=source.indexOf("if(t.status==='OPEN'&&(!validOpenPaperPosition(t)||hasDuplicateId(t)))continue;");
 const payout=source.indexOf('ledger.cash=Math.round((ledger.cash+payout)*100)/100;');
 const exits=source.indexOf("const openForExit=ledger.trades.filter(x=>validOpenPaperPosition(x)&&!hasDuplicateId(x));");
 const proceeds=source.indexOf('ledger.cash=Math.round((ledger.cash+proceeds)*100)/100;');
 assert.ok(dup>0&&guard>dup&&payout>guard&&exits>payout&&proceeds>exits);
 assert.match(source,/duplicatePaperTradeIdCount:duplicateIds\.size/);
 assert.match(source,/duplicateOpenPaperPositionCount:ledger\.trades\.filter\(t=>t\.status==='OPEN'&&hasDuplicateId\(t\)\)\.length/);
 assert.match(source,/const entryPaused=stats\?\.gateRecent50/);
 assert.match(source,/if\(entryPaused\)/);
 assert.match(source,/gatePaperEntry\(/);
});


test('missing IDs are quarantined before both paper payout and early exit',()=>{
 const valid={id:'srv-unique',status:'OPEN',ticker:'KXBTC15M-TEST',side:'up',qty:2,ask:50,cost:1};
 assert.equal(validOpenPaperPosition(valid),true);
 for(const id of [undefined,null,'','   ',0]){
  const invalid={...valid,id};
  assert.equal(validOpenPaperPosition(invalid),false,'Missing or blank trade ID must fail closed');
 }
 const source=readFileSync(new URL('../netlify/functions/kaibot-runner.mjs',import.meta.url),'utf8');
 const payoutGuard=source.indexOf("if(t.status==='OPEN'&&(!validOpenPaperPosition(t)||hasDuplicateId(t)))continue;");
 const payout=source.indexOf('ledger.cash=Math.round((ledger.cash+payout)*100)/100;');
 const exitGuard=source.indexOf("const openForExit=ledger.trades.filter(x=>validOpenPaperPosition(x)&&!hasDuplicateId(x));");
 const exitPayout=source.indexOf('ledger.cash=Math.round((ledger.cash+proceeds)*100)/100;');
 assert.ok(payoutGuard>=0&&payout>payoutGuard&&exitGuard>payout&&exitPayout>exitGuard);
});


test('Balanced and Lock do not promote unvalidated research into automatic paper buys',()=>{
 const source=readFileSync(new URL('../netlify/functions/kaibot-runner.mjs',import.meta.url),'utf8');
 assert.match(source,/const experimentalEntry=false;/);
 assert.doesNotMatch(source,/validation:'PAPER EXPERIMENT',reason:'Directional confirmation for simulated entry'/);
 assert.match(source,/if\(!\['BUY UP','BUY DOWN'\]\.includes\(signal\.action\)\)/);
});
