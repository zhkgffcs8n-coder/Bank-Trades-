import test from 'node:test';
import assert from 'node:assert/strict';
import {claimDemoWake,hashDemoWake} from '../src/demo-wake-ticket.mjs';

test('a Demo wake requires a fresh ticket and can only be claimed once',async()=>{
 const token='a'.repeat(64),at=1000;
 const worker={championShadow:{at,action:'BUY DOWN'}};
 let record={etag:'v1',data:{at,worker,hash:hashDemoWake(token)}};
 const store={
  getWithMetadata:async()=>record,
  setJSON:async(key,data,{onlyIfMatch})=>{
   if(onlyIfMatch!==record.etag)return {modified:false};
   record={etag:'v2',data};return {modified:true};
  }
 };
 assert.equal(await claimDemoWake(store,'b'.repeat(64),at),false);
 assert.equal(await claimDemoWake(store,token,at+10001),false);
 assert.deepEqual(await Promise.all([claimDemoWake(store,token,at),claimDemoWake(store,token,at)]),[worker,false]);
 assert.equal(await claimDemoWake(store,token,at),false);
});
