import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoAuthorizationRevoked} from '../src/demo-authorization-fence.mjs';

const ownerId='owner-1';
const original={ownerId,side:'UP',requestId:'original-uuid'};
test('same Demo owner request remains authorized',()=>{
 assert.equal(demoAuthorizationRevoked({...original},original,ownerId),false);
});
test('STOP revokes in-flight Demo authorization',()=>{
 assert.equal(demoAuthorizationRevoked({ownerId:null},original,ownerId),true);
 assert.equal(demoAuthorizationRevoked(null,original,ownerId),true);
});
test('new same-owner Demo request revokes previous in-flight request',()=>{
 assert.equal(demoAuthorizationRevoked({...original,requestId:'replacement-uuid'},original,ownerId),true);
 assert.equal(demoAuthorizationRevoked({...original,side:'DOWN',requestId:'replacement-uuid'},original,ownerId),true);
});
test('different owner cannot continue a Demo request',()=>{
 assert.equal(demoAuthorizationRevoked({...original,ownerId:'other'},original,ownerId),true);
});
test('legacy owner authorization without UUID retains old STOP behavior',()=>{
 const legacy={ownerId,side:'UP'};
 assert.equal(demoAuthorizationRevoked({...legacy},legacy,ownerId),false);
 assert.equal(demoAuthorizationRevoked({ownerId:null},legacy,ownerId),true);
});
test('deployed lifecycle uses authorization fence for Demo order submissions',()=>{
 const src=readFileSync(new URL('../netlify/functions/kalshi-demo-lifecycle.mjs',import.meta.url),'utf8');
 assert.match(src,/const checkStopped=async\(\)=>demoAuthorizationRevoked\(await db\.get\(testKey,\{type:'json'\}\),authorization,id\)/);
});
