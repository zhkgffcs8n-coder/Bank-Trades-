// Pure, deterministic research diagnostics. Only verified settled paper trades count.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function performance(trades=[]){
 const valid=trades.filter(t=>((t.status==='SETTLED'&&['WIN','LOSS'].includes(String(t.settlement).toUpperCase())&&['yes','no'].includes(String(t.marketResult).toLowerCase()))||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.exitBid))))&&['up','down'].includes(t.side)&&Number.isFinite(Number(t.ask))&&Number(t.ask)>0&&Number(t.ask)<100&&Number.isFinite(Number(t.pnl))&&Number.isFinite(Number(t.cost))&&Number(t.cost)>0);
 const summarize=rows=>{
  const n=rows.length,wins=rows.filter(t=>Number(t.pnl)>0).length,losses=n-wins;
  const spent=rows.reduce((s,t)=>s+Number(t.cost),0),pnl=rows.reduce((s,t)=>s+Number(t.pnl),0);
  const rate=n?wins/n:null,avgAsk=n?rows.reduce((s,t)=>s+Number(t.ask),0)/n:null;
  const z=1.96,lower=n?(rate+z*z/(2*n)-z*Math.sqrt(rate*(1-rate)/n+z*z/(4*n*n)))/(1+z*z/n):null;
  return {trades:n,wins,losses,winRate:rate,winRateLower95:lower,spent:Number(spent.toFixed(2)),netPnl:Number(pnl.toFixed(2)),roi:spent?Number((pnl/spent).toFixed(4)):null,avgEntryPercent:avgAsk,breakEvenWinRate:avgAsk==null?null:avgAsk/100};
 };
 const groups={};
 const entryBands={'0-24%':[],'25-49%':[],'50-74%':[],'75-99%':[]};
 const exitReasons={};
 for(const t of valid){
  const ask=Number(t.ask),band=ask<25?'0-24%':ask<50?'25-49%':ask<75?'50-74%':'75-99%';
  entryBands[band].push(t);
  const reason=t.status==='SETTLED'?'OFFICIAL SETTLEMENT':String(t.exitReason||'PAPER EXIT');
  (exitReasons[reason]??=[]).push(t);
 }
 for(const t of valid){
  const key=String(t.asset||'UNKNOWN')+'_'+t.side;
  (groups[key]??=[]).push(t);
 }
 const byStrategy=Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,summarize(v)]));
 // Diagnose losing paper trades without fitting a new rule to the same outcomes.
 // Only fields recorded at entry are used to define cohorts; never infer missing features.
 const ordered=[...valid].sort((a,b)=>Number(a.closedAt||a.settledAt||a.at||0)-Number(b.closedAt||b.settledAt||b.at||0));
 const recent=ordered.slice(-50);
 const byAsset={};
 const bySide={up:[],down:[]};
 const byEntryTime={early:[],middle:[],late:[],unknown:[]};
 for(const t of valid){
  (byAsset[String(t.asset||'UNKNOWN')]??=[]).push(t);
  bySide[t.side].push(t);
  const remaining=Number(t.secondsToExpiryAtEntry);
  const key=!Number.isFinite(remaining)||remaining<=0?'unknown':remaining>=600?'early':remaining>=300?'middle':'late';
  byEntryTime[key].push(t);
 }
 const groupStats=groups=>Object.fromEntries(Object.entries(groups).map(([key,rows])=>[key,summarize(rows)]));
 const recentSummary=summarize(recent);
 const priorSummary=summarize(ordered.slice(-100,-50));
 const losses=valid.filter(t=>Number(t.pnl)<=0);
 const lossReview={
  at:new Date().toISOString(),totalLosses:losses.length,
  grossLoss:Number(losses.reduce((sum,t)=>sum+Number(t.pnl),0).toFixed(2)),
  byAsset:groupStats(byAsset),bySide:groupStats(bySide),byEntryTime:groupStats(byEntryTime),
  recent50:recentSummary,previous50:priorSummary,
  worsening:recentSummary.trades>=30&&priorSummary.trades>=30&&recentSummary.roi<priorSummary.roi,
  insufficientEvidence:Object.entries(byAsset).filter(([,rows])=>rows.length<30).map(([asset])=>asset),
  cautions:['These are retrospective associations, not proven causes of losses.','Do not promote a rule based only on the same trades used to discover it.','Net returns may omit fees and slippage.']
 };
 return {overall:summarize(valid),lossReview,byStrategy,byEntryBand:Object.fromEntries(Object.entries(entryBands).map(([k,v])=>[k,summarize(v)])),byExitReason:Object.fromEntries(Object.entries(exitReasons).map(([k,v])=>[k,summarize(v)])),excluded:trades.length-valid.length,method:'Finalized server paper positions only. Profit/loss includes recorded payout and entry cost; trading fees and slippage are not modeled unless already in ledger.'};
}
export function gatePaperEntry(signal,stats){
 if(!['BUY UP','BUY DOWN'].includes(signal.action))return signal;
 const cohort=stats?.byStrategy?.[signal.asset+'_'+signal.side];
 // Keep initial research observations, but do not claim profitability before sufficient data.
 if(cohort&&cohort.trades>=8&&(cohort.netPnl<=0||cohort.roi<=0))return {...signal,action:'WAIT',validation:'PAPER COHORT LOSS GATE',reason:'At least 8 resolved paper trades in this asset/direction show nonpositive return; paused pending further validation'};
 if(!cohort||cohort.trades<20)return {...signal,validation:'INSUFFICIENT COHORT DATA',reason:signal.reason+'; fewer than 20 resolved trades in this asset/direction'};
 if(cohort.netPnl<=0||cohort.roi<=0)return {...signal,action:'WAIT',validation:'COHORT LOSS',reason:'Historical settled paper trades for this asset/direction have nonpositive net return'};
 const entry=Number(signal.ask)/100;
 if(cohort.winRateLower95<=entry)return {...signal,action:'WAIT',validation:'EDGE UNCONFIRMED',reason:'Conservative win-rate bound does not exceed current entry cost'};
 return {...signal,validation:'PAPER COHORT PASSED',reason:signal.reason+'; historical paper cohort positive but future returns not guaranteed'};
}
