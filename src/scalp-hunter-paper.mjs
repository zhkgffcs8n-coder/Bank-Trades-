import {isScalpEntryPrice} from './scalp-entry-price.mjs';
import {modeledCost} from './scalper-v8.mjs';
import {trustedStoredFinalizedOutcome} from './official-settlement.mjs';

export const hunterEngines=['A','B','C'];
export function openHunterPaper(name,snapshot,idea,depth){
 if(!isScalpEntryPrice(idea.ask))return null;
 const entryBid=idea.side==='UP'?depth?.yes?.price:depth?.no?.price;
 return {name,asset:snapshot.asset,quantity:1,entryBid,bid:entryBid,peakBid:entryBid,ticker:snapshot.ticker,at:snapshot.at,expiresAt:snapshot.expiresAt,
  side:idea.side,ask:idea.ask,target:idea.target,entryCost:modeledCost(idea.ask),
  horizonSeconds:idea.horizonSeconds,peakNet:0,lastAt:snapshot.at};
}
export function monitorHunterPaper(position,depth){
 if(position.closedAt||!depth||depth.ticker!==position.ticker||depth.at<=position.lastAt||depth.at>=position.expiresAt)return position;
 const level=position.side==='UP'?depth.yes:depth.no;
 if(!level||!Number.isFinite(depth.at)||!Number.isFinite(level.size)||level.size<1||
  !Number.isFinite(level.price)||level.price<=0||level.price>=1)return position;
 const bid=level.price;
 const exitCost=modeledCost(bid);
 const net=bid-position.ask-position.entryCost-exitCost;
 const peakNet=Math.max(position.peakNet,net);
 const opposite=position.side==='UP'?depth.no:depth.yes;
 const giveback=peakNet-net;
 const liquidityReversal=net>0&&giveback>=.02&&opposite?.size>=level.size*2;
 const trailing=peakNet>=.05&&giveback>=Math.min(.04,peakNet*.4);
 const bidDrop=Number.isFinite(position.entryBid)?position.entryBid-bid:-net;
 const supportedPullback=level.size>=opposite?.size*2&&bidDrop<.10-1e-9&&
  !position.supportedPullback;
 // A spread and two modeled fees can put a new position below -7¢ even on a flat book.
 const stop=bidDrop>=.07-1e-9&&!supportedPullback;
 const reason=net>0&&bid>=position.target?'TAKE_PROFIT':
  stop?'STOP_LOSS':liquidityReversal||trailing?'TRAILING_EXIT':
  depth.at>=position.at+position.horizonSeconds*1000?'TIME_EXIT':null;
 return {...position,supportedPullback:bidDrop>=.07-1e-9&&supportedPullback,peakNet,peakBid:Math.max(position.peakBid??position.entryBid??bid,bid),bid,net,lastAt:depth.at,...(reason?{reason,bid,exitCost,net,closedAt:depth.at}:{})};
}
export function settleHunterPaper(position,label,now){
 const outcome=trustedStoredFinalizedOutcome(label,position.ticker);
 if(!outcome||!Number.isFinite(label.labeledAt)||label.labeledAt<position.expiresAt||label.labeledAt>now)return null;
 const payout=(position.side==='UP')===(outcome==='yes')?1:0;
 return {...position,bid:undefined,reason:'OFFICIAL_SETTLEMENT',verification:label.verification,exitCost:0,
  net:payout-position.ask-position.entryCost,closedAt:label.labeledAt};
}
