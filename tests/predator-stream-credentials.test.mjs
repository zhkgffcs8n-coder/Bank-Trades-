import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {predatorStreamCredentials} from '../scripts/predator-stream-credentials.mjs';

test('worker accepts a Railway PEM secret or the existing mounted key',async t=>{
 const {privateKey:pem}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const dir=await mkdtemp(join(tmpdir(),'predator-key-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'key.pem');
 await writeFile(file,pem,{mode:0o600});
 const env={PREDATOR_KALSHI_KEY_ID:'example'};
 assert.equal((await predatorStreamCredentials({...env,PREDATOR_KALSHI_PRIVATE_KEY_PEM:pem})).privateKeyPem,pem.trim());
 assert.equal((await predatorStreamCredentials({...env,PREDATOR_KALSHI_PRIVATE_KEY_FILE:file})).privateKeyPem,pem);
 const {privateKey:edPem}=generateKeyPairSync('ed25519',{privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 assert.equal((await predatorStreamCredentials({...env,PREDATOR_KALSHI_PRIVATE_KEY_PEM:edPem})).privateKeyPem,edPem.trim());
 await assert.rejects(predatorStreamCredentials({...env,PREDATOR_KALSHI_PRIVATE_KEY_FILE:file,PREDATOR_KALSHI_PRIVATE_KEY_PEM:pem}),/AMBIGUOUS/);
});

test('worker falls back to public data without credentials and rejects invalid secrets',async ()=>{
 assert.equal(await predatorStreamCredentials({}),null);
 await assert.rejects(predatorStreamCredentials({PREDATOR_KALSHI_KEY_ID:'example'}),/INCOMPLETE/);
 await assert.rejects(predatorStreamCredentials({PREDATOR_KALSHI_KEY_ID:'example',PREDATOR_KALSHI_PRIVATE_KEY_PEM:'invalid'}),/^Error: PREDATOR_KALSHI_PRIVATE_KEY_INVALID_OR_UNREADABLE$/);
});
