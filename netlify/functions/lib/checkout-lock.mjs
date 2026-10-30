import {fail} from './access.mjs';
export async function withCheckoutLock(db,userID,operation){
 const key='checkout-lock/'+userID,existing=await db.getWithMetadata(key,{type:'json'});
 if(existing?.data.until>Date.now())fail(409,'Checkout is being prepared. Please retry shortly.');
 const lock=await db.setJSON(key,{until:Date.now()+180000},existing?{onlyIfMatch:existing.etag}:{onlyIfNew:true});
 if(!lock.modified)fail(409,'Checkout is being prepared. Please retry shortly.');
 try{return await operation();}finally{await db.setJSON(key,{until:0},{onlyIfMatch:lock.etag});}
}
