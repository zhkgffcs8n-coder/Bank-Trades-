import {randomUUID} from 'node:crypto';
import {initialState} from '../../../src/live-execution.mjs';
export function liveRepository(db,userId){
 if(!/^[a-zA-Z0-9_-]{8,128}$/.test(userId))throw Error('INVALID_OWNER_ID');
 const key='owner/'+userId;
 const read=()=>db.getWithMetadata(key,{type:'json'});
 async function acquire(){
  const current=await read();if(current?.data?.lock)throw Error('EXECUTION_BUSY');
  const token=randomUUID(),record={state:current?.data?.state||initialState(),lock:{token,at:Date.now()}};
  const result=await db.setJSON(key,record,current?{onlyIfMatch:current.etag}:{onlyIfNew:true});
  if(!result.modified||!result.etag)throw Error('EXECUTION_BUSY');let etag=result.etag;
  return {state:record.state,async persist(state){record.state=state;const r=await db.setJSON(key,record,{onlyIfMatch:etag});if(!r.modified||!r.etag)throw Error('STATE_CONFLICT');etag=r.etag;},
   async release(){const r=await db.setJSON(key,{state:record.state,lock:null},{onlyIfMatch:etag});if(!r.modified)throw Error('LOCK_RELEASE_CONFLICT');}};
 }
 const stopKey=key+'/stop';
 return {acquire,async read(){return (await read())?.data||{state:initialState(),lock:null};},
  async stop(){await db.setJSON(stopKey,{stopped:true,token:randomUUID(),at:Date.now()});},
  async stopped(){return (await db.get(stopKey,{type:'json'}))?.stopped!==false;},
  async startFence(expected){const current=await db.getWithMetadata(stopKey,{type:'json'});if((current?.etag||null)!==expected)throw Error('STOP_CHANGED_DURING_START');const r=await db.setJSON(stopKey,{stopped:false,token:randomUUID(),at:Date.now()},current?{onlyIfMatch:current.etag}:{onlyIfNew:true});if(!r.modified)throw Error('STOP_CHANGED_DURING_START');},
  async fence(){return (await db.getWithMetadata(stopKey,{type:'json'}))?.etag||null;}};
}
// Locks deliberately have no timed takeover: a crashed worker requires review,
// preventing a delayed worker from submitting after a replacement has acquired its budget.
