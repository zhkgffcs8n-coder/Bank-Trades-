import {validCollectorQuote} from './collector-quote.mjs';
import {trustedStoredFinalizedOutcome} from './official-settlement.mjs';

const clip=(value,limit)=>Math.max(-limit,Math.min(limit,value));
export const scalpEngines=['A','B','C','Market'];
export const modeledCost=price=>Math.ceil(7*price*(1-price))/100+.01;

export function evaluateScalperV8(quote,history,depth=null){
 const {ticker,observedAt,expiresAt,yesBid,yesAsk,noBid,noAsk}=quote;
 if(!ticker||!validCollectorQuote(quote)||!Number.isFinite(observedAt)||!(expiresAt>observedAt&&expiresAt-observedAt<=900000))return null;
 const imbalance=Number.isFinite(depth?.at)&&depth.at>=observedAt&&depth.at-observedAt<=5000&&
  depth.at<expiresAt&&depth.ticker===ticker&&Number.isFinite(depth.imbalance)&&Math.abs(depth.imbalance)<=1?depth.imbalance:null;
 const at=imbalance===null?observedAt:depth.at;
 const previous=[...new Map(history.filter(row=>row.ticker===ticker&&Number.isFinite(row.t)&&
  row.observedAt<observedAt&&observedAt-row.observedAt<=240000&&row.yesMid>0&&row.yesMid<1)
  .map(row=>[row.t,row])).values()].sort((a,b)=>a.observedAt-b.observedAt);
 if(previous.length<2)return null;
 const baseline=(yesBid+yesAsk+2-noBid-noAsk)/4;
 const last=previous.at(-1),prior=previous.at(-2);
 const velocity=(baseline-last.yesMid)*60000/Math.max(1000,at-last.observedAt);
 const previousVelocity=(last.yesMid-prior.yesMid)*60000/Math.max(1000,last.observedAt-prior.observedAt);
 const acceleration=velocity-previousVelocity;
 const high=Math.max(...previous.map(row=>row.yesMid));
 const low=Math.min(...previous.map(row=>row.yesMid));
 const breakout=baseline>high?baseline-high:baseline<low?baseline-low:0;
 const spread=Math.max(yesAsk-yesBid,noAsk-noBid);
 const regime=high-low>.12?'VOLATILE':Math.abs(breakout)>.02?'BREAKOUT':'RANGE';
 const adjustments={
  A:.6*velocity+.2*acceleration,
  B:.8*breakout+(imbalance??0)*.03,
  C:Math.sign(previousVelocity)!==Math.sign(velocity)?velocity*.55+acceleration*.15:0,
  Market:0
 };
 const engines=Object.fromEntries(scalpEngines.map(name=>{
  const probability=Math.max(.01,Math.min(.99,baseline+clip(adjustments[name],.15)));
  const up=probability-yesAsk-modeledCost(yesAsk),down=1-probability-noAsk-modeledCost(noAsk);
  const edge=Math.max(up,down), side=up>=down?'UP':'DOWN';
  const decision=expiresAt-at>=120000&&spread<=.05&&edge>=.02?side:'SKIP';
  const ask=decision==='SKIP'?null:side==='UP'?yesAsk:noAsk;
  return [name,{probability,edge,decision,ask,cost:ask===null?null:modeledCost(ask)}];
 }));
 const reversal=Math.abs(velocity)>=.015&&Math.abs(previousVelocity)>=.015&&velocity*previousVelocity<0;
 const alignedDepth=imbalance===null||imbalance*velocity>=0;
 const radar=spread>.05||!alignedDepth?'UNCONFIRMED':reversal?velocity>0?'UP FLIP WATCH':'DOWN FLIP WATCH':
  Math.abs(breakout)>=.02&&breakout*velocity>0?velocity>0?'UP LOCK WATCH':'DOWN LOCK WATCH':'NO WATCH';
 return {ticker,at,expiresAt,baseline,spread,regime,velocity,acceleration,breakout,imbalance,radar,engines,mode:'SHADOW_ONLY'};
}

export function scoreScalperV8(row,label,now){
 if(row?.mode!=='SHADOW_ONLY'||!trustedStoredFinalizedOutcome(label,row.ticker)||
  !(row.at<row.expiresAt&&row.expiresAt<=label.labeledAt&&label.labeledAt<=now))return null;
 const outcome=label.result==='yes'?1:0;
 const engines=Object.fromEntries(scalpEngines.map(name=>{
  const prediction=row.engines[name];
  const traded=prediction.decision!=='SKIP';
  const won=traded?(prediction.decision==='UP')===Boolean(outcome):null;
  return [name,{...prediction,won,brier:(prediction.probability-outcome)**2,
   net:traded?(Number(won)-prediction.ask-prediction.cost):0}];
 }));
 return {...row,outcome,engines,resolvedAt:now,verification:label.verification};
}

export function summarizeScalperV8(rows){
 const ordered=[...rows].sort((a,b)=>a.at-b.at);
 return Object.fromEntries(scalpEngines.map(name=>{
  let wins=0,losses=0,net=0,peak=0,drawdown=0,brier=0,correct=0;
  for(const row of ordered){
   const result=row.engines[name];
   wins+=Number(result.won===true);losses+=Number(result.won===false);
   net+=result.net;peak=Math.max(peak,net);drawdown=Math.max(drawdown,peak-net);
   brier+=result.brier;correct+=Number(Number(result.probability>=.5)===row.outcome);
  }
  return [name,{sampleSize:ordered.length,wins,losses,winRate:wins+losses?wins/(wins+losses):null,
   simulatedNetDollars:net,maxDrawdown:drawdown,brier:ordered.length?brier/ordered.length:null,
   accuracy:ordered.length?correct/ordered.length:null}];
 }));
}

export function parseDepthV8(payload,ticker,at,quote){
 const book=payload?.orderbook_fp;
 const best=levels=>Array.isArray(levels)?levels.reduce((top,row)=>{
  if(!Array.isArray(row))return top;
  const price=Number(row[0]),size=Number(row[1]);
  return price>0&&price<1&&Number.isFinite(size)&&size>0&&(!top||price>top.price)?{price,size}:top;
 },null):null;
 const yes=best(book?.yes_dollars),no=best(book?.no_dollars);
 if(!yes||!no||yes.price+no.price>1||Math.abs(yes.price-quote.yesBid)>.01||
  Math.abs(no.price-quote.noBid)>.01)return null;
 return {ticker,at,yes,no,imbalance:(yes.size-no.size)/(yes.size+no.size)};
}
