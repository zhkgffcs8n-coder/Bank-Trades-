import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from '../netlify/functions/lib/paper-performance.mjs';

test('verified paper performance counts break-even exits as ties, not losses',()=>{
 const common={asset:'BTC',side:'up',ask:50,cost:0.5,qty:1};
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
 const settled={asset:'BTC',side:'up',qty:2,ask:50,cost:1,status:'SETTLED',settlement:'WIN',marketResult:'yes',pnl:1};
 const exited={asset:'BTC',side:'down',qty:2,ask:50,cost:1,status:'CLOSED',paperExitOnly:true,exitBid:30,pnl:-0.4,settlement:'LOSS'};
 assert.equal(reconciledPaperTrade(settled),true);
 assert.equal(reconciledPaperTrade(exited),true);
 const bad=[
  {...settled,marketResult:'no'},
  {...settled,pnl:100},
  {...settled,qty:0},
  {...settled,cost:0.01},
  {...settled,settlement:'LOSS'},
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
