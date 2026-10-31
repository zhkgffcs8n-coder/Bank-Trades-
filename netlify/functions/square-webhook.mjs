import {createHmac,timingSafeEqual} from 'node:crypto';
import {getStore} from '@netlify/blobs';

const URL='https://neon-gecko-046bff.netlify.app/.netlify/functions/square-webhook';
const BASE='https://connect.squareup.com';
const VERSION='2026-09-16';
const db=()=>getStore({name:'bank-trades-memberships',consistency:'strong'});
const response=(status,text='')=>new Response(text,{status,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
function valid(signature,raw){
 const key=process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;if(!key||!signature)return false;
 const expected=createHmac('sha256',key).update(URL+raw).digest('base64');
 const a=Buffer.from(expected),b=Buffer.from(signature);return a.length===b.length&&timingSafeEqual(a,b);
}
async function square(path){
 const r=await fetch(BASE+path,{headers:{Authorization:'Bearer '+process.env.SQUARE_ACCESS_TOKEN,'Square-Version':VERSION,'Content-Type':'application/json'}});
 if(!r.ok)throw Error('Square lookup failed');return r.json();
}
async function mapCustomer(store,customerId,userId,email){
 if(!customerId||!userId)return;
 await store.setJSON('square/customer/'+userId,{id:customerId,email});
 await store.setJSON('square/identity/'+customerId,{userId,email});
}
export default async(req)=>{
 if(req.method!=='POST')return response(405,'Method not allowed');
 const raw=await req.text();
 if(!valid(req.headers.get('x-square-hmacsha256-signature'),raw))return response(403,'Invalid signature');
 let event;try{event=JSON.parse(raw);}catch{return response(400,'Invalid JSON');}
 const store=db();
 try{
  const type=event.type||'',obj=event.data?.object||{};
  if(type.startsWith('payment.')){
   const p=obj.payment||obj;
   if(p.status==='COMPLETED'&&p.order_id&&p.customer_id){
    const pending=await store.get('square/pending-order/'+p.order_id,{type:'json'});
    if(pending){await mapCustomer(store,p.customer_id,pending.userId,pending.email);await store.setJSON('square/payment/'+p.id,{customerId:p.customer_id,userId:pending.userId,orderId:p.order_id});}
   }
  }else if(type.startsWith('refund.')){
   const refund=obj.refund||obj;if(refund.payment_id){
    let payment=await store.get('square/payment/'+refund.payment_id,{type:'json'});
    if(!payment){const remote=await square('/v2/payments/'+encodeURIComponent(refund.payment_id));if(remote.payment?.customer_id)payment={customerId:remote.payment.customer_id};}
    if(payment?.customerId)await store.setJSON('square/risk/'+payment.customerId,{reason:'refund',eventId:event.event_id||event.id,at:Date.now()});
   }
  }else if(type.startsWith('subscription.')){
   const s=obj.subscription||obj;
   if(s.customer_id){
    const identity=await store.get('square/identity/'+s.customer_id,{type:'json'});
    if(identity?.userId&&['ACTIVE','PENDING'].includes(s.status))await store.delete('square/risk/'+s.customer_id).catch(()=>{});
   }
  }
  if(event.event_id||event.id)await store.setJSON('square/event/'+(event.event_id||event.id),{type,processedAt:Date.now()});
  return response(200,'ok');
 }catch{return response(500,'retry');}
};
