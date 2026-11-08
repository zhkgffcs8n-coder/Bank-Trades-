// BTC-only forward experiment. All positions are local simulations.
const cost=price=>Math.ceil(7*price*(1-price))/100+.01;
const bounds=(low,high,value)=>Math.max(low,Math.min(high,value));
const priceFor=(book,side)=>side==='UP'?book.yes:book.no;
const askFor=(book,side)=>1-priceFor(book,side==='UP'?'DOWN':'UP').price;
const netAt=(entry,bid)=>bid-entry-cost(entry)-cost(bid);

export function predatorObservation({ticker,now,bookAt,remaining,yes,no,trades,monitoring=false}){
 if(!ticker?.startsWith('KXBTC15M-')||!(now-bookAt>=0&&now-bookAt<=4000)||remaining<=0||
  ![yes,no].every(level=>level&&level.price>0&&level.price<1&&level.size>=1))return null;
 const spread=1-yes.price-no.price;
 if(!(spread>0&&(monitoring||spread<=.050001)))return null;
 const book={ticker,now,bookAt,remaining,yes,no};
 const rows=trades.filter(row=>row.time<=now&&row.time>=now-12000);
 if(rows.length<12||now-rows.at(-1).time>2500)return book;
 const fast=rows.filter(row=>row.time>=now-3000), prior=rows.filter(row=>row.time<now-3000);
 if(fast.length<4||prior.length<8||prior.at(-1).time-prior[0].time<4000)return book;
 const prices=prior.map(row=>row.price),reference=prior.at(-1).price;
 const high=Math.max(...prices),low=Math.min(...prices);
 const compression=(high-low)/reference;
 const change=(fast.at(-1).price-reference)/reference;
 const priorChange=(reference-prior[0].price)/reference;
 const volume=fast.reduce((sum,row)=>sum+Math.abs(row.flow),0);
 const flow=volume?fast.reduce((sum,row)=>sum+row.flow,0)/volume:0;
 const imbalance=(yes.size-no.size)/(yes.size+no.size);
 const side=flow>0?'UP':'DOWN',sign=side==='UP'?1:-1;
 const velocity=change/3,acceleration=velocity-priorChange/9;
 const baselineSide=change>=.00015?'UP':change<=-.00015?'DOWN':null;
 const early=remaining>=45&&compression<=.00025&&Math.abs(flow)>=.45&&sign*imbalance>=.12&&
  sign*acceleration>=.000009&&sign*change>0&&baselineSide===null;
 return {ticker,now,bookAt,remaining,yes,no,side,early,baselineSide,flow,imbalance,
  acceleration,compression,sourceEventAt:rows.at(-1).time};
}

export function openPredatorWatch(observation){
 if(!observation?.early)return null;
 const {side,now,ticker}=observation;
 const ask=askFor(observation,side);
 if(!(ask>0&&ask<1))return null;
 const target=Math.min(.999,ask+bounds(.045,.12,.035+Math.abs(observation.flow)*.045+Math.abs(observation.imbalance)*.03));
 if(target>=1||netAt(ask,target)<.015)return null;
 return {ticker,side,at:now,sourceEventAt:observation.sourceEventAt,ask,target,
  quantity:priceFor(observation,side==='UP'?'DOWN':'UP').size,
  estimatedNet:netAt(ask,target),deadline:now+30000,peakNet:0,baseline:null};
}

export function advancePredatorWatch(watch,observation){
 if(!observation||observation.ticker!==watch.ticker||observation.now<=watch.at)return watch;
 const {now,remaining}=observation;
 if(watch.warningMs===undefined&&now>watch.deadline+6000)return {...watch,reason:'UNSCORED_GAP',closedAt:now};
 const bid=priceFor(observation,watch.side).price;
 const net=netAt(watch.ask,bid),peakNet=Math.max(watch.peakNet,net);
 const baseline=watch.baseline??(observation.baselineSide===watch.side&&now<=watch.deadline
  ?{at:now,ask:askFor(observation,watch.side)}:null);
 const weakening=watch.warningMs!==undefined&&net>0&&(
  1-observation.yes.price-observation.no.price>.050001||
  observation.sourceEventAt&&observation.side!==watch.side&&Math.abs(observation.flow)>=.45);
 const micro=watch.strategyVersion===18;
 const reserve=micro?.01:0;
 const peakGiveback=bounds(.015,.04,peakNet*.35);
 const protectProfit=micro&&peakNet>reserve+.015&&peakNet-net>=peakGiveback;
 const stop=Number.isFinite(watch.entryBid)?bid-watch.entryBid<=-.07+1e-9:net<=-.07;
 const reason=bid>=watch.target&&net>(watch.version===16?.01:0)?'TAKE PROFIT':stop?'SELL FAST':
  (weakening&&net>reserve)||protectProfit||!micro&&peakNet>=.05&&peakNet-net>=.03?'TRAIL EXIT':now>=watch.deadline||remaining<=5?'TIME EXIT':null;
 return {...watch,peakNet,peakBid:Math.max(watch.peakBid??watch.entryBid??bid,bid),baseline,bid,net,...(reason?{reason,closedAt:now,
  baselineNet:baseline?netAt(baseline.ask,bid):null,leadMs:baseline?baseline.at-watch.at:null}:{})};
}

// A watch is a prediction. A later fresh observation supplies the modeled fill.
export function confirmPredatorEntry(watch, observation){
 if(!watch||!observation||watch.ticker!==observation.ticker||
    observation.now<=watch.at||observation.now-watch.at>10000||
    observation.sourceEventAt<=watch.sourceEventAt||!observation.sourceEventAt||
    observation.remaining<35||observation.side!==watch.side)return null;
 const sign=watch.side==='UP'?1:-1;
 const ask=askFor(observation,watch.side);
 if(!(ask>0&&ask<1)||
    Math.abs(observation.flow)<.45||sign*observation.imbalance<.12||
    sign*observation.acceleration<=0||netAt(ask,watch.target)<.025)return null;
 return {...watch,ask,entryBid:priceFor(observation,watch.side).price,at:observation.now,watchAt:watch.at,watchAsk:watch.ask,
  warningMs:observation.now-watch.at,deadline:observation.now+30000,
  entryCost:cost(ask),estimatedNet:netAt(ask,watch.target)};
}

// Freeze the available ask before confirmation, without opening a paper position.
export function predatorEarlyProbe(observation,previous){
 if(!observation?.sourceEventAt||observation.now-observation.bookAt>1500||
    observation.now<observation.bookAt||observation.remaining<8)return null;
 const {side,yes,no}=observation;
 const spread=1-yes.price-no.price;
 const sign=side==='UP'?1:-1;
 const bookChanged=previous?.ticker===observation.ticker&&
  observation.bookAt>previous.bookAt&&observation.bookAt-previous.bookAt<=1500;
 const compression=bookChanged&&previous.spread-spread>=.0099;
 const supported=compression&&sign*observation.flow>=.45&&
  sign*observation.imbalance>=.12&&sign*observation.acceleration>0;
 if(!observation.early&&!supported)return null;
 const ask=askFor(observation,side);
 const bid=priceFor(observation,side).price;
 return {ticker:observation.ticker,at:observation.now,bookAt:observation.bookAt,
  side,ask,bid,spread,sourceEventAt:observation.sourceEventAt,
  reason:supported?'SPREAD_COMPRESSION_WITH_FLOW':'EARLY_FLOW_AND_ACCELERATION',scored:{}};
}
