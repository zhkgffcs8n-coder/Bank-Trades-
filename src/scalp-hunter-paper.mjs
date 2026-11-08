import {modeledCost} from './scalper-v8.mjs';
import {trustedStoredFinalizedOutcome} from './official-settlement.mjs';

export const hunterEngines=['A','B','C'];
export function openHunterPaper(name,snapshot,idea,depth){
 const entryBid=idea.side==='UP'?depth?.yes?.price:depth?.no?.price;
 return {name,entryBid,ticker:snapshot.ticker,at:snapshot.at,expiresAt:snapshot.expiresAt,
  side:idea.side,ask:idea.ask,target:idea.target,entryCost:modeledCost(idea.ask),
  horizonSeconds:idea.horizonSeconds,peakNet:0,lastAt:snapshot.at};
}
export function monitorHunterPaper(position,depth){
 if(position.closedAt||!depth||depth.ticker!==position.ticker||depth.at<=position.lastAt||depth.at>=position.expiresAt)return position;
 const level=position.side==='UP'?depth.yes:depth.no;
 if(!level||level.size<1)return position;
 const bid=level.price;
 const exitCost=modeledCost(bid);
 const net=bid-position.ask-position.entryCost-exitCost;
 const peakNet=Math.max(position.peakNet,net);
 const opposite=position.side==='UP'?depth.no:depth.yes;
 const liquidityReversal=position.name==='B'&&net>0&&peakNet-net>=.02&&
  opposite?.size>=level.size*2;
 // A spread and two modeled fees can put a new position below -7¢ even on a flat book.
 const stop=Number.isFinite(position.entryBid)?bid-position.entryBid<=-.07+1e-9:net<=-.07;
 const reason=net>0&&bid>=position.target?'TAKE_PROFIT':
  stop?'STOP_LOSS':liquidityReversal||peakNet>=.05&&peakNet-net>=.04?'TRAILING_EXIT':
  depth.at>=position.at+position.horizonSeconds*1000?'TIME_EXIT':null;
 return {...position,peakNet,bid,net,lastAt:depth.at,...(reason?{reason,bid,exitCost,net,closedAt:depth.at}:{})};
}
export function settleHunterPaper(position,label,now){
 const outcome=trustedStoredFinalizedOutcome(label,position.ticker);
 if(!outcome||!Number.isFinite(label.labeledAt)||label.labeledAt<position.expiresAt||label.labeledAt>now)return null;
 const payout=(position.side==='UP')===(outcome==='yes')?1:0;
 return {...position,bid:undefined,reason:'OFFICIAL_SETTLEMENT',verification:label.verification,exitCost:0,
  net:payout-position.ask-position.entryCost,closedAt:label.labeledAt};
}
