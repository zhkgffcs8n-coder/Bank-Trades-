// Paired, immutable PAPER-RESEARCH observations. Not the heuristic engine committee.
// A = existing original momentum signal. B = separately computed short-window trend
// confirmation; B is not a trained/calibrated model or independent market evidence.
import {paperSignal} from '../netlify/functions/lib/shared-paper-signals.mjs';
import {trustedStoredFinalizedOutcome} from './official-settlement.mjs';

const num=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars']):m?.[k]!=null?Number(m[k])/100:NaN;
const isBuy=a=>a==='BUY UP'||a==='BUY DOWN';
const side=a=>a==='BUY UP'?'up':a==='BUY DOWN'?'down':null;
const wait=reason=>({action:'WAIT',side:null,reason});
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));

export function engineBTrend(m,records,now){
 const ticker=m?.ticker,expiry=Date.parse(m?.expected_expiration_time||m?.expiration_time||m?.close_time||'');
 const bid=num(m,'yes_bid'),ask=num(m,'yes_ask'),noBid=num(m,'no_bid'),noAsk=num(m,'no_ask');
 if(!ticker||![bid,ask,noBid,noAsk].every(Number.isFinite)||bid<0||noBid<0||ask<=0||noAsk<=0||ask>=1||noAsk>=1||bid>ask||noBid>noAsk)return wait('B: missing or invalid executable bid/ask');
 if(Math.max(ask-bid,noAsk-noBid)>.04)return wait('B: spread exceeds four cents');
 if(!Number.isFinite(expiry)||expiry-now<=180000||expiry-now>930000)return wait('B: contract outside entry-time window');
 const rows=(Array.isArray(records)?records:[]).filter(r=>r?.ticker===ticker&&Number.isFinite(r.t)&&r.t<=now&&r.t>=now-480000&&Number.isFinite(r.yesMid)&&r.yesMid>=0&&r.yesMid<=1)
  .sort((a,b)=>a.t-b.t).filter((r,i,a)=>i===0||r.t!==a[i-1].t).slice(-6);
 if(rows.length<4)return wait('B: fewer than four distinct same-contract samples');
 if(now-rows.at(-1).t>90000)return wait('B: latest sample older than 90 seconds');
 const last=rows.slice(-4);
 if(last.at(-1).t-last[0].t<180000)return wait('B: less than three minutes of trend history');
 const changes=last.slice(1).map((r,i)=>r.yesMid-last[i].yesMid);
 const net=changes.reduce((s,v)=>s+v,0);
 const direction=net>.02?'up':net<-.02?'down':null;
 if(!direction)return wait('B: short-window trend lacks two-cent direction');
 const agreement=changes.filter(v=>direction==='up'?v>0:v<0).length/changes.length;
 if(agreement<2/3)return wait('B: short-window trend disagrees across samples');
 const entry=direction==='up'?ask:noAsk;
 if(entry<.20||entry>.85)return wait('B: executable ask outside 20–85 cents');
 return {action:direction==='up'?'BUY UP':'BUY DOWN',side:direction,ask:Math.round(entry*10000)/100,score:Math.round(clamp(50+Math.abs(net)*500+agreement*15,0,95)),reason:'Independent short-window trend rule; experimental, uncalibrated'};
}

export function pairedShadow(m,records,now=Date.now()){
 const ticker=m?.ticker||null;
 const quote={yesBid:num(m,'yes_bid'),yesAsk:num(m,'yes_ask'),noBid:num(m,'no_bid'),noAsk:num(m,'no_ask')};
 const quoteValid=Object.values(quote).every(Number.isFinite)&&quote.yesAsk>0&&quote.noAsk>0&&quote.yesAsk<1&&quote.noAsk<1&&quote.yesBid>=0&&quote.noBid>=0&&quote.yesBid<=quote.yesAsk&&quote.noBid<=quote.noAsk;
 const a=paperSignal(m,records,null,now,null),b=engineBTrend(m,records,now);
 const reasons=[];
 if(!ticker)reasons.push('Missing contract ticker');
 if(!quoteValid)reasons.push('Invalid paired quote');
 if(!isBuy(a.action))reasons.push('A: '+(a.reason||'no valid prediction'));
 if(!isBuy(b.action))reasons.push(b.reason||'B: no valid prediction');
 if(isBuy(a.action)&&isBuy(b.action)&&side(a.action)!==side(b.action))reasons.push('A/B disagree on direction');
 const agreement=reasons.length===0;
 return {version:1,mode:'SHADOW_ONLY',ticker,at:now,expiresAt:a.expiresAt,quote,quoteSource:'single Kalshi market snapshot',engines:{
  A:{action:a.action,side:side(a.action),askCents:Number.isFinite(a.ask)?a.ask:null,score:Number.isFinite(a.score)?a.score:null,reason:a.reason||null},
  B:{action:b.action,side:side(b.action),askCents:Number.isFinite(b.ask)?b.ask:null,score:Number.isFinite(b.score)?b.score:null,reason:b.reason||null}},
  hybrid:{action:'WAIT',researchConsensus:agreement?(side(a.action)==='up'?'UP':'DOWN'):null,reason:agreement?'Research agreement only; NOT a trade instruction':reasons.join('; '),authorized:false},
  costs:{spreadCents:quoteValid?Math.round(Math.max(quote.yesAsk-quote.yesBid,quote.noAsk-quote.noBid)*10000)/100:null,feePerContract:null,slippagePerContract:null,costAdjustedPnl:null},
  calibration:{A:'Uncalibrated rule score',B:'Uncalibrated rule score',hybrid:'No calibrated probability or demonstrated edge'},
  status:'PENDING',settlement:null};
}

export function resolvePairedShadow(row,outcome,now=Date.now()){
 if(row?.status!=='PENDING'||!row.ticker||!Number.isFinite(row.at)||!Number.isFinite(row.expiresAt)||row.at>=row.expiresAt)return null;
 const result=trustedStoredFinalizedOutcome(outcome,row.ticker);
 if(!result)return null;
 const evaluate=(direction)=>{
  if(!['up','down'].includes(direction))return {evaluated:false,correct:null,grossPnl:null,netPnl:null};
  const ask=direction==='up'?row.quote?.yesAsk:row.quote?.noAsk;
  if(!Number.isFinite(ask)||ask<=0||ask>=1)return {evaluated:false,correct:null,grossPnl:null,netPnl:null};
  const correct=(direction==='up')===(result==='yes');
  return {evaluated:true,correct,grossPnl:Number(((correct?1:0)-ask).toFixed(4)),netPnl:null};
 };
 return {...row,status:'RESOLVED',settlement:{verified:true,result,at:now,source:'strict Kalshi finalized binary label'},
  evaluation:{A:evaluate(row.engines?.A?.side),B:evaluate(row.engines?.B?.side),
   hybrid:evaluate(row.hybrid?.researchConsensus==='UP'?'up':row.hybrid?.researchConsensus==='DOWN'?'down':null),
   note:'Counterfactual one-contract gross payout only. Fees, spread impact, slippage, fill probability and calibration are not validated; net P&L unavailable.'}};
}
