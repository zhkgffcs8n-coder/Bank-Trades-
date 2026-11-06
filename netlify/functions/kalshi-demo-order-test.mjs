import {getStore} from '@netlify/blobs';
import {openKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {kalshiClient} from './lib/kalshi-execution-client.mjs';
import {makeOrder} from '../../src/live-execution.mjs';

export async function runDemoOrderTest(store,client,now=Date.now()){
 const prior=await store.get('order-test/v6',{type:'json'});
 if(prior?.status!=='DEMO_ORDER_TERMINAL_WITHOUT_VERIFIED_CANCEL')return;
 const key='order-test/v7';
 let test=await store.get(key,{type:'json'});
 if(test?.finished)return;
 if(!test){
  const {markets}=await client.request('GET','/trade-api/v2/markets?status=open&limit=100&mve_filter=exclude');
  const market=markets?.find(m=>m.status==='active'&&m.market_type==='binary'&&
   /^[A-Z0-9-]{4,100}$/.test(m.ticker)&&Number(m.yes_ask_dollars)>.01&&
   Date.parse(m.close_time)>now+180000);
  if(!market)return;
  const order=makeOrder({ticker:market.ticker,side:'up',action:'buy',qty:1,priceCents:1});
  test={status:'DEMO_SUBMITTING',ticker:order.ticker,id:order.client_order_id,checkedAt:new Date(now).toISOString()};
  if(!(await store.setJSON(key,test,{onlyIfNew:true})).modified)return;
  try{
   const result=await client.create({...order,post_only:true,time_in_force:'good_till_canceled',expiration_time:Math.floor(now/1000)+90});
   test={...test,orderId:result.order_id,status:'DEMO_SUBMITTED'};
   await store.setJSON(key,test);
  }catch(error){
   // Preserve the client ID and look up the exchange result. Never retry POST.
   await store.setJSON(key,{...test,status:/^KALSHI_HTTP_\d{3}$/.test(error.message)?'DEMO_SUBMIT_'+error.message:'DEMO_SUBMIT_OUTCOME_UNKNOWN',exchangeCode:error.exchangeCode??null});
   return;
  }
  if(test.orderId){
   try{
    await client.cancel({order_id:test.orderId,ticker:test.ticker});
    test={...test,cancelAcknowledged:true,status:'DEMO_CANCEL_ACKNOWLEDGED'};
    await store.setJSON(key,test);
   }catch(error){
    await store.setJSON(key,{...test,status:/^KALSHI_HTTP_\d{3}$/.test(error.message)?'DEMO_CANCEL_'+error.message:'DEMO_CANCEL_OUTCOME_UNKNOWN'});
    return;
   }
  }
 }
 const orders=test.orderId?
  [(await client.request('GET','/trade-api/v2/portfolio/orders/'+encodeURIComponent(test.orderId))).order]:
  await client.pages('/trade-api/v2/portfolio/orders','orders',{ticker:test.ticker});
 const order=orders.find(o=>o?.client_order_id===test.id&&o.ticker===test.ticker);
 if(!order)return;
 if(order.status==='resting'){
  await client.cancel(order);
  const confirmed=await client.request('GET','/trade-api/v2/portfolio/orders/'+encodeURIComponent(order.order_id));
  if(confirmed.order?.status!=='canceled')return;
  await store.setJSON(key,{...test,finished:true,status:'DEMO_PLACEMENT_AND_CANCEL_VERIFIED',filled:confirmed.order.fill_count_fp??null});
 }else if(['canceled','executed'].includes(order.status)){
  await store.setJSON(key,{...test,finished:true,status:test.cancelAcknowledged&&order.status==='canceled'?'DEMO_PLACEMENT_AND_CANCEL_VERIFIED':'DEMO_ORDER_TERMINAL_WITHOUT_VERIFIED_CANCEL',filled:order.fill_count_fp??null});
 }
}

export default async()=>{
 const store=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 const saved=await store.get('uploaded-connection',{type:'json'});
 if(saved?.status!=='DEMO_AUTHENTICATED'||!process.env.KALSHI_LIVE_OWNER_ID)return new Response(null,{status:204});
 const credentials=openKalshiCredentials({userId:'demo-'+process.env.KALSHI_LIVE_OWNER_ID,envelope:saved.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
 await runDemoOrderTest(store,kalshiClient(credentials,{environment:'demo',allowWrites:true}));
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};
