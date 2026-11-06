import {makeOrder,qualifiesLiveEntry} from '../../../src/live-execution.mjs';
import {verifiedFinalizedBinaryOutcome} from '../../../src/official-settlement.mjs';

const eligible=(m,now)=>m?.status==='active'&&m.market_type==='binary'&&
 /^[A-Z0-9-]{4,100}$/.test(m.ticker)&&Number(m.yes_ask_dollars)>=.01&&Number(m.yes_ask_dollars)<=.99&&Date.parse(m.close_time)>now+30000;

async function placeDemoHold(store,client,key,market,now,condition,signal=null){
 const side=signal?.action==='BUY DOWN'?'down':'up';
 const ask=Number(market[side==='up'?'yes_ask_dollars':'no_ask_dollars']);
 const order=makeOrder({ticker:market.ticker,side,action:'buy',qty:1,priceCents:Math.min(99,Math.ceil(ask*100-1e-8)+(signal?.demoExtreme?2:0))});
 const test={status:'DEMO_HOLD_SUBMITTING',ticker:order.ticker,side,attempt:signal?.attempt??1,previousUnfilled:signal?.previousUnfilled??null,signalScore:signal?.score??null,quotedAsk:ask,id:order.client_order_id,startedAt:new Date(now).toISOString()};
 if(!(await store.setJSON(key,test,condition)).modified)return;
 try{
  const submitted=await client.create(Number.isInteger(signal?.exchangeIndex)?{...order,exchange_index:signal.exchangeIndex}:order);
  await store.setJSON(key,{...test,orderId:submitted.order_id,status:'DEMO_HOLD_SUBMITTED'});
 }catch(error){
  await store.setJSON(key,{...test,status:'DEMO_HOLD_SUBMISSION_UNCONFIRMED',exchangeCode:error.exchangeCode??null});
 }
}

export async function runDemoHold(store,client,now=Date.now(),loadSignals=null){
 const key=loadSignals?'strategy-hold/v1':'hold-test/v1';
 let test=await store.get(key,{type:'json'});
 if(test?.finished&&test.status!=='DEMO_HOLD_MARKET_UNAVAILABLE')return;
 if(test?.status==='DEMO_HOLD_MARKET_UNAVAILABLE'){
  const reset=await store.getWithMetadata(key,{type:'json'});
  if(reset?.data?.status!=='DEMO_HOLD_MARKET_UNAVAILABLE')return;
  const {markets}=await client.request('GET','/trade-api/v2/markets?status=open&limit=100&mve_filter=exclude');
  const market=markets?.find(m=>eligible(m,now));
  if(!market)return;
  await placeDemoHold(store,client,key,market,now,{onlyIfMatch:reset.etag});
  return;
 }
 if(loadSignals&&!test){
  const prior=await store.get('hold-test/v1',{type:'json'});
  if(!prior?.finished)return;
  const signals=await loadSignals();
  now=Date.now();
  for(const signal of signals.filter(s=>qualifiesLiveEntry(s)&&Number.isFinite(s.at)&&now-s.at>=0&&now-s.at<=10000).slice(0,3)){
   if(!/^[A-Z0-9-]{4,100}$/.test(signal.ticker))continue;
   const {market}=await client.request('GET','/trade-api/v2/markets/'+encodeURIComponent(signal.ticker));
   if(market?.ticker!==signal.ticker||!eligible(market,now))continue;
   const ask=Number(market[signal.action==='BUY UP'?'yes_ask_dollars':'no_ask_dollars']);
   if(!(ask>=.01&&ask<=.99&&ask*100<=signal.ask+1e-7&&signal.modelSideProbability>=ask+.10))continue;
   await placeDemoHold(store,client,key,market,now,{onlyIfNew:true},signal);
   return;
  }
  return;
 }
 if(!test){
  const prior=await store.get('order-test/v8',{type:'json'});
  if(prior?.status!=='DEMO_PLACEMENT_AND_CANCEL_VERIFIED')return;
  const {market}=await client.request('GET','/trade-api/v2/markets/'+encodeURIComponent(prior.ticker));
  const price=Math.round(Number(market?.yes_ask_dollars)*100);
  if(market?.ticker!==prior.ticker||market.status!=='active'||!Number.isInteger(price)||price<1||price>99||
   !(Date.parse(market.close_time)>now+30000)){
   await store.setJSON(key,{status:'DEMO_HOLD_MARKET_UNAVAILABLE',finished:true},{onlyIfNew:true});return;
  }
  await placeDemoHold(store,client,key,market,now,{onlyIfNew:true});
  return;
 }
 await reconcileDemoHold(store,client,key,test,now);
}

