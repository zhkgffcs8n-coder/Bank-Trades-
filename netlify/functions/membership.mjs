import {verifyRequestOrigin} from '@netlify/identity';
import {authenticated,owner,isOwner,entitlement,store,json,fail,errorResponse} from './lib/access.mjs';
import {issueCode,redeemCode,revokeCode} from './lib/codes.mjs';
import {withCheckoutLock} from './lib/checkout-lock.mjs';
import {squarePlans,squareReady,createCheckout,activeSubscriptionForCustomer,cancelSubscription} from './lib/square.mjs';

export default async(req)=>{
 try{
  if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed.');
  if(req.method==='POST')verifyRequestOrigin(req);
  const user=await authenticated(),db=store();
  if(req.method==='GET'){
   const access=await entitlement(user);
   const plans=Object.entries(squarePlans).map(([name,p])=>({name,label:p.label,amount:p.amount,currency:'USD',interval:p.interval,intervalCount:1,available:squareReady()}));
   return json({email:user.email,owner:isOwner(user),access,plans});
  }
  if(Number(req.headers.get('content-length')||0)>4096)fail(413,'Request too large.');
  const body=await req.json();
  if(body.action==='redeem')return json(await redeemCode(db,user,body.code));
  if(body.action==='issue'){await owner();return json(await issueCode(db,user,body));}
  if(body.action==='revoke'){await owner();return json(await revokeCode(db,body.codeHash));}
  if(body.action==='checkout'){
   if(!squareReady())fail(503,'Square checkout is awaiting activation.');
   return withCheckoutLock(db,user.id,async()=>{
    if((await entitlement(user)).active)fail(409,'You already have active access.');
    return json(await createCheckout(db,user,body.plan,req.url));
   });
  }
  if(body.action==='portal'||body.action==='cancel'){
   const mapping=await db.get('square/customer/'+user.id,{type:'json'});if(!mapping?.id)fail(400,'No Square billing account exists yet.');
   const sub=await activeSubscriptionForCustomer(db,mapping.id);if(!sub)fail(400,'No active Square subscription was found.');
   await cancelSubscription(sub.id);return json({ok:true,message:'Your Square membership cancellation was submitted.'});
  }
  fail(400,'Unknown action.');
 }catch(e){return errorResponse(e);}
};
