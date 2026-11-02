import {SETTLEMENT_VERIFICATION} from '../../../src/official-settlement.mjs';

// Pure, deterministic research diagnostics. Only verified settled paper trades count.
export const hasRecordedNumber=v=>(typeof v==='number'||(typeof v==='string'&&v.trim()!==''))&&Number.isFinite(Number(v));

// A repeated paper trade ID is ambiguous cash evidence even when its copies
// are identical. Quarantine ALL open copies before simulated payouts/exits;
// reporting deduplication alone does not prevent the ledger paying twice.
export function duplicatePaperTradeIds(trades){
 const seen=new Set(),duplicates=new Set();
 for(const t of Array.isArray(trades)?trades:[]){
  if(typeof t?.id!=='string'||!t.id.trim())continue;
  const id=t.id.trim();
  if(seen.has(id))duplicates.add(id);
  else seen.add(id);
 }
 return duplicates;
}
 // A corrupt OPEN record must not generate a fabricated official settlement or cash payout.
export function validOpenPaperPosition(t){
 if(!t||t.status!=='OPEN'||typeof t.id!=='string'||!t.id.trim()||
  typeof t.ticker!=='string'||!t.ticker.trim()||
  !['up','down'].includes(t.side)||!hasRecordedNumber(t.qty)||
  !hasRecordedNumber(t.ask)||!hasRecordedNumber(t.cost))return false;
 const qty=Number(t.qty),ask=Number(t.ask),cost=Number(t.cost);
 return Number.isSafeInteger(qty)&&qty>0&&ask>0&&ask<100&&cost>0&&
  Math.abs(cost-Math.round(qty*ask)/100)<=.031;
}

