import {openPredatorWatch,predatorObservation} from './btc-predator.mjs';

const horizons=[60,120];
const cost=price=>Math.ceil(7*price*(1-price))/100+.01;
const ask=(observation,side)=>1-(side==='UP'?observation.no:observation.yes).price;

export function normalizeCoinbaseTape(payload,now){
 const seen=new Set();
 return (Array.isArray(payload)?payload:[]).flatMap(row=>{
  const time=Date.parse(row.time),price=Number(row.price),size=Number(row.size);
  if(!Number.isFinite(time)||time>now||time<now-12000||!Number.isFinite(price)||price<=0||
   !Number.isFinite(size)||size<=0||!['buy','sell'].includes(row.side)||!row.trade_id||seen.has(row.trade_id))return [];
  seen.add(row.trade_id);
  return [{time,price,flow:row.side==='sell'?size:-size}];
 }).sort((a,b)=>a.time-b.time);
}

export function freezePredatorSample(input){
 const observation=predatorObservation(input);
 const watch=openPredatorWatch(observation);
 return {ticker:input.ticker,at:input.now,expiresAt:input.expiresAt,
  stage:!observation?'NO_EXECUTABLE_BOOK':!observation.sourceEventAt?'INSUFFICIENT_TAPE':watch?'EARLY_WATCH':'NO_EARLY_WATCH',
  sourceEventAt:observation?.sourceEventAt??null,
  sourceAgeMs:observation?.sourceEventAt?input.now-observation.sourceEventAt:null,
  book:observation?{yes:observation.yes,no:observation.no}:null,
  early:watch?{side:watch.side,ask:watch.ask,target:watch.target}:null,
  momentum:observation?.baselineSide?{side:observation.baselineSide,ask:ask(observation,observation.baselineSide)}:null};
}

export function scorePredatorSamples(previous,current,windows=horizons,tolerance=null){
 if(!current.book)return [];
 return previous.flatMap(entry=>{
  if(!entry.book||entry.ticker!==current.ticker||entry.at>=current.at||current.at>=entry.expiresAt)return [];
  return windows.flatMap(horizon=>{
   const lag=current.at-entry.at-horizon*1000;
   if(lag< -(tolerance??5000)||lag>(tolerance??15000))return [];
   const pnl=signal=>{
    const bid=(signal.side==='UP'?current.book.yes:current.book.no).price;
    return {bid,net:bid-signal.ask-cost(signal.ask)-cost(bid)};
   };
   const early=entry.early?pnl(entry.early):null;
   const momentum=entry.momentum?pnl(entry.momentum):null;
   const available=['UP','DOWN'].map(side=>pnl({side,ask:ask(entry.book,side)}).net);
   return [{ticker:entry.ticker,at:entry.at,exitAt:current.at,horizon,
    early,momentum,earlySkippedProfitable:entry.sourceEventAt!==null&&!early&&Math.max(...available)>0,
    bestObservedNet:Math.max(...available),mode:'SAMPLED_SHADOW'}];
  });
 });
}
