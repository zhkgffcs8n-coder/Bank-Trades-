// Isolated execution state machine. No imports from or writes to paper/flip history.
import {randomUUID} from 'node:crypto';
export const REQUIRED_CHECKS=['authentication','orderLifecycle','partialFills','positionReconciliation','concurrentSpending','emergencyCancellation','workerHeartbeat','ownerIsolation'];
export function releaseFailures(evidence,commit,now=Date.now()){
 return REQUIRED_CHECKS.filter(k=>!commit||evidence?.commit!==commit||evidence?.checks?.[k]!==true||!Number.isFinite(evidence?.at)||now-evidence.at<0||now-evidence.at>3600000);
}
export function initialState(){return {enabled:false,stopped:true,intents:[],limits:{orderCents:100,dailyCents:500,lossCents:200,maxPositions:1,profitPct:15,stopPct:8},spent:{}};}
export function validateLimits(l){
 for(const key of ['orderCents','dailyCents','lossCents','maxPositions','profitPct','stopPct'])if(!Number.isSafeInteger(l?.[key])||l[key]<=0)throw Error('INVALID_LIMIT_'+key);
 if(l.orderCents>l.dailyCents||l.dailyCents>10000||l.lossCents>l.dailyCents||l.maxPositions>8||l.profitPct>100||l.stopPct>100)throw Error('LIMIT_OUT_OF_RANGE');return l;
}
export function makeOrder({ticker,side,action,qty,priceCents,id=randomUUID()}){
 if(!/^[A-Z0-9-]{4,100}$/.test(ticker)||!['up','down'].includes(side)||!['buy','sell'].includes(action)||!Number.isSafeInteger(qty)||qty<1||!Number.isSafeInteger(priceCents)||priceCents<1||priceCents>99)throw Error('INVALID_ORDER');
 return {ticker,client_order_id:id,side:(side==='up')===(action==='buy')?'bid':'ask',count:qty.toFixed(2),price:((side==='up'?priceCents:100-priceCents)/100).toFixed(4),time_in_force:'immediate_or_cancel',self_trade_prevention_type:'taker_at_cross',post_only:false,cancel_order_on_pause:true,reduce_only:action==='sell',subaccount:0};
}
const fresh=(at,now)=>Number.isFinite(at)&&now-at>=0&&now-at<=10000;
export function reconcile(state,snapshot,now=Date.now()){
 if(!snapshot?.complete||!fresh(snapshot.at,now)||!Number.isSafeInteger(snapshot.balanceCents)||snapshot.balanceCents<0||!['orders','fills','positions'].every(k=>Array.isArray(snapshot[k])))throw Error('INCOMPLETE_ACCOUNT_SNAPSHOT');
 const orders=new Map(),fills=new Map(),positions=new Map();
 for(const order of snapshot.orders){if(!order.order_id||orders.has(order.order_id))throw Error('DUPLICATE_OR_INVALID_ORDER');orders.set(order.order_id,order);}
 for(const fill of snapshot.fills){const id=fill.fill_id||fill.trade_id;if(!id||!fill.order_id)throw Error('INVALID_FILL');if(fills.has(id)&&JSON.stringify(fills.get(id))!==JSON.stringify(fill))throw Error('CONFLICTING_FILL');fills.set(id,fill);}
 for(const p of snapshot.positions){const qty=Number(p.position_fp??p.position);if(!p.ticker||!Number.isFinite(qty)||positions.has(p.ticker))throw Error('INVALID_POSITION');positions.set(p.ticker,qty);}
 const quantities=new Map();
 for(const intent of state.intents){
  const matches=[...orders.values()].filter(o=>o.client_order_id===intent.id);
  if(matches.length!==1){if(intent.status!=='PREPARED')throw Error('UNRESOLVED_ORDER_'+intent.id);continue;}
  const o=matches[0];if(o.ticker!==intent.ticker)throw Error('ORDER_TICKER_MISMATCH');
  const ownFills=[...fills.values()].filter(f=>f.order_id===o.order_id);
  const count=ownFills.reduce((n,f)=>{const q=Number(f.count_fp??f.count);if(!Number.isFinite(q)||q<=0)throw Error('INVALID_FILL_COUNT');return n+q;},0);
  const reported=Number(o.fill_count_fp??o.fill_count);
  if(!Number.isFinite(reported)||count!==reported||count>intent.qty)throw Error('FILL_COUNT_MISMATCH');
  if(!['executed','canceled'].includes(o.status))throw Error('ORDER_NOT_TERMINAL');
  intent.status='RECONCILED';intent.filled=count;intent.orderId=o.order_id;
  quantities.set(intent.ticker,(quantities.get(intent.ticker)||0)+count*(intent.side==='up'?1:-1)*(intent.action==='buy'?1:-1));
 }
 // An isolated account is required: unknown positions/orders block new trading.
 for(const [ticker,qty] of positions)if(qty!==(quantities.get(ticker)||0))throw Error('POSITION_MISMATCH_'+ticker);
 for(const [ticker,qty] of quantities)if(qty!==(positions.get(ticker)||0))throw Error('POSITION_MISSING_'+ticker);
 if(snapshot.orders.some(o=>o.status==='resting'&&!state.intents.some(i=>i.id===o.client_order_id)))throw Error('UNMANAGED_RESTING_ORDER');
 return {positions,orders,fills};
}
export function exitAction({entryCents,bidCents,peakCents=entryCents,profitPct,stopPct}){
 if(![entryCents,bidCents,peakCents,profitPct,stopPct].every(Number.isFinite)||entryCents<=0||bidCents<=0)return null;
 const roi=(bidCents-entryCents)/entryCents*100;
 return roi<=-stopPct?'STOP_LOSS':roi>=profitPct?'TAKE_PROFIT':peakCents>=entryCents*1.05&&bidCents<=peakCents*.96?'TRAILING_EXIT':null;
}
// persist must use a compare-and-swap transaction. Never retry a timed-out POST.
export async function submitIntent({state,client,persist,checkStopped,snapshot,signal,quote,action='buy',position,now=Date.now()}){
 validateLimits(state.limits);
 if(!state.enabled||state.stopped||await checkStopped())throw Error('TRADING_STOPPED');
 reconcile(state,snapshot,now);
 if(state.intents.some(i=>i.status!=='RECONCILED'))throw Error('PENDING_INTENT');
 if(!fresh(quote?.at,now)||quote.ticker!==signal?.ticker||!fresh(signal?.at,now)||quote.expiresAt<=now)throw Error('STALE_OR_WRONG_MARKET');
 const side=action==='sell'?position?.side:signal.action==='BUY UP'?'up':signal.action==='BUY DOWN'?'down':null;
 const price=action==='buy'?quote[side+'Ask']:quote[side+'Bid'];
 const qty=action==='sell'?position?.qty:1;
 const order=makeOrder({ticker:quote.ticker,side,action,qty,priceCents:price});
 if(action==='buy'&&state.intents.some(i=>i.ticker===quote.ticker&&i.action==='buy'))throw Error('ROUND_ALREADY_ENTERED');
 const open=snapshot.positions.filter(p=>Number(p.position_fp??p.position)!==0);
 if(action==='sell'){
  const actual=Number(open.find(p=>p.ticker===quote.ticker)?.position_fp??open.find(p=>p.ticker===quote.ticker)?.position);
  if(!Number.isFinite(actual)||Math.sign(actual)!==(side==='up'?1:-1)||qty>Math.abs(actual))throw Error('SELL_EXCEEDS_POSITION');
 }else if(open.length>=state.limits.maxPositions)throw Error('POSITION_LIMIT');
 const day=new Date(now).toISOString().slice(0,10),reserve=action==='buy'?qty*price+qty*10:0;
 if(action==='buy'&&(reserve>state.limits.orderCents||reserve+(state.spent[day]||0)>state.limits.dailyCents||reserve>snapshot.balanceCents))throw Error('SPENDING_LIMIT');
 // Conservative budget includes a 10-cent per-contract fee reserve and is never released on retries.
 const intent={id:order.client_order_id,ticker:quote.ticker,side,action,qty,priceCents:price,reserve,day,status:'PREPARED',at:now};
 state.intents.push(intent);state.spent[day]=(state.spent[day]||0)+reserve;await persist(state);
 if(await checkStopped())throw Error('STOPPED_BEFORE_SUBMISSION');
 intent.status='SUBMITTING';await persist(state);
 try{const result=await client.create(order);intent.orderId=result.order?.order_id||result.order_id;intent.status='AWAITING_RECONCILIATION';await persist(state);return intent;}
 catch{intent.status='UNKNOWN';state.enabled=false;state.stopped=true;await persist(state);throw Error('ORDER_OUTCOME_UNKNOWN_RECONCILE_REQUIRED');}
}
export async function emergencyStop({state,client,persist}){
 state.enabled=false;state.stopped=true;await persist(state);
 const failures=[];let snapshot;
 try{snapshot=await client.snapshot();}catch{throw Error('STOPPED_CANCELLATION_SNAPSHOT_FAILED');}
 const own=new Set(state.intents.map(i=>i.id));
 for(const o of snapshot.orders.filter(o=>o.status==='resting'&&own.has(o.client_order_id))){try{await client.cancel(o);}catch{failures.push(o.order_id);}}
 let remaining;try{remaining=(await client.snapshot()).orders.filter(o=>o.status==='resting'&&own.has(o.client_order_id)).map(o=>o.order_id);}catch{throw Error('STOPPED_CANCELLATION_UNVERIFIED');}
 if(failures.length||remaining.length)throw Error('STOPPED_CANCEL_FAILED:'+Array.from(new Set([...failures,...remaining])).join(','));
 return {stopped:true,cancelled:true,positionsClosed:false};
}
