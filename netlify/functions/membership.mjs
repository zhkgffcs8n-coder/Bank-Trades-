import {verifyRequestOrigin} from '@netlify/identity';
import {authenticated,owner,isOwner,entitlement,store,stripe,priceIDs,json,fail,errorResponse} from './lib/access.mjs';
import {issueCode,redeemCode,revokeCode} from './lib/codes.mjs';
import {createHash} from 'node:crypto';
import {withCheckoutLock} from './lib/checkout-lock.mjs';

async function customer(db,user,client){
 const key='customer/'+user.id,existing=await db.get(key,{type:'json'});
 if(existing)return existing.id;
 const c=await client.customers.create({email:user.email},{idempotencyKey:'bank-trades-customer-'+user.id});
 // Both directions must exist before any Checkout can use this customer.
 await db.setJSON('identity/'+c.id,{id:user.id});
 await db.setJSON(key,{id:c.id});
 return c.id;
}
export default async(req)=>{
 try{
  if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed.');
  if(req.method==='POST')verifyRequestOrigin(req);
  const user=await authenticated(),db=store();
  if(req.method==='GET'){
   const access=await entitlement(user),plans=[];
   if(process.env.STRIPE_CHECKOUT_ENABLED==='true' && process.env.STRIPE_WEBHOOK_SECRET && Object.keys(priceIDs()).length){
    const client=stripe();
    for(const [name,id] of Object.entries(priceIDs())){
     const p=await client.prices.retrieve(id);
     if(p.active&&p.recurring&&p.type==='recurring'&&p.unit_amount!==null)plans.push({name,amount:p.unit_amount,currency:p.currency,interval:p.recurring.interval,intervalCount:p.recurring.interval_count});
    }
   }
   return json({email:user.email,owner:isOwner(user),access,plans});
  }
  if(Number(req.headers.get('content-length')||0)>4096)fail(413,'Request too large.');
  const body=await req.json();
  if(body.action==='redeem')return json(await redeemCode(db,user,body.code));
  if(body.action==='issue'){await owner();return json(await issueCode(db,user,body));}
  if(body.action==='revoke'){await owner();return json(await revokeCode(db,body.codeHash));}
  if(body.action==='portal'){
   const id=(await db.get('customer/'+user.id,{type:'json'}))?.id;
   if(!id)fail(400,'No billing account exists yet.');
   const session=await stripe().billingPortal.sessions.create({customer:id,return_url:new URL('/',req.url).href});
   return json({url:session.url});
  }
  if(body.action==='checkout'){
   if(process.env.STRIPE_CHECKOUT_ENABLED!=='true'||!process.env.STRIPE_WEBHOOK_SECRET)fail(503,'Checkout is awaiting activation.');
   const price=priceIDs()[body.plan];if(!price)fail(400,'Choose a listed membership.');
   return await withCheckoutLock(db,user.id,async()=>{
   if((await entitlement(user)).active)fail(409,'You already have access. Use Manage billing for an existing subscription.');
   const client=stripe(),id=await customer(db,user,client);
   // Pending/incomplete subscriptions must be managed instead of duplicated.
   for await(const s of client.subscriptions.list({customer:id,status:'all',limit:100}))
    if(!['canceled','incomplete_expired'].includes(s.status))fail(409,'An existing subscription needs attention. Open Manage billing.');
   // Reuse an open Checkout rather than create a second purchase flow.
   const previous=await client.checkout.sessions.list({customer:id,status:'open',limit:1});
   if(previous.data[0]?.url)return json({url:previous.data[0].url});
   const attempt=user.id+'-'+price+'-'+Math.floor(Date.now()/1800000);
   const suffix=Array.from(createHash('sha256').update(attempt).digest().subarray(0,8),n=>String.fromCharCode(97+n%26)).join('');
   // A short, stable bucket makes rapid retries idempotent across function instances.
   const session=await client.checkout.sessions.create({mode:'subscription',customer:id,line_items:[{price,quantity:1}],subscription_data:{billing_mode:{type:'flexible'}},integration_identifier:'bank_trades_'+suffix,
    success_url:new URL('/?checkout=success',req.url).href,cancel_url:new URL('/?checkout=cancel',req.url).href},
    {idempotencyKey:'bank-trades-checkout-'+attempt});
   return json({url:session.url});
   });
  }
  fail(400,'Unknown action.');
 }catch(e){return errorResponse(e);}
};
