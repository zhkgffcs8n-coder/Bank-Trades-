import {createHash} from 'node:crypto';

export const DEMO_WAKE_KEY='champion-kaibot/demo-wake';
export const hashDemoWake=token=>createHash('sha256').update(token).digest('hex');

export async function claimDemoWake(store,token,now=Date.now()){
 if(!/^[a-f0-9]{64}$/.test(token||''))return false;
 const current=await store.getWithMetadata(DEMO_WAKE_KEY,{type:'json'});
 const ticket=current?.data;
 if(!current?.etag||ticket?.worker?.championShadow?.at!==ticket?.at||ticket?.hash!==hashDemoWake(token)||!Number.isFinite(ticket.at)||
  now-ticket.at<0||now-ticket.at>10000)return false;
 const result=await store.setJSON(DEMO_WAKE_KEY,{at:ticket.at,used:true},{onlyIfMatch:current.etag});
 return result.modified===true?ticket.worker||false:false;
}
