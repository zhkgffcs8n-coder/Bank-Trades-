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
