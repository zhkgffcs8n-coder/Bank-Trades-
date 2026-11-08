import {modeledCost,scalpEngines} from './scalper-v8.mjs';

export function replayScalperExits(row,observations){
 const quotes=observations.filter(q=>q?.ticker===row.ticker&&Number.isFinite(q.at)&&
  q.at>row.at&&q.at<row.expiresAt).sort((a,b)=>a.at-b.at);
 return Object.fromEntries(scalpEngines.flatMap(name=>{
  const trade=row.engines[name];
  if(!trade||trade.won===null)return [];
  const side=trade.decision==='UP'?'yes':'no';
  let peak=0,trigger=null,lastAt=row.at;
  for(const quote of quotes){
   if(quote.at<=lastAt)continue;
   lastAt=quote.at;
   const bid=quote[side]?.price, size=quote[side]?.size;
   if(!Number.isFinite(bid)||bid<=0||bid>=1||!Number.isFinite(size)||size<=0)continue;
   const net=bid-trade.ask-trade.cost-modeledCost(bid);
   if(trigger&&size>=1){
    return [[name,{method:'NEXT_OBSERVED_BID',trigger:trigger.reason,triggerAt:trigger.at,at:quote.at,
     bid,feeAndSlippage:trade.cost+modeledCost(bid),net,settlementNet:trade.net}]];
   }
   peak=Math.max(peak,net);
   const regimeStop=row.regime==='VOLATILE'?.10:.07;
   const reason=net<=-regimeStop?'SELL FAST':net>=.10?'TAKE PROFIT':
    peak>=.05&&peak-net>=.04?'TRAILING EXIT':null;
   if(reason&&!trigger)trigger={reason,at:quote.at};
  }
  return [[name,{method:'SETTLEMENT_FALLBACK',trigger:trigger?.reason??null,
   triggerAt:trigger?.at??null,feeAndSlippage:trade.cost,net:trade.net,settlementNet:trade.net}]];
 }));
}

export function summarizeExitReplay(rows){
 return Object.fromEntries(scalpEngines.map(name=>{
  const trades=rows.map(row=>row.exitReplay?.[name]).filter(Boolean);
  const realized=trades.filter(row=>row.method==='NEXT_OBSERVED_BID');
  const net=trades.reduce((sum,row)=>sum+row.net,0);
  return [name,{sampleSize:trades.length,modeledExits:realized.length,settlementFallbacks:trades.length-realized.length,
   wins:trades.filter(row=>row.net>0).length,losses:trades.filter(row=>row.net<0).length,
   modeledFeeAndSlippage:trades.reduce((sum,row)=>sum+row.feeAndSlippage,0),
   simulatedNetDollars:net,settlementNetDollars:trades.reduce((sum,row)=>sum+row.settlementNet,0)}];
 }));
}
