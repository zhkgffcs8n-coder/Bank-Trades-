import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {guardedVerification,verifyKalshi} from '../netlify/functions/kalshi-credentials.mjs';

const pem=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
test('balance verification honors Retry-After and does not retry authentication failures',async()=>{
 const waits=[];
 let calls=0;
 const options={clock:()=>1000,random:()=>0,sleep:async ms=>{waits.push(ms);}};
 const result=await verifyKalshi('test-key',pem,async ()=>{
  calls++;
  return calls===1?new Response(null,{status:429,headers:{'Retry-After':'1'}}):new Response(null,{status:401});
 },options);
 assert.equal(result.status,401);
 assert.equal(calls,2);
 assert.deepEqual(waits,[1000]);
 const limited=await verifyKalshi('test-key',pem,async ()=>new Response(null,{status:429,headers:{'Retry-After':'30'}}),options);
 assert.equal(limited.retryAfterMs,30000);
 assert.deepEqual(waits,[1000]);
});

test('concurrent verification and cooldown suppress additional exchange reads',async()=>{
 let record,version=0,now=1000,calls=0;
 const store={
  getWithMetadata:async()=>record,
  setJSON:async (key,data,conditions)=>{
   if(record?conditions.onlyIfMatch!==record.etag:!conditions.onlyIfNew)return {modified:false};
   record={data,etag:String(++version)};
   return {modified:true,etag:record.etag};
  }
 };
 const verify=async()=>{calls++;return {ok:false,status:429,retryAfterMs:30000};};
 const checks=await Promise.all([1,2].map(()=>guardedVerification(store,'owner',verify,()=>now)));
 assert.deepEqual(checks.map(x=>x.status),[429,429]);
 assert.equal(calls,1);
 now+=29000;
 await guardedVerification(store,'owner',verify,()=>now);
 assert.equal(calls,1);
 now+=1000;
 await guardedVerification(store,'owner',verify,()=>now);
 assert.equal(calls,2);
});

test('cooldown displays only the matching saved credential outcome and never reuses it for a save',async()=>{
 let record;
 const store={getWithMetadata:async()=>record,setJSON:async (key,data)=>{
  record={data,etag:'1'};
  return {modified:true,etag:'1'};
 }};
 const verify=async()=>({ok:true,status:200});
 await guardedVerification(store,'owner',verify,()=>1000,{revision:'saved'});
 const noFetch=async()=>assert.fail('cooldown must not send another request');
 assert.deepEqual(await guardedVerification(store,'owner',noFetch,()=>1100,{revision:'saved',allowCached:true}),
  {ok:true,status:200,checkedAt:1000,cached:true});
 for(const options of [{revision:'different',allowCached:true},{revision:'saved'}]){
  assert.equal((await guardedVerification(store,'owner',noFetch,()=>1100,options)).locallyThrottled,true);
 }
});
