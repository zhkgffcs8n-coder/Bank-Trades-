import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from '../netlify/functions/lib/paper-performance.mjs';
import {SETTLEMENT_VERIFICATION} from '../src/official-settlement.mjs';

test('verified paper performance counts break-even exits as ties, not losses',()=>{
 const common={asset:'BTC',side:'up',ask:50,cost:0.5,qty:1,outcomeVerification:SETTLEMENT_VERIFICATION};
 const rows=[
  {...common,id:'win',status:'SETTLED',settlement:'WIN',marketResult:'yes',pnl:0.5},
  {...common,id:'loss',status:'SETTLED',settlement:'LOSS',marketResult:'no',pnl:-0.5},
  {...common,id:'tie',status:'CLOSED',paperExitOnly:true,exitBid:50,pnl:0,settlement:'TIE'}
 ];
 const stats=performance(rows);
 assert.equal(stats.overall.trades,3);
 assert.equal(stats.overall.wins,1);
 assert.equal(stats.overall.losses,1);
 assert.equal(stats.overall.ties,1);
 assert.equal(stats.overall.winRate,1/3);
 assert.equal(stats.lossReview.totalLosses,1);
 assert.equal(stats.byStrategy.BTC_up.ties,1);
});

test('missing P/L or exit bid never becomes a fabricated break-even paper trade',async()=>{
 const {hasRecordedNumber}=await import('../netlify/functions/lib/paper-performance.mjs');
 assert.equal(hasRecordedNumber(0),true);
 assert.equal(hasRecordedNumber('0'),true);
 for(const value of [null,undefined,'','  ',NaN,Infinity])assert.equal(hasRecordedNumber(value),false);
 const common={asset:'BTC',side:'up',ask:50,cost:0.5,qty:1,status:'CLOSED',paperExitOnly:true};
 const rows=[
  {...common,id:'missing-pnl',exitBid:50,pnl:null},
  {...common,id:'missing-bid',exitBid:null,pnl:0},
  {...common,id:'empty-pnl',exitBid:50,pnl:''},
  {...common,id:'valid-tie',exitBid:50,pnl:0}
 ];
 const stats=performance(rows);
 assert.equal(stats.overall.trades,1);
 assert.equal(stats.overall.ties,1);
 assert.equal(stats.excluded,3);
});

test('paper outcomes must reconcile to recorded quantity, cost and official side',async()=>{
 const {reconciledPaperTrade}=await import('../netlify/functions/lib/paper-performance.mjs');
 const settled={asset:'BTC',side:'up',qty:2,ask:50,cost:1,status:'SETTLED',settlement:'WIN',marketResult:'yes',pnl:1,outcomeVerification:SETTLEMENT_VERIFICATION};
 const exited={asset:'BTC',side:'down',qty:2,ask:50,cost:1,status:'CLOSED',paperExitOnly:true,exitBid:30,pnl:-0.4,settlement:'LOSS'};
 assert.equal(reconciledPaperTrade(settled),true);
 assert.equal(reconciledPaperTrade(exited),true);
 const bad=[
  {...settled,marketResult:'no'},
  {...settled,pnl:100},
  {...settled,qty:0},
  {...settled,cost:0.01},
  {...settled,settlement:'LOSS'},
  {...settled,outcomeVerification:null},
  {...settled,outcomeVerification:'LEGACY_LABEL'},
  {...exited,pnl:0.4},
  {...exited,exitBid:null},
  {...exited,settlement:'WIN'}
 ];
 for(const row of bad)assert.equal(reconciledPaperTrade(row),false,JSON.stringify(row));
 const stats=performance([settled,exited,...bad]);
 assert.equal(stats.overall.trades,2);
 assert.equal(stats.overall.wins,1);
 assert.equal(stats.overall.losses,1);
 assert.equal(stats.excluded,bad.length);
});


