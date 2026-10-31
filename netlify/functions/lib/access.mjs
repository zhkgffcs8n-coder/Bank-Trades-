import {getUser, admin} from '@netlify/identity';
import {getStore} from '@netlify/blobs';
import {activeSubscriptionForCustomer,squareReady} from './square.mjs';

export const store=()=>getStore({name:'bank-trades-memberships',consistency:'strong'});
export const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function fail(status,message){throw Object.assign(new Error(message),{status});}
export const errorResponse=e=>json({error:e.status?e.message:'Service temporarily unavailable. Please try again.'},e.status||503);
export async function authenticated(){
 const session=await getUser();if(!session)fail(401,'Please sign in first.');
 const user=await admin.getUser(session.id);
 if(!user.confirmedAt||!user.email)fail(403,'Confirm your email before continuing.');
 return user;
}
export const isOwner=user=>user.roles?.includes('owner')===true;
export async function owner(){const u=await authenticated();if(!isOwner(u))fail(403,'Owner access required.');return u;}
export async function freeEntitlement(db,user,now=Date.now()){
 const grant=await db.get('grant/'+user.id,{type:'json'});if(!grant?.codeHash)return null;
 const code=await db.get('code/'+grant.codeHash,{type:'json'});
 if(code&&!code.revoked&&code.redeemedBy===user.id&&code.email===user.email.toLowerCase()&&Number(code.accessUntil)>now)return {active:true,source:'free-code',expiresAt:code.accessUntil};
 return null;
}
export async function paidEntitlement(db,user){
 if(!squareReady())return null;
 const mapping=await db.get('square/customer/'+user.id,{type:'json'});if(!mapping?.id)return null;
 if(await db.get('square/risk/'+mapping.id,{type:'json'}))return {active:false,source:'payment-review'};
 const sub=await activeSubscriptionForCustomer(db,mapping.id);
 return sub?{active:true,source:'square',subscriptionId:sub.id}:null;
}
export async function entitlement(user){
 if(isOwner(user))return {active:true,source:'owner'};
 const db=store();return await freeEntitlement(db,user)||await paidEntitlement(db,user)||{active:false,source:'membership-required'};
}
export async function member(){const user=await authenticated(),access=await entitlement(user);if(!access.active)fail(403,'An active membership or free access code is required.');return user;}
