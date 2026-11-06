import {makeOrder} from '../../../src/live-execution.mjs';
import {verifiedFinalizedBinaryOutcome} from '../../../src/official-settlement.mjs';

export async function runDemoHold(store,client,now=Date.now()){
 const key='hold-test/v1';
 let test=await store.get(key,{type:'json'});
 if(test?.finished)return;
 if(!test){
  const prior=await store.get('order-test/v8',{type:'json'});
  if(prior?.status!=='DEMO_PLACEMENT_AND_CANCEL_VERIFIED')return;
  const {market}=await client.request('GET','/trade-api/v2/markets/'+encodeURIComponent(prior.ticker));
  const price=Math.round(Number(market?.yes_ask_dollars)*100);
  if(market?.ticker!==prior.ticker||market.status!=='active'||!Number.isInteger(price)||price<1||price>99||
   !(Date.parse(market.close_time)>now+30000)){
   await store.setJSON(key,{status:'DEMO_HOLD_MARKET_UNAVAILABLE',finished:true},{onlyIfNew:true});return;
  }
  const order=makeOrder({ticker:market.ticker,side:'up',action:'buy',qty:1,priceCents:price});
  test={status:'DEMO_HOLD_SUBMITTING',ticker:order.ticker,id:order.client_order_id,startedAt:new Date(now).toISOString()};
  if(!(await store.setJSON(key,test,{onlyIfNew:true})).modified)return;
  try{
   const submitted=await client.create(order);
   test={...test,orderId:submitted.order_id,status:'DEMO_HOLD_SUBMITTED'};
   await store.setJSON(key,test);
  }catch(error){
   await store.setJSON(key,{...test,status:'DEMO_HOLD_SUBMISSION_UNCONFIRMED',exchangeCode:error.exchangeCode??null});
   return;
  }
 }
 const orders=test.orderId?
  [(await client.request('GET','/trade-api/v2/portfolio/orders/'+encodeURIComponent(test.orderId))).order]:
  await client.pages('/trade-api/v2/portfolio/orders','orders',{ticker:test.ticker});
 const order=orders.find(o=>o?.client_order_id===test.id&&o.ticker===test.ticker);
 if(!order||!['executed','canceled'].includes(order.status))return;
 const quantity=Number(order.fill_count_fp??order.fill_count);
 if(!Number.isFinite(quantity)||quantity<0||quantity>1)return;
 if(quantity===0){await store.setJSON(key,{...test,status:'DEMO_HOLD_UNFILLED',filled:0,finished:true});return;}
 const fills=await client.pages('/trade-api/v2/portfolio/fills','fills',{ticker:test.ticker,order_id:order.order_id});
 const own=fills.filter(f=>f.order_id===order.order_id);
 const qty=f=>Number(f.count_fp??f.count);
 const total=own.reduce((sum,f)=>sum+qty(f),0);
 const cost=own.reduce((sum,f)=>sum+qty(f)*Number(f.yes_price_dollars)+Number(f.fee_cost??f.fee_cost_dollars),0);
 if(Math.abs(total-quantity)>1e-7||!Number.isFinite(cost)||cost<0)return;
 const {market}=await client.request('GET','/trade-api/v2/markets/'+encodeURIComponent(test.ticker));
 const outcome=verifiedFinalizedBinaryOutcome(market,test.ticker);
 const positions=await client.pages('/trade-api/v2/portfolio/positions','market_positions',{ticker:test.ticker});
 const position=Number(positions.find(p=>p.ticker===test.ticker)?.position_fp??0);
 const bid=Number(market?.yes_bid_dollars);
 const matched=Number.isFinite(position)&&Math.abs(position-(outcome?0:quantity))<1e-7;
 const mark=market?.status==='active'&&Number.isFinite(bid)&&bid>0&&bid<1?quantity*bid-cost:null;
 await store.setJSON(key,{...test,status:outcome?'DEMO_HOLD_SETTLED':matched?'DEMO_HOLD_OPEN':'DEMO_HOLD_POSITION_UNRECONCILED',
  filled:quantity,positionReconciled:matched,entryCost:cost,markPnl:mark,
  realizedPnl:outcome?(outcome==='yes'?quantity:0)-cost:null,finished:Boolean(outcome&&matched),
  checkedAt:new Date(now).toISOString()});
}