async function reconcileDemoHold(store,client,key,test,now){
 const orders=test.orderId?
  [(await client.request('GET','/trade-api/v2/portfolio/orders/'+encodeURIComponent(test.orderId))).order]:
  await client.pages('/trade-api/v2/portfolio/orders','orders',{ticker:test.ticker});
 const order=orders.find(o=>o?.client_order_id===test.id&&o.ticker===test.ticker);
 if(!order||!['executed','canceled'].includes(order.status))return;
 const quantity=Number(order.fill_count_fp??order.fill_count);
 if(!Number.isFinite(quantity)||quantity<0||quantity>1)return;
 if(quantity===0){await store.setJSON(key,{...test,status:'DEMO_HOLD_UNFILLED',filled:0,finished:true});return;}
 if(test.filled!==quantity){
  test={...test,status:'DEMO_HOLD_FILL_AWAITING_LEDGER',filled:quantity,checkedAt:new Date(now).toISOString()};
  await store.setJSON(key,test);
 }
 const fills=await client.pages('/trade-api/v2/portfolio/fills','fills',{ticker:test.ticker,order_id:order.order_id});
 const own=fills.filter(f=>f.order_id===order.order_id);
 const qty=f=>Number(f.count_fp??f.count);
 const total=own.reduce((sum,f)=>sum+qty(f),0);
 const down=test.side==='down';
 const cost=own.reduce((sum,f)=>sum+qty(f)*Number(down?f.no_price_dollars:f.yes_price_dollars)+Number(f.fee_cost??f.fee_cost_dollars),0);
 if(Math.abs(total-quantity)>1e-7||!Number.isFinite(cost)||cost<0)return;
 const {market}=await client.request('GET','/trade-api/v2/markets/'+encodeURIComponent(test.ticker));
 const outcome=verifiedFinalizedBinaryOutcome(market,test.ticker);
 if(test.entryCost!==cost){
  test={...test,status:'DEMO_HOLD_AWAITING_POSITION',entryCost:cost};
  await store.setJSON(key,test);
 }
 const positions=await client.pages('/trade-api/v2/portfolio/positions','market_positions',{ticker:test.ticker});
 const position=Number(positions.find(p=>p.ticker===test.ticker)?.position_fp??0);
 const bid=Number(down?market?.no_bid_dollars:market?.yes_bid_dollars);
 const matched=Number.isFinite(position)&&Math.abs(position-(outcome?0:down?-quantity:quantity))<1e-7;
 const mark=market?.status==='active'&&Number.isFinite(bid)&&bid>0&&bid<1?quantity*bid-cost:null;
 await store.setJSON(key,{...test,status:outcome?'DEMO_HOLD_SETTLED':matched?'DEMO_HOLD_OPEN':'DEMO_HOLD_POSITION_UNRECONCILED',
  filled:quantity,positionReconciled:matched,entryCost:cost,markPnl:mark,
  realizedPnl:outcome?(outcome===(down?'no':'yes')?quantity:0)-cost:null,finished:Boolean(outcome&&matched),
  checkedAt:new Date(now).toISOString()});
}


