import {modeledCost} from './scalper-v8.mjs';
import {trustedStoredFinalizedOutcome} from './official-settlement.mjs';

export const hunterEngines=['A','B','C'];
export function openHunterPaper(name,snapshot,idea){
 return {name,ticker:snapshot.ticker,at:snapshot.at,expiresAt:snapshot.expiresAt,
  side:idea.side,ask:idea.ask,target:idea.target,entryCost:modeledCost(idea.ask),
  horizonSeconds:idea.horizonSeconds,peakNet:0,lastAt:snapshot.at};
}
export function monitorHunterPaper(position,depth){
 if(!depth||depth.ticker!==position.ticker||depth.at<=position.lastAt||depth.at>=position.expiresAt)return position;
 const level=position.side==='UP'?depth.yes:depth.no;
 if(!level||level.size<1)return position;
 const bid=level.price;
 const exitCost=modeledCost(bid);
 const net=bid-position.ask-position.entryCost-exitCost;
 const peakNet=Math.max(position.peakNet,net);
 const reason=net>0&&bid>=position.target?'TAKE_PROFIT':
  net<=-.07?'STOP_LOSS':peakNet>=.05&&peakNet-net>=.04?'TRAILING_EXIT':
  depth.at>=position.at+position.horizonSeconds*1000?'TIME_EXIT':null;
 return {...position,peakNet,lastAt:depth.at,...(reason?{reason,bid,exitCost,net,closedAt:depth.at}:{})};
}
export function settleHunterPaper(position,label,now){
 const outcome=trustedStoredFinalizedOutcome(label,position.ticker);
 if(!outcome||label.labeledAt<position.expiresAt||label.labeledAt>now)return null;
 const payout=(position.side==='UP')===(outcome==='yes')?1:0;
 return {...position,reason:'OFFICIAL_SETTLEMENT',verification:label.verification,exitCost:0,
  net:payout-position.ask-position.entryCost,closedAt:label.labeledAt};
}
