import {modeledCost} from './scalper-v8.mjs';

const horizons=[3,6,10,20,30,60];
export const voltV18Horizons=[1,2,3,5,10,15,30];
export const predatorEarlyHorizons=[1,3,5,10,30,60];
const reserve=.01;
const exitBid=(book,side)=>side==='UP'?book.yes:book.no;

export function observeVoltHorizons(round, cells, book, windows=horizons){
 const entry=round.voltV16Probe;
 if(!entry||entry.ticker!==book.ticker)return false;
 const age=book.bookAt-entry.at;
 const level=exitBid(book,entry.side);
 if(!level||level.size<1||book.bookAt<=entry.at||book.bookAt>book.now||book.now-book.bookAt>1500)return false;
 let changed=false;
 for(const seconds of windows){
  if(age<seconds*1000||age>seconds*1000+(windows===horizons?1500:350)||entry.scored[seconds])continue;
  const move=level.price-entry.ask;
  const net=move-modeledCost(entry.ask)-modeledCost(level.price)-reserve;
  const cell=cells[entry.side+'/'+seconds]??={count:0,wins:0,move:0,downside:0};
  cell.count++;
  cell.wins+=Number(net>0);
  cell.move+=move;
  cell.downside+=Math.max(0,-net);
  entry.scored[seconds]=true;
  changed=true;
 }
 return changed;
}

export function forecastVoltHorizons(cells, entry, remaining, windows=horizons){
 return windows.map(seconds=>{
  const cell=cells[entry.side+'/'+seconds];
  if(!cell||remaining<seconds+5)return {seconds,samples:cell?.count??0,qualified:false};
  const bid=Math.max(0,Math.min(.999,entry.ask+cell.move/cell.count));
  const net=bid-entry.ask-modeledCost(entry.ask)-modeledCost(bid)-reserve;
  const downside=cell.downside/cell.count;
  return {seconds,samples:cell.count,bid,net,downside,rank:net/Math.max(.015,downside),
   qualified:cell.count>=12&&cell.wins/cell.count>=.65&&net>.015};
 });
}

// One-sided Wilson bound for the observed fraction of profitable exits.
export function forecastPredatorEarly(cells,entry,remaining){
 return forecastVoltHorizons(cells,entry,remaining,predatorEarlyHorizons).map(row=>{
  const cell=cells[entry.side+'/'+row.seconds];
  if(!cell?.count)return row;
  const n=cell.count,p=cell.wins/n,z=1.645;
  const lowerWinRate=(p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/(1+z*z/n);
  return {...row,observedWinRate:p,lowerWinRate,qualified:row.qualified&&lowerWinRate>.5};
 });
}
