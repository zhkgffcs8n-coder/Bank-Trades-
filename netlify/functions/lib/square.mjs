import {createHash,randomUUID} from 'node:crypto';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const BASE='https://connect.squareup.com';
const VERSION='2026-09-16';
export const squarePlans={
 gold:{label:'🥇 GOLD',amount:7000,cadence:'WEEKLY',interval:'week'},
 diamond:{label:'💎 DIAMOND',amount:8000,cadence:'MONTHLY',interval:'month'},
 platinum:{label:'👑 PLATINUM',amount:80000,cadence:'ANNUAL',interval:'year'}
};
export function squareReady(){return !!(process.env.SQUARE_ACCESS_TOKEN&&process.env.SQUARE_LOCATION_ID&&process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);}
export async function square(path,{method='GET',body}={}){
 if(!process.env.SQUARE_ACCESS_TOKEN)fail(503,'Square membership setup is pending.');
 const r=await fetch(BASE+path,{method,headers:{Authorization:'Bearer '+process.env.SQUARE_ACCESS_TOKEN,'Square-Version':VERSION,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)fail(r.status>=500?503:400,data.errors?.[0]?.detail||'Square request failed.');
 return data;
}
async function upsert(object,key){
 return square('/v2/catalog/object',{method:'POST',body:{idempotency_key:key,object}});
}
export async function ensurePlans(db){
 const cached=await db.get('square/plans-v1',{type:'json'});
 if(cached?.gold&&cached?.diamond&&cached?.platinum)return cached;
 const seed=createHash('sha256').update(process.env.SQUARE_LOCATION_ID+'|bank-trades-memberships-v1').digest('hex').slice(0,32);
 const parent=await upsert({type:'SUBSCRIPTION_PLAN',id:'#BANK_TRADES',present_at_all_locations:true,subscription_plan_data:{name:'BANK TRADES Membership',all_items:true}},'bt-plan-'+seed);
 const planId=parent.catalog_object?.id||parent.id_mappings?.find(x=>x.client_object_id==='#BANK_TRADES')?.object_id;
 if(!planId)fail(503,'Could not initialize Square membership plans.');
 const ids={};
 for(const [name,p] of Object.entries(squarePlans)){
  const res=await upsert({type:'SUBSCRIPTION_PLAN_VARIATION',id:'#BT_'+name.toUpperCase(),present_at_all_locations:true,subscription_plan_variation_data:{name:p.label+' Membership',subscription_plan_id:planId,phases:[{cadence:p.cadence,ordinal:0,pricing:{type:'STATIC',price:{amount:p.amount,currency:'USD'}}}]}},'bt-var-'+name+'-'+seed);
  ids[name]=res.catalog_object?.id||res.id_mappings?.find(x=>x.client_object_id==='#BT_'+name.toUpperCase())?.object_id;
  if(!ids[name])fail(503,'Could not initialize '+p.label+' membership.');
 }
 await db.setJSON('square/plans-v1',ids);
 return ids;
}
export async function createCheckout(db,user,plan,origin){
 const p=squarePlans[plan];if(!p)fail(400,'Choose a listed membership.');
 const ids=await ensurePlans(db),variation=ids[plan];
 const attempt=user.id+'|'+plan+'|'+Math.floor(Date.now()/1800000);
 const idem=createHash('sha256').update(attempt).digest('hex');
 const result=await square('/v2/online-checkout/payment-links',{method:'POST',body:{
  idempotency_key:idem,
  quick_pay:{name:'BANK TRADES '+p.label.replace(/[^A-Z ]/g,'').trim(),price_money:{amount:p.amount,currency:'USD'},location_id:process.env.SQUARE_LOCATION_ID},
  checkout_options:{subscription_plan_id:variation,redirect_url:new URL('/?checkout=success',origin).href},
  pre_populated_data:{buyer_email:user.email},
  description:'BANK TRADES '+p.label+' membership · billed '+p.interval+'ly'
 }});
 const link=result.payment_link;if(!link?.url||!link.order_id)fail(503,'Square checkout could not be created.');
 await db.setJSON('square/pending-order/'+link.order_id,{userId:user.id,email:user.email.toLowerCase(),plan,variation,createdAt:Date.now()});
 return {url:link.url};
}
export async function activeSubscriptionForCustomer(db,customerId){
 const ids=Object.values(await ensurePlans(db));
 const data=await square('/v2/subscriptions/search',{method:'POST',body:{query:{filter:{customer_ids:[customerId],location_ids:[process.env.SQUARE_LOCATION_ID]}}}});
 return (data.subscriptions||[]).find(s=>['ACTIVE','PENDING'].includes(s.status)&&ids.includes(s.plan_variation_id))||null;
}
export async function cancelSubscription(id){return square('/v2/subscriptions/'+encodeURIComponent(id),{method:'DELETE'});}
export {randomUUID};
