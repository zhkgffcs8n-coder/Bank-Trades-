import {SETTLEMENT_VERIFICATION} from './official-settlement.mjs';
// Immutable, prospective forecast evidence for SHADOW/PAPER research only.
export function freezeForecast({ticker,asset,at,expiresAt,yesBid,yesAsk,noBid,noAsk,momentumSide=null}){
 if(typeof ticker!=='string'||!ticker||!Number.isFinite(at)||!Number.isFinite(expiresAt)||expiresAt<=at||
 ![yesBid,yesAsk,noBid,noAsk].every(Number.isFinite)||yesBid<0||noBid<0||yesAsk<=0||noAsk<=0||yesAsk>=1||noAsk>=1||yesBid>yesAsk||noBid>noAsk)return null;
 const baseline=(yesBid+yesAsk)/2;
 const direction=['UP','DOWN'].includes(momentumSide)?momentumSide:baseline>=.5?'UP':'DOWN';
 return {version:1,mode:'SHADOW_ONLY',ticker,asset,at,expiresAt,direction,basis:momentumSide?'observed momentum':'market-implied quote direction',baseline,yesAsk,noAsk,status:'PENDING',actionable:false};
}
export function scoreFrozenForecast(row,officialOutcome,now,fee=0.02,slippage=0.01){
 if(row?.status!=='PENDING'||!['UP','DOWN'].includes(row.direction)||!['yes','no'].includes(officialOutcome)||!Number.isFinite(now)||now<=row.at||now<row.expiresAt||![fee,slippage].every(x=>Number.isFinite(x)&&x>=0))return null;
 const outcome=officialOutcome==='yes'?1:0;
 const predicted=row.direction==='UP'?1:0;
 const ask=row.direction==='UP'?row.yesAsk:row.noAsk;
 if(!Number.isFinite(ask)||ask<=0||ask>=1||!Number.isFinite(row.baseline)||row.baseline<=0||row.baseline>=1)return null;
 const won=predicted===outcome;
 return {...row,status:'RESOLVED',resolvedAt:now,officialOutcome,correct:won,baselineBrier:(row.baseline-outcome)**2,directionalBrier:(predicted-outcome)**2,simulatedNetPnl:(won?1:0)-ask-fee-slippage,costAssumptions:{fee,slippage},note:'One hypothetical contract at frozen ask; not a fill or validated probability'};
}

// Summarize only independently resolved frozen forecasts; never label this a trade ledger.
export function summarizeForecastResearch(rows,{truncated=false}={}){
 const observed=Array.isArray(rows)?rows:[];
 const unique=new Map(),conflicts=new Set();
 let excludedUnverified=0,excludedInvalid=0,duplicateRows=0;
 for(const r of observed){
  if(r?.status!=='RESOLVED')continue;
  if(r.outcomeVerification!==SETTLEMENT_VERIFICATION){excludedUnverified++;continue}
  const outcome=r.officialOutcome==='yes'?1:r.officialOutcome==='no'?0:null;
  const predicted=r.direction==='UP'?1:r.direction==='DOWN'?0:null;
  const expectedPnl=outcome===null||predicted===null?NaN:
   (outcome===predicted?1:0)-(predicted===1?r.yesAsk:r.noAsk)-r.costAssumptions?.fee-r.costAssumptions?.slippage;
  if(typeof r.ticker!=='string'||!r.ticker||!Number.isFinite(r.at)||!Number.isFinite(r.expiresAt)||r.expiresAt<=r.at||
   !Number.isFinite(r.resolvedAt)||r.resolvedAt<r.expiresAt||outcome===null||predicted===null||
   r.correct!==(outcome===predicted)||!Number.isFinite(r.baseline)||r.baseline<=0||r.baseline>=1||
   !Number.isFinite(r.baselineBrier)||Math.abs(r.baselineBrier-(r.baseline-outcome)**2)>1e-8||
   !Number.isFinite(r.directionalBrier)||Math.abs(r.directionalBrier-(predicted-outcome)**2)>1e-8||
   !Number.isFinite(expectedPnl)||!Number.isFinite(r.simulatedNetPnl)||Math.abs(r.simulatedNetPnl-expectedPnl)>1e-8){excludedInvalid++;continue}
  if(conflicts.has(r.ticker))continue;
  const prior=unique.get(r.ticker);
  if(prior){
   duplicateRows++;
   if(prior.officialOutcome!==r.officialOutcome||prior.direction!==r.direction||prior.at!==r.at||
    prior.simulatedNetPnl!==r.simulatedNetPnl){unique.delete(r.ticker);conflicts.add(r.ticker)}
  }else unique.set(r.ticker,r);
 }
 const valid=[...unique.values()].sort((a,b)=>a.at-b.at);
 const n=valid.length,wins=valid.filter(r=>r.correct).length;
 const byAsset={};let equity=0,peak=0,maxDrawdown=0;
 for(const r of valid){
  const asset=String(r.asset||'UNKNOWN');const group=byAsset[asset]||(byAsset[asset]={n:0,wins:0,simulatedNetPnl:0});
  group.n++;group.wins+=r.correct?1:0;group.simulatedNetPnl+=r.simulatedNetPnl;
  equity+=r.simulatedNetPnl;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);
 }
 for(const g of Object.values(byAsset)){g.simulatedNetPnl=Number(g.simulatedNetPnl.toFixed(4));g.winRate=g.n?g.wins/g.n:null}
 return {version:2,mode:'SHADOW_ONLY',observedRows:observed.length,n,wins,losses:n-wins,
  excludedUnverified,excludedInvalid,duplicateRows,conflictingTickers:conflicts.size,
  winRate:n?wins/n:null,simulatedNetPnl:Number(equity.toFixed(4)),maxDrawdown:Number(maxDrawdown.toFixed(4)),
  baselineBrier:n?valid.reduce((a,r)=>a+r.baselineBrier,0)/n:null,
  directionalBrier:n?valid.reduce((a,r)=>a+r.directionalBrier,0)/n:null,
  byAsset,truncated,scope:truncated?'FIRST_PAGE_ONLY':'ALL_OBSERVED',modelPromoted:false,
  note:'Verified official labels only; deduplicated hypothetical frozen forecasts, not fills. Assumed costs, bounded archive and no validated model promotion.'};
}
