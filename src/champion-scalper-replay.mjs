// Replays the dashboard's headline PRO SCALPER position rules in shadow.
// The position is a strategy reference. Exchange fills belong in a separate ledger.
export function replayChampionScalper({ticker,secondsLeft,side,strong,quotes},previous) {
 const held=previous?.ticker===ticker?previous:null;
 if(!held&&(!strong||secondsLeft<180||!['up','down'].includes(side)))
  return {action:'NO ENTRY',position:null};

 const position=held?{...held}:{ticker,side,entry:quotes[side].ask,exit:null};
 const bid=quotes[position.side].bid;
 const move=bid-position.entry;
 if(!position.exit){
  if(secondsLeft<=90)position.exit='TIME EXIT';
  else if(move<=-5)position.exit='SELL FAST';
  else if(move>=8)position.exit='TAKE PROFIT';
  else if(side!=='mixed'&&side!==position.side&&strong)position.exit='EXIT · MOMENTUM REVERSED';
 }
 if(position.exit&&position.exitBid==null)position.exitBid=bid;
 const action=(position.exit?.split(' · ')[0]||(held?'HOLD':'BUY'))+' '+position.side.toUpperCase();
 return {action,position};
}