test('unverified legacy paper settlements never count as proven wins or losses',async()=>{
 const {reconciledPaperTrade}=await import('../netlify/functions/lib/paper-performance.mjs');
 const base={id:'legacy',asset:'BTC',side:'up',qty:2,ask:50,cost:1,
  status:'SETTLED',settlement:'WIN',marketResult:'yes',pnl:1};
 for(const marker of [undefined,null,'',false,'LEGACY']){
  const row={...base,outcomeVerification:marker};
  assert.equal(reconciledPaperTrade(row),false);
  const stats=performance([row]);
  assert.equal(stats.overall.trades,0);
  assert.equal(stats.excluded,1);
 }
 const verified={...base,outcomeVerification:SETTLEMENT_VERIFICATION};
 assert.equal(reconciledPaperTrade(verified),true);
 assert.equal(performance([verified]).overall.trades,1);
 // Independently simulated early exits are still classified from recorded bids.
 const exit={id:'paper-exit',asset:'BTC',side:'down',qty:2,ask:50,cost:1,
  status:'CLOSED',paperExitOnly:true,exitBid:30,pnl:-.4,settlement:'LOSS'};
 assert.equal(reconciledPaperTrade(exit),true);
 assert.equal(performance([exit]).overall.trades,1);
});

test('disputed settled outcome is quarantined even with a verified provenance marker',async()=>{
 const {reconciledPaperTrade}=await import('../netlify/functions/lib/paper-performance.mjs');
 const settled={id:'disputed',asset:'BTC',side:'up',qty:2,ask:50,cost:1,
  status:'SETTLED',settlement:'WIN',marketResult:'yes',pnl:1,
  outcomeVerification:SETTLEMENT_VERIFICATION,outcomeConflict:true};
 assert.equal(reconciledPaperTrade(settled),false);
 const stats=performance([settled]);
 assert.equal(stats.overall.trades,0);
 assert.equal(stats.overall.wins,0);
 assert.equal(stats.excluded,1);
 // A separately recorded paper exit is valued at its exit bid, not the
 // later disputed binary outcome. Its accounting remains independent.
 const exited={...settled,id:'early-exit',status:'CLOSED',paperExitOnly:true,
  exitBid:40,pnl:-.2,settlement:'LOSS'};
 assert.equal(reconciledPaperTrade(exited),true);
 assert.equal(performance([exited]).overall.trades,1);
});

test('identical duplicate paper IDs count only once in performance and cohorts',()=>{
 const t={id:'paper-123',ticker:'KXBTC15M-TEST',asset:'BTC',side:'up',qty:2,ask:50,cost:1,
  status:'SETTLED',settlement:'WIN',marketResult:'yes',pnl:1,
  outcomeVerification:SETTLEMENT_VERIFICATION};
 const stats=performance([t,{...t}]);
 assert.equal(stats.overall.trades,1);
 assert.equal(stats.overall.wins,1);
 assert.equal(stats.overall.netPnl,1);
 assert.equal(stats.byStrategy.BTC_up.trades,1);
 assert.equal(stats.excluded,1);
 assert.equal(stats.duplicateIdExcludedCount,1);
 assert.equal(stats.conflictingDuplicateIdCount,0);
});

test('conflicting or unverified duplicate paper IDs quarantine all copies independent of ordering',()=>{
 const good={id:'paper-123',ticker:'KXBTC15M-TEST',asset:'BTC',side:'up',qty:2,ask:50,cost:1,
  status:'SETTLED',settlement:'WIN',marketResult:'yes',pnl:1,
  outcomeVerification:SETTLEMENT_VERIFICATION};
 for(const bad of [{...good,pnl:2},{...good,outcomeVerification:null},
  {...good,marketResult:'no'},{...good,status:'CLOSED',paperExitOnly:true,exitBid:75,pnl:.5}]){
  for(const rows of [[good,bad],[bad,good]]){
   const stats=performance(rows);
   assert.equal(stats.overall.trades,0);
   assert.equal(stats.overall.netPnl,0);
   assert.equal(stats.excluded,2);
   assert.equal(stats.duplicateIdExcludedCount,2);
   assert.equal(stats.conflictingDuplicateIdCount,1);
  }
 }
 // Legacy rows without IDs still require individual reconciliation; this
 // change must not silently erase their historical accounting.
 const {id,...legacy}=good;
 assert.equal(performance([legacy,{...legacy}]).overall.trades,2);
});

test('repeated archived wins cannot manufacture an eligible paper-entry cohort',async()=>{
 const {gatePaperEntry}=await import('../netlify/functions/lib/paper-performance.mjs');
 const win={id:'one-verified-paper-trade',ticker:'KXBTC15M-TEST',asset:'BTC',
  side:'up',qty:2,ask:50,cost:1,status:'SETTLED',settlement:'WIN',
  marketResult:'yes',pnl:1,outcomeVerification:SETTLEMENT_VERIFICATION};
 const stats=performance(Array.from({length:30},()=>({...win})));
 assert.equal(stats.overall.trades,1);
 assert.equal(stats.duplicateIdExcludedCount,29);
 const signal={action:'BUY UP',asset:'BTC',side:'up',ask:50,reason:'Research only'};
 const gated=gatePaperEntry(signal,stats);
 assert.equal(gated.validation,'INSUFFICIENT COHORT DATA');
 assert.notEqual(gated.validation,'PAPER COHORT PASSED');
});

