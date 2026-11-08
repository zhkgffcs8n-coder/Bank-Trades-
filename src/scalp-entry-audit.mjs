import {modeledCost} from './scalper-v8.mjs';

export function auditScalpEntry(previous, snapshot, depth, checks, positions){
 const audit=structuredClone(previous??{ticker:snapshot.ticker,engines:{}});
 if(audit.at>=snapshot.at)return audit;
 audit.at=snapshot.at;
 audit.telemetry=snapshot.entryTelemetry;
 for(const name of ['A','B','C']){
  const engine=audit.engines[name]??={sides:{}};
  const fill=positions[name];
  if(fill?.ticker===snapshot.ticker)engine.fill={...fill};
  for(const side of ['UP','DOWN']){
   const row=engine.sides[side]??={};
   engine.sides[side]=row;
   const bid=side==='UP'?depth.yes:depth.no;
   const opposite=side==='UP'?depth.no:depth.yes;
   const ask=1-opposite.price;
   const early=snapshot.early?.[name]?.[side];
   const decisions=checks[name].filter(check=>check.side===side);
   const quote={at:snapshot.at,ask,spread:ask-bid.price,askSize:opposite.size,bidSize:bid.size};
   if(early||decisions.some(check=>Number.isFinite(check.ask)))row.firstSignal??={...quote,early,decisions};
   const executable=decisions.some(check=>Number.isFinite(check.ask));
   const bestEntry=row.bestExecutable??row.firstExecutable;
   if(bestEntry&&snapshot.at>bestEntry.at&&bid.size>=1){
    const gross=bid.price-bestEntry.ask;
    const net=gross-modeledCost(bestEntry.ask)-modeledCost(bid.price);
    if(net>(row.maximumObserved?.net??-Infinity))
     row.maximumObserved={entry:bestEntry,exitAt:snapshot.at,bid:bid.price,gross,net};
   }
   if(executable){
    row.firstExecutable??=quote;
    if(ask<(row.bestExecutable?.ask??Infinity))row.bestExecutable=quote;
   }
   row.latestReasons=decisions.map(check=>check.reason);
   const first=row.firstExecutable;
   if(first&&snapshot.at>first.at&&bid.size>=1&&bid.price>(row.bestLaterExit?.bid??0)){
    const gross=bid.price-first.ask;
    if(gross>=.05-1e-9)row.firstFivePointMoveAt??=snapshot.at;
    row.bestLaterExit={at:snapshot.at,bid:bid.price,gross,net:gross-modeledCost(first.ask)-modeledCost(bid.price)};
   }
  }
 }
 audit.voltComparison=Object.fromEntries(['UP','DOWN'].map(side=>{
  const volt=audit.engines.B.sides[side].firstExecutable;
  const peers=['A','C'].flatMap(name=>{
   const first=audit.engines[name].sides[side].firstExecutable;
   if(!first||volt&&first.at>=volt.at)return [];
   const best=audit.engines[name].sides[side].bestLaterExit;
   return [{name,first,leadMs:volt?volt.at-first.at:null,askImprovement:volt?volt.ask-first.ask:null,
    unfilledOpportunity:!audit.engines.B.fill&&best?.net>0?best:null}];
  });
  return [side,peers];
 }));
 return audit;
}

export function earlyScalpSignals(snapshot, flow){
 const result={A:{},B:{},C:{}};
 for(const side of ['UP','DOWN']){
  const sign=side==='UP'?1:-1;
  const pressure=sign*snapshot.imbalance;
  const acceleration=sign*snapshot.acceleration;
  const velocity=sign*snapshot.velocity;
  const aggressive=Number.isFinite(flow)&&sign*flow>=.45;
  result.A[side]=pressure>=.15&&acceleration>=.01&&velocity>0;
  result.B[side]=pressure>=.12&&acceleration>=.01&&velocity>0&&(aggressive||pressure>=.25);
  result.C[side]=snapshot.radar===side+' FLIP WATCH'||pressure>=.2&&acceleration>=.02&&velocity>0&&aggressive;
 }
 return result;
}
