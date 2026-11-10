import test from 'node:test';
import assert from 'node:assert/strict';
import {checkKalshiProductionReads} from '../scripts/kalshi-production-readiness.mjs';

test('production readiness makes signed-client reads and publishes only outcomes',async()=>{
 const methods=[];
 const client={async request(method,path){
  methods.push(method);
  if(path.endsWith('/balance'))return {balance:12345};
  throw Error('KALSHI_HTTP_403');
 }};
 assert.deepEqual(await checkKalshiProductionReads(client,()=>42),
  {checkedAt:42,balance:'VERIFIED',orders:'KALSHI_HTTP_403'});
 assert.deepEqual(methods,['GET','GET']);
});
