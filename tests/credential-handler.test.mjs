import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync} from 'node:crypto';
import {createCredentialHandler} from '../netlify/functions/kalshi-credentials.mjs';
import {initialState} from '../src/live-execution.mjs';
const pair=generateKeyPairSync('rsa',{modulusLength:2048}),pem=pair.privateKey.export({type:'pkcs8',format:'pem'});
const req=body=>new Request('https://site.test/credentials',{method:'POST',headers:{origin:'https://site.test','content-type':'application/json'},body:JSON.stringify(body)});
test('rotation is required; rejected keys never persist; successful credentials are encrypted',async()=>{
 const original=process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY;process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY='ab'.repeat(32);
 let stored=null,verified=0,accept=false,released=0;
 const handler=createCredentialHandler({getOwner:async()=>({id:'owner1234'}),getDb:()=>({get:async()=>stored,setJSON:async(k,v)=>{stored=v}}),getLive:()=>({acquire:async()=>({state:initialState(),release:async()=>released++})}),verify:async()=>{verified++;return {ok:accept,status:401}}});
 try{
  const body={keyId:'new-test-key',privateKeyPem:pem};
  assert.equal((await handler(req(body))).status,400);assert.equal(verified,0);
  body.rotationConfirmed=true;assert.equal((await handler(req(body))).status,422);assert.equal(stored,null);
  accept=true;assert.equal((await handler(req(body))).status,200);assert.equal(stored.securityVersion,2);assert.ok(stored.envelope.ciphertext);assert.equal(JSON.stringify(stored).includes('PRIVATE KEY'),false);
  assert.equal((await handler(req(body))).status,400);assert.equal(released,4);
 }finally{if(original===undefined)delete process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY;else process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY=original;}
});
test('Ed25519 credentials are verified before encrypted storage',async()=>{
 const original=process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY;process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY='cd'.repeat(32);
 const ed=generateKeyPairSync('ed25519'),edPem=ed.privateKey.export({type:'pkcs8',format:'pem'});
 let stored=null;
 const handler=createCredentialHandler({
  getOwner:async()=>({id:'owner1234'}),
  getDb:()=>({get:async()=>stored,setJSON:async(k,v)=>{stored=v}}),
  getLive:()=>({acquire:async()=>({state:initialState(),release:async()=>{}})}),
  verify:async(keyId,key)=>{assert.equal(keyId,'ed-key');assert.equal(key,edPem);return {ok:true,status:200};}
 });
 try{
  const response=await handler(req({keyId:'ed-key',privateKeyPem:edPem,rotationConfirmed:true}));
  assert.equal(response.status,200);assert.equal(stored.securityVersion,2);assert.ok(stored.envelope.ciphertext);
 }finally{if(original===undefined)delete process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY;else process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY=original;}
});
test('legacy credentials report rotation required without contacting Kalshi',async()=>{
 const handler=createCredentialHandler({getOwner:async()=>({id:'owner1234'}),getDb:()=>({get:async()=>({envelope:{}})}),verify:async()=>{throw Error('must not verify exposed legacy key')}});
 const d=await (await handler(new Request('https://site.test/credentials'))).json();assert.equal(d.rotationRequired,true);assert.equal(d.connected,false);
});