const demoQuote=(market,up)=>{
 const side=up?'yes':'no',ask=Number(market[side+'_ask_dollars']),bid=Number(market[side+'_bid_dollars']);
 return {market,up,ask,bid,spread:ask-bid};
};
const tradableDemoQuote=({ask,bid,spread})=>ask>=.05&&ask<=.95&&bid>0&&spread>=0&&spread<=.10+1e-9;
const demoRound=market=>Math.floor((Date.parse(market.expected_expiration_time||market.close_time)-1)/900000);
const eligibleExtreme=(market,now,round)=>market?.status==='active'&&market.market_type==='binary'&&
 /^[A-Z0-9-]{4,100}$/.test(market.ticker)&&demoRound(market)===round&&Date.parse(market.close_time)-now>=90000;

const extremePrefix='extreme-demo/v1/';
export async function runExtremeDemo(store,client,now=Date.now()){
 const round=Math.floor(now/900000),startKey=extremePrefix+'start';
 let start=await store.get(startKey,{type:'json'});
 if(!start){
  await store.setJSON(startKey,{round},{onlyIfNew:true});
  start=await store.get(startKey,{type:'json'});
 }
 if(!Number.isSafeInteger(start?.round))return;
 const key=extremePrefix+round;
 const records=await Promise.all(Array.from({length:Math.max(0,Math.min(36,round-start.round+1))},(_,i)=>store.get(extremePrefix+(start.round+i),{type:'json'})));
 for(const [i,record] of records.entries()){
  if(record?.id&&!record.finished)await reconcileDemoHold(store,client,extremePrefix+(start.round+i),record,now);
 }
 if(round<start.round||round>=start.round+36)return;
 const existing=await store.getWithMetadata(key,{type:'json'});
 const previous=existing?.data;
 const retry=previous?.status==='DEMO_HOLD_UNFILLED'&&previous.filled===0&&(previous.attempt??1)===1;
 if(previous&&!retry)return;
 const quotes=await Promise.all(['KXBTC15M','KXETH15M','KXSOL15M'].map(async series=>{
  try{
   const {markets}=await client.request('GET','/trade-api/v2/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'20'}));
   return Array.isArray(markets)?markets:[];
  }catch{return [];}
 }));
 const candidates=quotes.flat().filter(m=>eligibleExtreme(m,now,round))
  .flatMap(market=>[demoQuote(market,true),demoQuote(market,false)]).filter(tradableDemoQuote)
  .sort((a,b)=>a.spread-b.spread||a.ask-b.ask);
 if(!candidates.length){
  await store.setJSON(extremePrefix+'last-scan',{round,status:'NO_ELIGIBLE_QUOTE',checkedAt:new Date(now).toISOString()});
  return;
 }
 for(const candidate of candidates.slice(0,3)){
  const {market}=await client.request('GET','/trade-api/v2/markets/'+encodeURIComponent(candidate.market.ticker));
  const exchangeIndex=market?.exchange_index;
  if(market?.ticker!==candidate.market.ticker||!eligibleExtreme(market,Date.now(),round)||!Number.isInteger(exchangeIndex)||exchangeIndex<0)continue;
  const quote=demoQuote(market,candidate.up);
  if(!tradableDemoQuote(quote))continue;
  const {ask}=quote;
  const balance=await client.request('GET','/trade-api/v2/portfolio/balance?'+new URLSearchParams({exchange_index:String(exchangeIndex),subaccount:'0'}));
  if(!Number.isSafeInteger(balance.balance)||balance.balance<Math.ceil(ask*100)+12)continue;
  if(Date.parse(market.close_time)-Date.now()<90000)return;
  await placeDemoHold(store,client,key,market,now,retry?{onlyIfMatch:existing.etag}:{onlyIfNew:true},{
   action:candidate.up?'BUY UP':'BUY DOWN',exchangeIndex,demoExtreme:true,attempt:retry?2:1,
   previousUnfilled:retry?{id:previous.id,orderId:previous.orderId,ticker:previous.ticker}:null
  });
  return;
 }
 await store.setJSON(extremePrefix+'last-scan',{round,status:'NO_FUNDED_ELIGIBLE_EXCHANGE',checkedAt:new Date(now).toISOString()});
}