// Require paper P/L to reconcile to the recorded entry and outcome. A label or
// a numeric P/L alone is not proof that a simulated trade was accounted for.
export function reconciledPaperTrade(t){
 if(!t||!['up','down'].includes(t.side)||!hasRecordedNumber(t.qty)||!hasRecordedNumber(t.cost)||!hasRecordedNumber(t.ask)||!hasRecordedNumber(t.pnl))return false;
 const qty=Number(t.qty),cost=Number(t.cost),ask=Number(t.ask),pnl=Number(t.pnl);
 if(!Number.isInteger(qty)||qty<1||cost<=0||ask<=0||ask>=100||Math.abs(cost-qty*ask/100)>.03)return false;
 let expected;
 if(t.status==='SETTLED'){
  // A disputed official outcome must never qualify as a verified paper win/loss,
  // even if a legacy record still carries a previously verified marker.
  if(t.outcomeConflict===true)return false;
  // Legacy settlement labels are not proof of an official finalized market.
  // Do not count their apparent wins or losses until independently reverified.
  if(t.outcomeVerification!==SETTLEMENT_VERIFICATION)return false;
  const outcome=String(t.marketResult).toLowerCase();
  if(!['yes','no'].includes(outcome))return false;
  const won=(t.side==='up')===(outcome==='yes');
  if(String(t.settlement).toUpperCase()!==(won?'WIN':'LOSS'))return false;
  expected=(won?qty:0)-cost;
 }else if(t.status==='CLOSED'&&t.paperExitOnly===true){
  if(!hasRecordedNumber(t.exitBid))return false;
  const bid=Number(t.exitBid);
  if(bid<0||bid>100||bid>ask+100)return false;
  expected=Math.round(qty*bid)/100-cost;
  const label=pnl>0?'WIN':pnl<0?'LOSS':'TIE';
  if(t.settlement!=null&&String(t.settlement).toUpperCase()!==label)return false;
 }else return false;
 return Math.abs(expected-pnl)<=.021;
}
export function performance(trades=[]){
 // Duplicate archived paper IDs must not inflate wins, cash returns or the
 // cohort gate. Keep one identical copy, but quarantine ALL copies when an ID
 // has contradictory evidence (including an invalid/unverified copy).
 // Legacy ID-less records retain their existing independent validation path.
 const source=Array.isArray(trades)?trades:[];
 const firstById=new Map(),conflictingIds=new Set();
 for(const t of source){
  if(typeof t?.id!=='string'||!t.id.trim())continue;
  const id=t.id.trim();
  // The payout guard already treats whitespace-padded IDs as the same trade.
  // Normalize both the map key and fingerprint so performance cannot count
  // padded aliases twice or ignore contradictory copies.
  const fingerprint=JSON.stringify({...t,id});
  const first=firstById.get(id);
  if(first&&first.fingerprint!==fingerprint)conflictingIds.add(id);
  else if(!first)firstById.set(id,{row:t,fingerprint});
 }
 const seenIds=new Set();
 const unique=source.filter(t=>{
  if(typeof t?.id!=='string'||!t.id.trim())return true;
  const id=t.id.trim();
  if(conflictingIds.has(id)||seenIds.has(id))return false;
  seenIds.add(id);return true;
 });
 const eligible=unique.filter(t=>t?.entryBasis!=='UNVALIDATED QUOTE-BASED PAPER TEST');
 const explorationExcluded=source.filter(t=>t?.entryBasis==='UNVALIDATED QUOTE-BASED PAPER TEST').length;
 const valid=eligible.filter(reconciledPaperTrade);
 const summarize=rows=>{
  const n=rows.length,wins=rows.filter(t=>Number(t.pnl)>0).length,losses=rows.filter(t=>Number(t.pnl)<0).length,ties=n-wins-losses;
  const spent=rows.reduce((s,t)=>s+Number(t.cost),0),pnl=rows.reduce((s,t)=>s+Number(t.pnl),0);
  const rate=n?wins/n:null,avgAsk=n?rows.reduce((s,t)=>s+Number(t.ask),0)/n:null;
  const z=1.96,lower=n?(rate+z*z/(2*n)-z*Math.sqrt(rate*(1-rate)/n+z*z/(4*n*n)))/(1+z*z/n):null;
  return {trades:n,wins,losses,ties,winRate:rate,winRateLower95:lower,spent:Number(spent.toFixed(2)),netPnl:Number(pnl.toFixed(2)),roi:spent?Number((pnl/spent).toFixed(4)):null,avgEntryPercent:avgAsk,breakEvenWinRate:avgAsk==null?null:avgAsk/100};
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
 const losses=valid.filter(t=>Number(t.pnl)<0);
 const lossReview={
  at:new Date().toISOString(),totalLosses:losses.length,
  grossLoss:Number(losses.reduce((sum,t)=>sum+Number(t.pnl),0).toFixed(2)),
  byAsset:groupStats(byAsset),bySide:groupStats(bySide),byEntryTime:groupStats(byEntryTime),
  recent50:recentSummary,previous50:priorSummary,
  worsening:recentSummary.trades>=30&&priorSummary.trades>=30&&recentSummary.roi<priorSummary.roi,
  insufficientEvidence:Object.entries(byAsset).filter(([,rows])=>rows.length<30).map(([asset])=>asset),
  cautions:['These are retrospective associations, not proven causes of losses.','Do not promote a rule based only on the same trades used to discover it.','Net returns may omit fees and slippage.']
 };
 return {overall:summarize(valid),lossReview,byStrategy,byEntryBand:Object.fromEntries(Object.entries(entryBands).map(([k,v])=>[k,summarize(v)])),byExitReason:Object.fromEntries(Object.entries(exitReasons).map(([k,v])=>[k,summarize(v)])),excluded:source.length-valid.length,explorationExcluded,duplicateIdExcludedCount:source.filter(t=>typeof t?.id==='string'&&t.id.trim()).length-seenIds.size,conflictingDuplicateIdCount:conflictingIds.size,method:'Finalized server paper positions only. Profit/loss includes recorded payout and entry cost; trading fees and slippage are not modeled unless already in ledger.'};
}
export function gatePaperEntry(signal,stats){
 if(!['BUY UP','BUY DOWN'].includes(signal.action))return signal;
 const cohort=stats?.byStrategy?.[signal.asset+'_'+signal.side];
 // A broad deterioration signal pauses NEW paper entries, not existing exits.
 // This uses already-finalized positions and never rewrites past results.
 const recent=stats?.lossReview?.recent50;
 const prior=stats?.lossReview?.previous50;
 if(recent?.trades>=30&&prior?.trades>=30&&
    Number.isFinite(recent.roi)&&Number.isFinite(prior.roi)&&
    recent.roi<0&&recent.roi<prior.roi)
  return {...signal,action:'WAIT',validation:'RECENT PAPER DRAWDOWN',
    reason:'Recent 50 finalized paper trades are losing and worse than the preceding 50; new entries paused pending prospective validation'};

 // Keep initial research observations, but do not claim profitability before sufficient data.
 if(cohort&&cohort.trades>=8&&(cohort.netPnl<=0||cohort.roi<=0))return {...signal,action:'WAIT',validation:'PAPER COHORT LOSS GATE',reason:'At least 8 resolved paper trades in this asset/direction show nonpositive return; paused pending further validation'};
 if(!cohort||cohort.trades<20)return {...signal,validation:'INSUFFICIENT COHORT DATA',reason:signal.reason+'; fewer than 20 resolved trades in this asset/direction'};
 if(cohort.netPnl<=0||cohort.roi<=0)return {...signal,action:'WAIT',validation:'COHORT LOSS',reason:'Historical settled paper trades for this asset/direction have nonpositive net return'};
 const entry=Number(signal.ask)/100;
 if(cohort.winRateLower95<=entry)return {...signal,action:'WAIT',validation:'EDGE UNCONFIRMED',reason:'Conservative win-rate bound does not exceed current entry cost'};
 return {...signal,validation:'PAPER COHORT PASSED',reason:signal.reason+'; historical paper cohort positive but future returns not guaranteed'};
}
