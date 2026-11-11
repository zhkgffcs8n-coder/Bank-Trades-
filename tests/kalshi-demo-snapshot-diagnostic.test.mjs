import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createDemoSnapshotDiagnostic,probeDemoSnapshot} from '../netlify/functions/kalshi-demo-snapshot-diagnostic.mjs';

test('independent Demo probe reports all phases and redacts exchange responses',async()=>{
 const {privateKey}=generateKeyPairSync('ed25519');
 const credentials={keyId:'test-key',privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'})};
 const result=await probeDemoSnapshot(credentials,async (url,options)=>{
  assert.equal(options.method,'GET');
  assert.equal(new URL(url).origin,'https://external-api.demo.kalshi.co');
  const path=new URL(url).pathname.split('/').pop();
  const bodies={balance:{balance:123},orders:{orders:[]},positions:{market_positions:[]},settlements:{settlements:[]}};
  return path==='fills'?Response.json({message:'private exchange data'},{status:401}):Response.json(bodies[path]);
 });
 assert.equal(result.ok,false);
 assert.deepEqual(result.operations.map(x=>[x.phase,x.httpStatus,x.failureCategory]),[
  ['BALANCE',200,null],['ORDERS',200,null],['FILLS',401,'AUTHENTICATION_OR_PERMISSION'],
  ['POSITIONS',200,null],['SETTLEMENTS',200,null]
 ]);
 assert.match(result.correlationId,/^[a-f0-9-]{36}$/);
 assert.ok(result.operations.every(x=>Number.isInteger(x.durationMs)&&x.durationMs>=0));
 assert.doesNotMatch(JSON.stringify(result),/private exchange data|test-key/);
});

test('Demo diagnostic denies other owners and cross-origin requests before reading storage',async()=>{
 const url='https://site.test/.netlify/functions/kalshi-demo-snapshot-diagnostic';
 let reads=0;
 const make=id=>createDemoSnapshotDiagnostic({getOwner:async()=>({id}),ownerId:()=> 'owner-id',
  getStoreForDemo:()=>{reads++;throw Error('must not load storage');}});
 assert.equal((await make('other')(new Request(url))).status,403);
 assert.equal((await make('owner-id')(new Request(url,{method:'POST',headers:{origin:'https://other.test'}}))).status,403);
 assert.equal((await make('owner-id')(new Request(url))).status,200);
 assert.equal(reads,0);
});
