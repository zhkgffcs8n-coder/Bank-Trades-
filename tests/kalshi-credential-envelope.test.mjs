import test from 'node:test';
import assert from 'node:assert/strict';
import {sealKalshiCredentials,openKalshiCredentials} from '../netlify/functions/lib/kalshi-credential-envelope.mjs';
const secret='a'.repeat(64),userId='owner_12345',keyId='kalshi_key_123',privateKeyPem='-----BEGIN PRIVATE KEY-----\nTEST_ONLY_NOT_REAL\n-----END PRIVATE KEY-----';
test('encrypts credentials and decrypts only for owning account',()=>{
 const envelope=sealKalshiCredentials({userId,keyId,privateKeyPem,secret});
 assert.equal(JSON.stringify(envelope).includes(privateKeyPem),false);
 assert.deepEqual(openKalshiCredentials({userId,envelope,secret}),{keyId,privateKeyPem});
 assert.throws(()=>openKalshiCredentials({userId:'other_12345',envelope,secret}));
 assert.throws(()=>openKalshiCredentials({userId,envelope,secret:'b'.repeat(64)}));
});
test('rejects missing encryption secret, malformed identity, and tampering',()=>{
 assert.throws(()=>sealKalshiCredentials({userId,keyId,privateKeyPem}));
 assert.throws(()=>sealKalshiCredentials({userId:'bad',keyId,privateKeyPem,secret}));
 const envelope=sealKalshiCredentials({userId,keyId,privateKeyPem,secret});
 assert.throws(()=>openKalshiCredentials({userId,envelope:{...envelope,tag:'AAAA'},secret}));
});
