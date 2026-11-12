import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createDemoSnapshotDiagnostic,probeDemoSnapshot,demoSnapshotProbeReceipt,shouldProbeTerminalDemo} from '../netlify/functions/kalshi-demo-snapshot-diagnostic.mjs';

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

test('independent snapshot receipt is sanitized and does not claim release certification',()=>{
 const result={ok:false,correlationId:'safe-correlation-id',checkedAt:'2026-11-11T21:22:00.000Z',
  operations:[
   {phase:'BALANCE',httpStatus:401,durationMs:18,failureCategory:'AUTHENTICATION_OR_PERMISSION'},
   {phase:'ORDERS',httpStatus:200,durationMs:12,failureCategory:null}
  ],secret:'never-emit'};
 const receipt=demoSnapshotProbeReceipt(result,'test-build');
 assert.deepEqual(receipt,{
  status:'DEMO_SNAPSHOT_READS_FAILED',transportCause:'AUTHENTICATION_OR_PERMISSION',
  failedPhase:'BALANCE',httpStatus:401,
  requestId:'safe-correlation-id',operation:'INDEPENDENT_READ_ONLY_SNAPSHOT',
  checkedAt:'2026-11-11T21:22:00.000Z',durationMs:18,commit:'test-build'
 });
 assert.doesNotMatch(JSON.stringify(receipt),/never-emit/);
 assert.equal(demoSnapshotProbeReceipt({...result,ok:true,operations:[]}).status,'DEMO_SNAPSHOT_READS_OK');
});

test('terminal Demo state triggers periodic read-only probe without resetting lifecycle',()=>{
 const now=Date.parse('2026-11-12T05:30:00Z');
 const finished={status:'DEMO_LIFECYCLE_FAILED',finished:true};
 const active={status:'DEMO_ENTRY_RECONCILED',finished:false};
 assert.equal(shouldProbeTerminalDemo(finished,null,now),true);
 assert.equal(shouldProbeTerminalDemo(active,null,now),false);
 assert.equal(shouldProbeTerminalDemo(finished,{checkedAt:new Date(now-9*60000).toISOString()},now),false);
 assert.equal(shouldProbeTerminalDemo(finished,{checkedAt:new Date(now-10*60000).toISOString()},now),true);
});


test('Demo probe receipt excludes invalid HTTP statuses and unrecognized phase names',()=>{
 const base={ok:false,correlationId:'safe-id',checkedAt:'2026-11-12T06:00:00Z',operations:[
  {phase:'SECRET_INTERNAL_PHASE',httpStatus:999,failureCategory:'REQUEST_FAILED',durationMs:10}
 ]};
 const receipt=demoSnapshotProbeReceipt(base,'safe-sha');
 assert.equal(receipt.failedPhase,null);
 assert.equal(receipt.httpStatus,null);
 assert.doesNotMatch(JSON.stringify(receipt),/SECRET_INTERNAL_PHASE|999/);
});
