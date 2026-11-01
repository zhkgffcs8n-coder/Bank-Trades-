// Read-only evaluation of a mid-round exit strategy on timestamped executable quotes.
// Never use final candles to choose the entry. No orders are placed.
export function earlyExitAudit(rounds,{entryMin=.4,entryMax=.6,target=.8,stop=.25,fee=.02,slippage=.01,asOf=Date.now()}={}){
 const valid=x=>typeof x==='number'&&Number.isFinite(x);
 const results=[];const seen=new Set();
 for(const round of Array.isArray(rounds)?rounds:[]){
  if(!round||typeof round.id!=='string'||seen.has(round.id)||!Array.isArray(round.quotes)||!valid(asOf))continue;
  seen.add(round.id);
  const quotes=round.quotes.filter(q=>valid(q.t)&&valid(q.ask)&&valid(q.bid)&&q.ask>0&&q.ask<1&&q.bid>=0&&q.bid<=q.ask&&q.t<=asOf).sort((a,b)=>a.t-b.t);
  if(!quotes.length)continue;
  // Explicit externally timestamped candidate: the entry cannot be selected by hindsight.
  const entry=quotes.find(q=>q.t===round.signalAt&&q.ask>=entryMin&&q.ask<=entryMax);
  if(!entry||valid(round.expiresAt)&&entry.t>=round.expiresAt)continue;
  const future=quotes.filter(q=>q.t>entry.t&&(!valid(round.expiresAt)||q.t<round.expiresAt));
  const exit=future.find(q=>q.bid>=target||q.bid<=stop);
  const last=future.at(-1);
  // A still-open round with no target/stop has no completed hypothetical exit.
  // At expiry, only use a recent pre-expiry bid; never treat an old quote as a fill.
  const expired=valid(round.expiresAt)&&asOf>=round.expiresAt;
  const terminal=expired&&last&&last.t>=round.expiresAt-90000?last:null;
  if(!exit&&!terminal)continue;
  const chosen=exit||terminal;
  const net=chosen.bid-entry.ask-fee-slippage;
  results.push({id:round.id,entryAt:entry.t,exitAt:chosen.t,entryAsk:entry.ask,exitBid:chosen.bid,net,exitReason:exit?(exit.bid>=target?'TARGET':'STOP'):'LAST_OBSERVED_QUOTE'});
 }
 const count=results.length,net=results.reduce((s,r)=>s+r.net,0),wins=results.filter(r=>r.net>0).length;
 return {mode:'SHADOW_ONLY',trades:count,wins,losses:count-wins,netPnlPerOneContract:net,averageNet:count?net/count:null,
  winRate:count?wins/count:null,assumptions:{entryMin,entryMax,target,stop,fee,slippage},
  note:'Hypothetical quote-path audit, not fill-adjusted live PnL. Missing future quotes and unfilled bids can bias results. No trading authorization.'};
}
