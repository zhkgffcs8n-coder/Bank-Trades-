// Shadow-only cost-aware comparison on prospectively recorded, officially settled markets.
// All costs are in dollars per $1 binary contract; no orders are sent.
export function strategyProfitAudit(records,{minimum=100,fee=.02,slippage=.01}={}){
 const valid=x=>typeof x==='number'&&Number.isFinite(x);
 const unique=new Set(),rows=[];
 for(const r of Array.isArray(records)?records:[]){
  if(!r||typeof r.id!=='string'||!r.id||unique.has(r.id))continue;
  if(!valid(r.recordedAt)||!valid(r.settledAt)||r.recordedAt>=r.settledAt||![0,1].includes(r.outcome))continue;
  if(!['UP','DOWN','WAIT'].includes(r.direction)||!valid(r.ask)||r.ask<=0||r.ask>=1)continue;
  unique.add(r.id);rows.push(r);
 }
 let pnl=0,peak=0,maxDrawdown=0,wins=0,losses=0,trades=0;
 const curve=[];
 for(const r of rows.sort((a,b)=>a.recordedAt-b.recordedAt)){
  if(r.direction==='WAIT')continue;
  trades++;
  const settled=r.direction==='UP'?r.outcome:1-r.outcome;
  const net=settled-r.ask-fee-slippage;
  pnl+=net;if(net>0)wins++;else losses++;
  peak=Math.max(peak,pnl);maxDrawdown=Math.max(maxDrawdown,peak-pnl);
  curve.push({id:r.id,net,cumulative:pnl});
 }
 return {mode:'SHADOW_ONLY',observations:rows.length,trades,wins,losses,
  winRate:trades?wins/trades:null,netPnlPerOneContract:pnl,
  averageNetPerTrade:trades?pnl/trades:null,maxDrawdownPerOneContract:maxDrawdown,
  assumptions:{fee,slippage,exit:'HOLD_TO_SETTLEMENT_ONLY'},
  sufficientEvidence:trades>=minimum,
  candidateProfitable:trades>=minimum&&pnl>0,
  note:'Hypothetical one-contract settlement PnL. Requires actual prospective bid/ask quotes, verified outcomes, real fees and slippage. No early-exit modeling or live trading authorization.'};
}
