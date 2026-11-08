import test from 'node:test';
import assert from 'node:assert/strict';
import {readCollectorSeries} from '../netlify/functions/market-collector.mjs';

test('collector recovers a series after one transient failure',async()=>{
 let calls=0;
 const waits=[];
 const result=await readCollectorSeries('https://example.test',{
  fetchImpl:async()=>++calls===1?new Response('',{status:503}):Response.json({markets:[{ticker:'BTC'}]}),
  wait:async ms=>waits.push(ms)
 });
 assert.deepEqual(result,{markets:[{ticker:'BTC'}]});
 assert.equal(calls,2);
 assert.deepEqual(waits,[400]);
});

test('collector does not retry permanent errors or ignore a long rate-limit delay',async()=>{
 for(const response of [new Response('',{status:401}),new Response('',{status:429,headers:{'retry-after':'60'}})]){
  let calls=0;
  const result=await readCollectorSeries('https://example.test',{
   fetchImpl:async()=>{calls++;return response},wait:async()=>assert.fail('unexpected retry')
  });
  assert.equal(result,null);
  assert.equal(calls,1);
 }
});
