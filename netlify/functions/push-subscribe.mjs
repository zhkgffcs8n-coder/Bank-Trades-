import {getStore} from '@netlify/blobs';
import {authenticated,json,errorResponse,fail} from './lib/access.mjs';
import {createHash} from 'node:crypto';
const db=()=>getStore({name:'bank-trades-push-subscriptions',consistency:'strong'});
export default async req=>{try{
 const user=await authenticated();
 if(req.method==='GET')return json({publicKey:process.env.WEB_PUSH_VAPID_PUBLIC_KEY||null,configured:!!(process.env.WEB_PUSH_VAPID_PUBLIC_KEY&&process.env.WEB_PUSH_VAPID_PRIVATE_KEY)});
 if(req.method!=='POST'&&req.method!=='DELETE')fail(405,'Unsupported method');
 const origin=req.headers.get('origin');if(origin!==new URL(req.url).origin)fail(403,'Origin mismatch');
 const body=await req.json();const subscription=body?.subscription;
 if(!subscription||typeof subscription.endpoint!=='string'||!subscription.endpoint.startsWith('https://')||subscription.endpoint.length>2048)fail(400,'Invalid subscription');
 const key=createHash('sha256').update(user.id+'|'+subscription.endpoint).digest('hex');
 if(req.method==='DELETE'){await db().delete('subs/'+key);return json({ok:true})}
 if(!subscription.keys?.p256dh||!subscription.keys?.auth)fail(400,'Missing browser push keys');
 await db().setJSON('subs/'+key,{subscription,userId:user.id,updatedAt:Date.now()});
 return json({ok:true});
}catch(e){return errorResponse(e)}};
