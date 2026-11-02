// Read-only matched, cost-stressed comparison of Original vs a stricter paper gate.
// Requires a prospective frozen decision and an explicitly verified official outcome.
// No order placement, promotion, or claim of actual fill prices.
import {SETTLEMENT_VERIFICATION} from './official-settlement.mjs';

const buy=(x)=>x?.action==='BUY UP'||x?.action==='BUY DOWN';
const validBuy=(x)=>buy(x)&&x.resolved===true&&
 (x.action==='BUY UP'?x.side==='up':x.side==='down')&&
 Number.isFinite(x.ask)&&x.ask>0&&x.ask<100;
const round=(n)=>Number(n.toFixed(4));

export function costAwarePairedAudit(records,{feeCents=2,slippageCents=1,minimum=100,archiveComplete=true}={}){
 if(![feeCents,slippageCents].every(x=>Number.isFinite(x)&&x>=0&&x<=100)||!Number.isInteger(minimum)||minimum<1||typeof archiveComplete!=='boolean')throw Error('Invalid research cost assumptions');
 const byTicker=new Map(),conflicted=new Set();
 for(const r of Array.isArray(records)?records:[]){
  if(!r||typeof r.ticker!=='string'||!r.ticker)continue;
  const original=r.engines?.original,candidate=r.engines?.upgraded;
  const valid=r.status==='RESOLVED'&&r.outcomeVerification===SETTLEMENT_VERIFICATION&&
   ['yes','no'].includes(r.outcome)&&Number.isFinite(r.at)&&r.at>0&&
   Number.isFinite(r.expiresAt)&&Number.isFinite(r.resolvedAt)&&
   r.at<r.expiresAt&&r.resolvedAt>=r.expiresAt&&validBuy(original)&&
   !!candidate&&(candidate.action==='WAIT'&&candidate.resolved!==true||validBuy(candidate));
  // Inspect every occurrence of a ticker, including malformed or unverified
  // copies. Otherwise an archive could pair one valid record with a contradictory
  // invalid duplicate and still report sufficient verified evidence.
  const decision=x=>x?[x.action??null,x.side??null,x.ask??null,x.resolved===true]:null;
  const fingerprint=JSON.stringify([r.status,r.outcomeVerification??null,
   r.at??null,r.expiresAt??null,r.outcome??null,decision(original),decision(candidate)]);
  const prior=byTicker.get(r.ticker);
  if(prior&&(prior.fingerprint!==fingerprint||prior.valid!==valid))conflicted.add(r.ticker);
  else if(!prior)byTicker.set(r.ticker,{row:r,fingerprint,valid});
 }
 const paired=[...byTicker].filter(([ticker,v])=>v.valid&&!conflicted.has(ticker)).map(([,v])=>v.row);
 paired.sort((a,b)=>a.at-b.at||a.ticker.localeCompare(b.ticker));
 const evaluate=name=>{
  let pnl=0,peak=0,maxDrawdown=0,spent=0,trades=0,wins=0,losses=0;
  for(const r of paired){
   const x=r.engines[name];
   if(!validBuy(x))continue;
   const won=(x.side==='up')===(r.outcome==='yes');
   const entryCost=(x.ask+feeCents+slippageCents)/100;
   const tradePnl=(won?1:0)-entryCost;
   pnl+=tradePnl;spent+=entryCost;trades++;wins+=tradePnl>0?1:0;losses+=tradePnl<=0?1:0;
   peak=Math.max(peak,pnl);maxDrawdown=Math.max(maxDrawdown,peak-pnl);
  }
  return {trades,abstentions:paired.length-trades,wins,losses,
   winRate:trades?round(wins/trades):null,
   costStressedPnl:round(pnl),costStressedRoi:spent?round(pnl/spent):null,
   maxDrawdown:round(maxDrawdown)};
 };
 const original=evaluate('original'),candidate=evaluate('upgraded');
 return {mode:'SHADOW_ONLY',matchedOfficialMarkets:paired.length,conflictingMarketCount:conflicted.size,minimum,
  archiveComplete,scope:archiveComplete?'COMPLETE_ARCHIVE':'PARTIAL_FIRST_PAGE',
  sufficientMatchedMarkets:archiveComplete&&conflicted.size===0&&paired.length>=minimum,
  original,candidate,candidateMinusOriginalPnl:round(candidate.costStressedPnl-original.costStressedPnl),
  brierOriginal:null,brierCandidate:null,automaticPromotionAllowed:false,
  assumptions:{feeCents,slippageCents,entryAtRecordedAsk:true,oneContractPerEntry:true},
  note:(archiveComplete?'':'Incomplete archive: first-page counts and PnL are partial; do not infer sample sufficiency. ')+(conflicted.size?'Conflicting duplicate contracts quarantined; do not infer sample sufficiency until reconciled. ':'')+'Illustrative per-contract costs, not verified Kalshi fees or actual fills. Candidate is a stricter Original gate, not an independently calibrated model. Missing probability forecasts prevent Brier comparison. Requires prospective official settlement verification; no promotion.'};
}
