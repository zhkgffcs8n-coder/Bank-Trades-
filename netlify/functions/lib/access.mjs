import {getUser, admin} from '@netlify/identity';
import {getStore} from '@netlify/blobs';
import Stripe from 'stripe';

export const store = () => getStore({name:'bank-trades-memberships', consistency:'strong'});
export const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function fail(status,message){throw Object.assign(new Error(message),{status});}
export const errorResponse = e => json({error:e.status ? e.message : 'Service temporarily unavailable. Please try again.'}, e.status || 503);
export const priceIDs = () => Object.fromEntries(['weekly','monthly','annual'].map(k=>[k,process.env['STRIPE_PRICE_'+k.toUpperCase()]]).filter(([,v])=>v));
export function stripe(){
 if(!process.env.STRIPE_RESTRICTED_KEY) fail(503,'Paid membership setup is pending. Free access codes remain available.');
 return new Stripe(process.env.STRIPE_RESTRICTED_KEY,{apiVersion:'2026-09-30.endive',maxNetworkRetries:2,timeout:10000});
}
export async function authenticated(){
 const session=await getUser();
 if(!session)fail(401,'Please sign in first.');
 // Fresh server-owned attributes; never trust local storage, profile metadata, or JWT roles alone.
 const user=await admin.getUser(session.id);
 if(!user.confirmedAt || !user.email)fail(403,'Confirm your email before continuing.');
 return user;
}
export const isOwner = user => user.roles?.includes('owner') === true;
export async function owner(){const u=await authenticated();if(!isOwner(u))fail(403,'Owner access required.');return u;}
export async function freeEntitlement(db,user,now=Date.now()){
 const grant=await db.get('grant/'+user.id,{type:'json'});
 if(!grant?.codeHash)return null;
 const code=await db.get('code/'+grant.codeHash,{type:'json'});
 if(code && !code.revoked && code.redeemedBy===user.id && code.email===user.email.toLowerCase() && Number(code.accessUntil)>now)
  return {active:true,source:'free-code',expiresAt:code.accessUntil};
 return null;
}
export function subscriptionEligible(s,allowed,now=Date.now()){
 // Trialing, unpaid, incomplete, paused, and past_due never grant paid access.
 return s.status==='active' && !s.pause_collection && s.latest_invoice?.status==='paid' && s.items?.data?.some(i=>allowed.includes(i.price?.id) && Number(i.current_period_end ?? s.current_period_end)*1000>now);
}
export async function paidEntitlement(db,user){
 const mapping=await db.get('customer/'+user.id,{type:'json'});
 if(!mapping?.id || !Object.keys(priceIDs()).length)return null;
 if(await db.get('risk/'+mapping.id,{type:'json'}))return {active:false,source:'payment-review'};
 const client=stripe();
 // Query authoritative Stripe state so out-of-order webhooks cannot restore cancelled access.
 for await(const s of client.subscriptions.list({customer:mapping.id,status:'all',limit:100,expand:['data.latest_invoice']}))
  if(subscriptionEligible(s,Object.values(priceIDs())))return {active:true,source:'stripe'};
 return null;
}
export async function entitlement(user){
 if(isOwner(user))return {active:true,source:'owner'};
 const db=store();
 return await freeEntitlement(db,user) || await paidEntitlement(db,user) || {active:false,source:'membership-required'};
}
export async function member(){const user=await authenticated();const access=await entitlement(user);if(!access.active)fail(403,'An active membership or free access code is required.');return user;}
