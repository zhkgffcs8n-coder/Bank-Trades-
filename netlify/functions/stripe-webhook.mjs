import {stripe,store,json,fail,errorResponse} from './lib/access.mjs';
const lifecycle=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed']);
const risk=new Set(['charge.dispute.created','charge.refunded','radar.early_fraud_warning.created']);
export default async req=>{
 try{
  if(req.method!=='POST')fail(405,'Method not allowed.');
  if(!process.env.STRIPE_WEBHOOK_SECRET)fail(503,'Webhook configuration pending.');
  const client=stripe();let event;
  try{event=client.webhooks.constructEvent(await req.text(),req.headers.get('stripe-signature'),process.env.STRIPE_WEBHOOK_SECRET);}catch{fail(400,'Invalid webhook signature.');}
  if(!lifecycle.has(event.type)&&!risk.has(event.type))return json({received:true});
  const db=store();if(await db.get('event/'+event.id,{type:'json'}))return json({received:true});
  const object=event.data.object;
  let customer=typeof object.customer==='string'?object.customer:object.customer?.id;
  if(risk.has(event.type)&&!customer){
   const chargeID=typeof object.charge==='string'?object.charge:object.charge?.id;
   if(!chargeID)fail(503,'Affected charge is unresolved.');
   const charge=await client.charges.retrieve(chargeID);
   customer=typeof charge.customer==='string'?charge.customer:charge.customer?.id;
  }
  if(!customer)fail(503,'Affected customer is unresolved.');
  const identity=await db.get('identity/'+customer,{type:'json'});
  // Other businesses/products may share this Stripe account; do not grant access from them.
  if(identity){
   if(risk.has(event.type))await db.setJSON('risk/'+customer,{eventID:event.id,type:event.type,reviewRequired:true},{onlyIfNew:true});
   else await db.setJSON('billing-event/'+event.id,{customer,type:event.type,created:event.created});
   // Entitlement is read directly from Stripe on every access; an old event never reinstates access.
  }
  await db.setJSON('event/'+event.id,{processed:true},{onlyIfNew:true});
  return json({received:true});
 }catch(e){return errorResponse(e);}
};
