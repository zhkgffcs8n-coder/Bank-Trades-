import {modeledCost} from './scalper-v8.mjs';

const horizons=[60,120];
const sampleJitterMs=5000;
const sides=['UP','DOWN'];
const names=['A','B','C'];
const key=(name,side,ask,horizon)=>[name,side,Math.min(9,Math.floor(ask*10)),horizon].join('/');
const leg=(depth,side)=>side==='UP'?depth.yes:depth.no;
const opposite=(depth,side)=>side==='UP'?depth.no:depth.yes;

function setup(snapshot,depth,name,side){
 if(snapshot.spread>.05||snapshot.imbalance===null||snapshot.expiresAt-snapshot.at<90000)return null;
 const sign=side==='UP'?1:-1;
 const ask=1-opposite(depth,side).price;
 const bid=leg(depth,side).price;
 if(ask<.01-1e-9||ask>.99+1e-9||ask<=bid||ask-bid>.050001||opposite(depth,side).size<1)return null;
 const supported=name==='A'?sign*snapshot.imbalance>=.2&&sign*snapshot.acceleration>=.01:
  name==='B'?sign*snapshot.velocity>=.02&&sign*snapshot.breakout>0:
  snapshot.radar===side+' FLIP WATCH';
 return supported?ask:null;
}

export function observeScalpHunter(tape,snapshot,depth,ideas={}){
 if(!snapshot||!depth?.yes||!depth?.no||snapshot.at!==depth.at||snapshot.imbalance===null)return tape;
 if(tape.some(row=>row.at===snapshot.at&&row.ticker===snapshot.ticker))return tape;
 const setups=names.flatMap(name=>sides.flatMap(side=>{
  const ask=setup(snapshot,depth,name,side);
  return ask===null?[]:[{name,side,ask}];
 }));
 return [...tape,{ticker:snapshot.ticker,at:snapshot.at,expiresAt:snapshot.expiresAt,
  yes:depth.yes,no:depth.no,setups,ideas}].slice(-1440);
}

export function learnScalpHunter(tape,asOf){
 const bins=new Map();
 const known=tape.filter(row=>row.at<asOf).sort((a,b)=>a.at-b.at);
 for(const [index,entry] of known.entries()){
  for(const {name,side,ask} of entry.setups){
   for(const horizon of horizons){
    const target=entry.at+horizon*1000;
    let exit;
    for(let next=index+1;next<known.length&&known[next].at<=target+30000;next++){
     const row=known[next];
     if(row.ticker===entry.ticker&&row.at>=target-sampleJitterMs&&row.at<entry.expiresAt){exit=row;break;}
    }
    if(!exit)continue;
    const quote=leg(exit,side);
    const bid=quote.size>=1?quote.price:null;
    const id=key(name,side,ask,horizon);
    if(!bins.has(id))bins.set(id,new Map());
    const round=bins.get(id);
    if(round.has(entry.ticker))continue;
    const net=bid===null?-ask-modeledCost(ask):bid-ask-modeledCost(ask)-modeledCost(bid);
    round.set(entry.ticker,{net,move:bid===null?null:bid-ask});
   }
  }
 }
 return Object.fromEntries([...bins].map(([id,round])=>{
  const rows=[...round.values()],n=rows.length,wins=rows.filter(row=>row.net>0).length;
  const priced=rows.filter(row=>row.move!==null);
  return [id,{n,wins,meanNet:rows.reduce((sum,row)=>sum+row.net,0)/n,
   meanMove:priced.length?priced.reduce((sum,row)=>sum+row.move,0)/priced.length:null}];
 }));
}

export function forecastScalpHunter(snapshot,depth,profile,diagnostics={}){
 if(!snapshot||!depth||snapshot.at!==depth.at||snapshot.imbalance===null)return {};
 return Object.fromEntries(names.map(name=>{
  const checks=diagnostics[name]=[];
  const ideas=sides.flatMap(side=>{
   const ask=setup(snapshot,depth,name,side);
   if(ask===null){checks.push({side,reason:'NO_EXECUTABLE_SETUP'});return [];}
   return horizons.flatMap(horizon=>{
    const sample=profile[key(name,side,ask,horizon)];
    const evidence={side,ask,horizonSeconds:horizon,sampleSize:sample?.n??0};
    let reason;
    if(snapshot.expiresAt-snapshot.at<(horizon+30)*1000)reason='INSUFFICIENT_TIME';
    else if(!sample||sample.n<12)reason='INSUFFICIENT_COMPARABLE_ROUNDS';
    else if(sample.meanNet<=.015||sample.wins/sample.n<.65||!Number.isFinite(sample.meanMove))
     reason='INSUFFICIENT_HISTORICAL_EDGE';
    if(reason){checks.push({...evidence,reason});return [];}
    const target=Math.min(.99,ask+sample.meanMove);
    if(target-ask-modeledCost(ask)-modeledCost(target)<=.015){
     checks.push({...evidence,reason:'INSUFFICIENT_NET_TARGET'});return [];
    }
    checks.push({...evidence,reason:'QUALIFIED'});
    return [{side,ask,target,horizonSeconds:horizon,observedHitRate:sample.wins/sample.n,
     sampleSize:sample.n,estimatedNet:sample.meanNet,mode:'SHADOW_ONLY'}];
   });
  });
  return [name,ideas.sort((a,b)=>b.estimatedNet-a.estimatedNet)[0]??null];
 }));
}

export function scoreScalpHunter(tape,exit){
 return tape.filter(entry=>entry.ticker===exit.ticker&&entry.at<exit.at&&exit.at<entry.expiresAt)
  .flatMap(entry=>Object.entries(entry.ideas||{}).flatMap(([name,idea])=>{
   if(!idea)return [];
   const targetAt=entry.at+idea.horizonSeconds*1000;
   if(exit.at<targetAt-sampleJitterMs||exit.at>targetAt+30000)return [];
   const quote=leg(exit,idea.side);
   const bid=quote.size>=1?quote.price:null;
   return [{ticker:entry.ticker,name,entryAt:entry.at,observedAt:exit.at,bid,idea,
    net:bid===null?null:bid-idea.ask-modeledCost(idea.ask)-modeledCost(bid),
    status:bid===null?'INSUFFICIENT_EXIT_DEPTH':'MODELED_EXIT'}];
  }));
}