test('whitespace aliases of a paper trade ID cannot inflate verified wins or a cohort',()=>{
 const trade={id:'paper-123',ticker:'KXBTC15M-TEST',asset:'BTC',side:'up',
  qty:2,ask:50,cost:1,status:'SETTLED',settlement:'WIN',
  marketResult:'yes',pnl:1,outcomeVerification:SETTLEMENT_VERIFICATION};
 for(const rows of [[trade,{...trade,id:' paper-123 '}],
                    [{...trade,id:' paper-123 '},trade]]){
  const stats=performance(rows);
  assert.equal(stats.overall.trades,1);
  assert.equal(stats.overall.wins,1);
  assert.equal(stats.overall.netPnl,1);
  assert.equal(stats.byStrategy.BTC_up.trades,1);
  assert.equal(stats.duplicateIdExcludedCount,1);
  assert.equal(stats.conflictingDuplicateIdCount,0);
 }
});

test('contradictory whitespace-alias paper IDs quarantine every copy in either order',()=>{
 const good={id:'paper-123',ticker:'KXBTC15M-TEST',asset:'BTC',
  side:'up',qty:2,ask:50,cost:1,status:'SETTLED',settlement:'WIN',
  marketResult:'yes',pnl:1,outcomeVerification:SETTLEMENT_VERIFICATION};
 const bad={...good,id:' paper-123 ',pnl:2};
 for(const rows of [[good,bad],[bad,good]]){
  const stats=performance(rows);
  assert.equal(stats.overall.trades,0);
  assert.equal(stats.overall.netPnl,0);
  assert.equal(stats.excluded,2);
  assert.equal(stats.duplicateIdExcludedCount,2);
  assert.equal(stats.conflictingDuplicateIdCount,1);
 }
});

test('ID-less legacy wins remain visible historically but cannot qualify the paper-entry gate',async()=>{
 const {gatePaperEntry}=await import('../netlify/functions/lib/paper-performance.mjs');
 const settled={asset:'BTC',side:'up',qty:2,ask:50,cost:1,status:'SETTLED',
  settlement:'WIN',marketResult:'yes',pnl:1,outcomeVerification:SETTLEMENT_VERIFICATION};
 const legacy=Array.from({length:30},()=>({...settled}));
 const stats=performance(legacy);
 assert.equal(stats.overall.trades,30,'historical totals are not silently rewritten');
 assert.equal(stats.gateEligibleTradeCount,0);
 assert.equal(stats.idlessResolvedExcludedFromGateCount,30);
 assert.equal(stats.gateByStrategy.BTC_up,undefined);
 const gated=gatePaperEntry({action:'BUY UP',asset:'BTC',side:'up',ask:50,reason:'Shadow'},stats);
 assert.equal(gated.validation,'INSUFFICIENT COHORT DATA');
 assert.notEqual(gated.validation,'PAPER COHORT PASSED');
});

test('identified, deduplicated trades alone determine paper gate cohorts and drawdown',async()=>{
 const {gatePaperEntry}=await import('../netlify/functions/lib/paper-performance.mjs');
 const settled={asset:'BTC',side:'up',qty:2,ask:50,cost:1,status:'SETTLED',
  settlement:'WIN',marketResult:'yes',pnl:1,outcomeVerification:SETTLEMENT_VERIFICATION};
 const legacy=Array.from({length:30},()=>({...settled}));
 const identified=Array.from({length:25},(_,i)=>({...settled,id:'unique-'+i,at:i+1}));
 const stats=performance([...legacy,...identified,{...identified[0]}]);
 assert.equal(stats.overall.trades,55);
 assert.equal(stats.gateEligibleTradeCount,25);
 assert.equal(stats.idlessResolvedExcludedFromGateCount,30);
 assert.equal(stats.gateByStrategy.BTC_up.trades,25);
 assert.equal(stats.gateRecent50.trades,25);
 const gated=gatePaperEntry({action:'BUY UP',asset:'BTC',side:'up',ask:50,reason:'Shadow'},stats);
 assert.equal(gated.validation,'PAPER COHORT PASSED');
});
