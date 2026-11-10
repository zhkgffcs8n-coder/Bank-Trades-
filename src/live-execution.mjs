// Isolated execution state machine. No imports from or writes to paper/flip history.
import {randomUUID} from 'node:crypto';
import {accountRisk,settlementFor} from './live-accounting.mjs';
export const REQUIRED_CHECKS=['authentication','orderLifecycle','partialFills','positionReconciliation','concurrentSpending','emergencyCancellation','workerHeartbeat','ownerIsolation'];
export function releaseFailures(evidence,commit,now=Date.now()){
 return REQUIRED_CHECKS.filter(k=>!commit||evidence?.commit!==commit||evidence?.checks?.[k]!==true||!Number.isFinite(evidence?.at)||now-evidence.at<0||now-evidence.at>3600000);
}
export const ENTRY_MODES=Object.freeze({easy:70,balanced:60,extreme:0});
export function qualifiesLiveEntry(signal,mode='balanced'){
 return Object.hasOwn(ENTRY_MODES,mode)&&signal.roundAssessment?.entryQualified===true&&
  ['BUY UP','BUY DOWN'].includes(signal.action)&&signal.entryGate?.finalAction===signal.action&&
  Number.isFinite(signal.score)&&signal.score>=ENTRY_MODES[mode];
}
export function initialState(){return {enabled:false,stopped:true,intents:[],limits:{orderCents:100,dailyCents:500,lossCents:200,maxPositions:1,profitPct:15,stopPct:8,trailPct:4,trailActivationPct:5},spent:{}};}
export function validateLimits(l){
 for(const key of ['orderCents','dailyCents','lossCents','maxPositions','profitPct','stopPct'])if(!Number.isSafeInteger(l?.[key])||l[key]<=0)throw Error('INVALID_LIMIT_'+key);
 for(const key of ['trailPct','trailActivationPct'])if(l[key]!==undefined&&(!Number.isSafeInteger(l[key])||l[key]<1||l[key]>100))throw Error('INVALID_LIMIT_'+key);
 if(l.orderCents>l.dailyCents||l.dailyCents>10000||l.lossCents>l.dailyCents||l.maxPositions>8||l.profitPct>100||l.stopPct>100)throw Error('LIMIT_OUT_OF_RANGE');return l;
}
export function makeOrder({ticker,side,action,qty,priceCents,id=randomUUID()}){
 if(!/^[A-Z0-9-]{4,100}$/.test(ticker)||!['up','down'].includes(side)||!['buy','sell'].includes(action)||!Number.isFinite(qty)||qty<.01||Math.abs(qty*100-Math.round(qty*100))>1e-7||!Number.isSafeInteger(priceCents)||priceCents<1||priceCents>99)throw Error('INVALID_ORDER');
 return {ticker,client_order_id:id,side:(side==='up')===(action==='buy')?'bid':'ask',count:qty.toFixed(2),price:((side==='up'?priceCents:100-priceCents)/100).toFixed(4),time_in_force:'immediate_or_cancel',self_trade_prevention_type:'taker_at_cross',post_only:false,cancel_order_on_pause:true,reduce_only:action==='sell',subaccount:0};
}
const fresh=(at,now)=>Number.isFinite(at)&&now-at>=0&&now-at<=10000;
export function reconcile(state,snapshot,now=Date.now()){
 if(!snapshot?.complete||!fresh(snapshot.at,now)||!Number.isSafeInteger(snapshot.balanceCents)||snapshot.balanceCents<0||!['orders','fills','positions'].every(k=>Array.isArray(snapshot[k])))throw Error('INCOMPLETE_ACCOUNT_SNAPSHOT');
 // Preserve verified terminal evidence before the exchange moves it to historical storage.
 const cached=state.evidence||{orders:[],fills:[],settlements:[]};
 for(const [field,id] of [['orders','order_id'],['fills','fill_id'],['settlements','ticker']]){
  const key=x=>field==='fills'?(x.fill_id||x.trade_id):x[id];
  const incoming=snapshot[field]||[],seen=new Set(incoming.map(key));
  // Previously verified economic facts must never be silently replaced.
  const facts=field==='fills'?['order_id','ticker','market_ticker','count_fp','count','yes_price_dollars','fee_cost','created_time','side','action','book_side','subaccount_number','exchange_index']:
   field==='orders'?['client_order_id','ticker','fill_count_fp','fill_count','status']:
   ['ticker','market_result','yes_count_fp','no_count_fp','revenue','fee_cost','settled_time'];
  const previous=new Map((cached[field]||[]).map(x=>[key(x),x]));
  for(const item of incoming){const old=previous.get(key(item));if(old&&facts.some(k=>old[k]!==item[k]))throw Error('CONFLICTING_CACHED_'+field.toUpperCase());}

  snapshot[field]=[...incoming,...(cached[field]||[]).filter(x=>!seen.has(key(x)))];
 }
 const orders=new Map(),fills=new Map(),positions=new Map();
 for(const order of snapshot.orders){if(!order.order_id||orders.has(order.order_id))throw Error('DUPLICATE_OR_INVALID_ORDER');orders.set(order.order_id,order);}
 for(const fill of snapshot.fills){const id=fill.fill_id||fill.trade_id;if(!id||!fill.order_id)throw Error('INVALID_FILL');if(fills.has(id)&&JSON.stringify(fills.get(id))!==JSON.stringify(fill))throw Error('CONFLICTING_FILL');fills.set(id,fill);}
 for(const p of snapshot.positions){const qty=Number(p.position_fp??p.position);if(!p.ticker||!Number.isFinite(qty)||positions.has(p.ticker))throw Error('INVALID_POSITION');positions.set(p.ticker,qty);}
 const quantities=new Map();
 for(const intent of state.intents){
  if(intent.status==='ABORTED')continue;
  const matches=[...orders.values()].filter(o=>o.client_order_id===intent.id);
  if(matches.length!==1){if(intent.status!=='PREPARED')throw Error('UNRESOLVED_ORDER_'+intent.id);continue;}
  const o=matches[0];if(o.ticker!==intent.ticker)throw Error('ORDER_TICKER_MISMATCH');
  const ownFills=[...fills.values()].filter(f=>f.order_id===o.order_id);
  const count=ownFills.reduce((n,f)=>{const q=Number(f.count_fp??f.count);if(!Number.isFinite(q)||q<=0)throw Error('INVALID_FILL_COUNT');return n+q;},0);
  const reported=Number(o.fill_count_fp??o.fill_count);
  if(!Number.isFinite(reported)||Math.abs(count-reported)>1e-7||count>intent.qty+1e-7)throw Error('FILL_COUNT_MISMATCH');
  if(!['executed','canceled'].includes(o.status))throw Error('ORDER_NOT_TERMINAL');
  intent.status='RECONCILED';intent.filled=count;intent.orderId=o.order_id;
  quantities.set(intent.ticker,(quantities.get(intent.ticker)||0)+count*(intent.side==='up'?1:-1)*(intent.action==='buy'?1:-1));
 }
 for(const [ticker,qty] of quantities){if(settlementFor(snapshot,ticker,qty))quantities.set(ticker,0);}
 // An isolated account is required: unknown positions/orders block new trading.
 for(const [ticker,qty] of positions)if(Math.abs(qty-(quantities.get(ticker)||0))>1e-7)throw Error('POSITION_MISMATCH_'+ticker);
 for(const [ticker,qty] of quantities)if(Math.abs(qty-(positions.get(ticker)||0))>1e-7)throw Error('POSITION_MISSING_'+ticker);
 if(snapshot.orders.some(o=>o.status==='resting'&&!state.intents.some(i=>i.id===o.client_order_id)))throw Error('UNMANAGED_RESTING_ORDER');
 const ids=new Set(state.intents.map(i=>i.id)),orderIds=new Set(state.intents.map(i=>i.orderId)),tickers=new Set(state.intents.map(i=>i.ticker));
 state.evidence=structuredClone({orders:[...orders.values()].filter(o=>ids.has(o.client_order_id)&&['executed','canceled'].includes(o.status)),fills:[...fills.values()].filter(f=>orderIds.has(f.order_id)),settlements:(snapshot.settlements||[]).filter(s=>tickers.has(s.ticker))});
 return {positions,orders,fills};
}
export function exitAction({entryCents,bidCents,peakCents=entryCents,profitPct,stopPct,trailPct=4,trailActivationPct=5}){
 if(![entryCents,bidCents,peakCents,profitPct,stopPct].every(Number.isFinite)||entryCents<=0||bidCents<=0)return null;
 const roi=(bidCents-entryCents)/entryCents*100;
 return roi<=-stopPct?'STOP_LOSS':roi>=profitPct?'TAKE_PROFIT':peakCents>=entryCents*(1+trailActivationPct/100)&&bidCents<=peakCents*(1-trailPct/100)?'TRAILING_EXIT':null;
}
// persist must use a compare-and-swap transaction. Never retry a timed-out POST.
export async function submitIntent({state,client,persist,checkStopped,snapshot,signal,quote,action='buy',position,trialCaps=false,now=Date.now(),clock=Date.now}){
 validateLimits(state.limits);
 if(!state.enabled||state.stopped||await checkStopped())throw Error('TRADING_STOPPED');
 reconcile(state,snapshot,now);
 if(state.intents.some(i=>!['RECONCILED','ABORTED'].includes(i.status)))throw Error('PENDING_INTENT');
 if(!fresh(quote?.at,now)||quote.ticker!==signal?.ticker||!fresh(signal?.at,now)||(!Number.isFinite(quote.expiresAt)||quote.expiresAt<=now))throw Error('STALE_OR_WRONG_MARKET');
 const side=action==='sell'?position?.side:signal.action==='BUY UP'?'up':signal.action==='BUY DOWN'?'down':null;
 const price=action==='buy'?quote[side+'Ask']:quote[side+'Bid'];
 const qty=action==='sell'?position?.qty:1;
 const order=makeOrder({ticker:quote.ticker,side,action,qty,priceCents:price});
 if(action==='buy'&&state.intents.some(i=>i.ticker===quote.ticker&&i.action==='buy'))throw Error('ROUND_ALREADY_ENTERED');
 const open=snapshot.positions.filter(p=>Number(p.position_fp??p.position)!==0);
 if(action==='sell'){
  const actual=Number(open.find(p=>p.ticker===quote.ticker)?.position_fp??open.find(p=>p.ticker===quote.ticker)?.position);
  if(!Number.isFinite(actual)||Math.sign(actual)!==(side==='up'?1:-1)||qty>Math.abs(actual))throw Error('SELL_EXCEEDS_POSITION');
 }else if(open.length>=Math.min(state.limits.maxPositions,trialCaps?1:Infinity))throw Error('POSITION_LIMIT');
 const day=new Date(now).toISOString().slice(0,10),reserve=action==='buy'?Math.ceil(qty*price+qty*10):0;
 const risk=accountRisk(state,snapshot,now);
 if(action==='buy'&&risk.dailyLossCents+risk.openCostCents+reserve>Math.min(state.limits.lossCents,trialCaps?300:Infinity))throw Error('DAILY_LOSS_LIMIT');
 if(action==='buy'&&trialCaps&&risk.openCostCents+reserve>500)throw Error('EXPOSURE_LIMIT');
 if(action==='buy'&&quote.expiresAt-now<75000)throw Error('LATE_ENTRY');
 const ask=quote[side+'Ask'],bid=quote[side+'Bid'];
 if(action==='buy'&&(!Number.isFinite(ask)||!Number.isFinite(bid)||bid<0||ask>100||ask<bid||ask-bid>5))throw Error('INVALID_SPREAD');
 if(action==='buy'&&(reserve>Math.min(state.limits.orderCents,trialCaps?100:Infinity)||reserve+(state.spent[day]||0)>state.limits.dailyCents||reserve>snapshot.balanceCents))throw Error('SPENDING_LIMIT');
 // Conservative budget includes a 10-cent per-contract fee reserve and is never released on retries.
 const intent={id:order.client_order_id,ticker:quote.ticker,side,action,qty,priceCents:price,reserve,day,status:'PREPARED',at:now};
 state.intents.push(intent);state.spent[day]=(state.spent[day]||0)+reserve;await persist(state);
 if(await checkStopped()){intent.status='ABORTED';await persist(state);throw Error('STOPPED_BEFORE_SUBMISSION');}
 intent.status='SUBMITTING';await persist(state);
 const stopped=await checkStopped(),submitAt=clock();
 if(stopped||!fresh(quote.at,submitAt)||!fresh(signal.at,submitAt)||!fresh(snapshot.at,submitAt)||quote.expiresAt<=submitAt||
   (action==='buy'&&(quote.expiresAt-submitAt<75000||new Date(submitAt).toISOString().slice(0,10)!==day))){
  intent.status='ABORTED';await persist(state);
  throw Error(stopped?'STOPPED_BEFORE_SUBMISSION':'STALE_BEFORE_SUBMISSION');
 }
 try{const result=await client.create(order);intent.orderId=result.order?.order_id||result.order_id;intent.status='AWAITING_RECONCILIATION';await persist(state);return intent;}
 catch{intent.status='UNKNOWN';state.enabled=false;state.stopped=true;await persist(state);throw Error('ORDER_OUTCOME_UNKNOWN_RECONCILE_REQUIRED');}
}
export async function emergencyStop({state,client,persist}){
 state.enabled=false;state.stopped=true;await persist(state);
 const failures=[];let snapshot;
 try{snapshot=await client.snapshot();}catch{throw Error('STOPPED_CANCELLATION_SNAPSHOT_FAILED');}
 if(snapshot?.complete!==true||!Array.isArray(snapshot.orders))throw Error('STOPPED_CANCELLATION_SNAPSHOT_FAILED');
 const own=new Set(state.intents.map(i=>i.id));
 for(const o of snapshot.orders.filter(o=>o.status==='resting'&&own.has(o.client_order_id))){try{await client.cancel(o);}catch{failures.push(o.order_id);}}
 let after;try{after=await client.snapshot();}catch{throw Error('STOPPED_CANCELLATION_UNVERIFIED');}
 if(after?.complete!==true||!Array.isArray(after.orders))throw Error('STOPPED_CANCELLATION_UNVERIFIED');
 const remaining=after.orders.filter(o=>o.status==='resting'&&own.has(o.client_order_id)).map(o=>o.order_id);
 if(failures.length||remaining.length)throw Error('STOPPED_CANCEL_FAILED:'+Array.from(new Set([...failures,...remaining])).join(','));
 if(state.intents.some(i=>['SUBMITTING','UNKNOWN','AWAITING_RECONCILIATION'].includes(i.status))){
  try{reconcile(state,after);}catch{throw Error('STOPPED_ORDER_OUTCOME_UNRESOLVED');}
  await persist(state);
 }
 return {stopped:true,cancelled:true,positionsClosed:false};
}
