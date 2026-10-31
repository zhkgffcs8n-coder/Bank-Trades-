import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';

class MemoryStore{
 constructor(){this.rows=new Map();this.seq=0;}
 async get(key){return structuredClone(this.rows.get(key)?.data ?? null);}
 async getWithMetadata(key){return structuredClone(this.rows.get(key)??null);}
 async setJSON(key,data,options={}){
  const old=this.rows.get(key);
  if(options.onlyIfNew&&old || options.onlyIfMatch&&options.onlyIfMatch!==old?.etag)return {modified:false};
  const etag=String(++this.seq);this.rows.set(key,{data:structuredClone(data),etag});return {modified:true,etag};
 }
}
const db=new MemoryStore();globalThis.__membershipTest={db,session:null,user:null};
const identityCode=`export const getUser=async()=>globalThis.__membershipTest.session;export const admin={getUser:async()=>globalThis.__membershipTest.user};export const verifyRequestOrigin=req=>{if(req.headers.get('origin')!==new URL(req.url).origin)throw Object.assign(Error('Invalid origin'),{status:403})};`;
const blobsCode=`export const getStore=()=>globalThis.__membershipTest.db;`;
registerHooks({resolve(specifier,context,next){if(specifier==='@netlify/identity'||specifier==='@netlify/blobs')return {url:'data:text/javascript,'+encodeURIComponent(specifier==='@netlify/identity'?identityCode:blobsCode),shortCircuit:true};return next(specifier,context);}});
const access=await import('../netlify/functions/lib/access.mjs');
const codes=await import('../netlify/functions/lib/codes.mjs');
const {guarded}=await import('../netlify/functions/lib/guard-relay.mjs');
const {default:membership}=await import('../netlify/functions/membership.mjs');
const {default:dashboard}=await import('../netlify/functions/dashboard.mjs');
const {withCheckoutLock}=await import('../netlify/functions/lib/checkout-lock.mjs');
const user={id:'member1',email:'tester@example.com',confirmedAt:'2026-01-01',roles:[],userMetadata:{roles:['owner'],member:true}};
function session(u=user){globalThis.__membershipTest.session=u;globalThis.__membershipTest.user=u;}
const request=(body,origin='https://bank.test')=>new Request('https://bank.test/api/membership',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});

test('signed-out requests cannot reach dashboard or legacy data handler',async()=>{
 session(null);let calls=0;const res=await guarded(async()=>{calls++;return {statusCode:200,body:'secret'};})(new Request('https://bank.test/api/data'));
 assert.equal(res.status,401);assert.equal(calls,0);
 const page=await dashboard(new Request('https://bank.test/dashboard'));assert.equal(page.status,303);assert.match(page.headers.get('location'),/membership=required/);
});
test('self-service profile fields and stale token roles cannot elevate to owner or member',async()=>{
 session({...user,roles:['owner']});globalThis.__membershipTest.user=user;
 await assert.rejects(access.owner(),{status:403});await assert.rejects(access.member(),{status:403});
 const r=await membership(request({action:'issue',email:'x@example.com'}));assert.equal(r.status,403);
});
test('code is bound to email, single identity, absolute expiry, and revocation',async()=>{
 const issued=await codes.issueCode(db,{id:'owner1'},{email:user.email,days:1});
 assert.equal(JSON.stringify([...db.rows]).includes(issued.code),false,'store must not retain plaintext codes');
 await assert.rejects(codes.redeemCode(db,{...user,email:'other@example.com'},issued.code),{status:403});
 await codes.redeemCode(db,user,issued.code);
 assert.equal((await access.freeEntitlement(db,user)).active,true);
 const repeat=await codes.redeemCode(db,user,issued.code,Date.now()+1000);assert.equal(repeat.expiresAt,issued.accessUntil);
 await assert.rejects(codes.redeemCode(db,{...user,id:'another-id'},issued.code),{status:403});
 assert.equal(await access.freeEntitlement(db,user,issued.accessUntil+1),null);
 await codes.revokeCode(db,issued.codeHash);assert.equal(await access.freeEntitlement(db,user),null);
 await assert.rejects(codes.redeemCode(db,user,issued.code),{status:403});
});
test('concurrent redemption cannot consume a code twice',async()=>{
 const issued=await codes.issueCode(db,{id:'owner1'},{email:user.email});
 const results=await Promise.allSettled([codes.redeemCode(db,user,issued.code),codes.redeemCode(db,{...user,id:'member2'},issued.code)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('unconfirmed emails and cross-origin mutations are rejected',async()=>{
 session({...user,confirmedAt:null});assert.equal((await membership(request({action:'redeem',code:'x'}))).status,403);
 session({...user,roles:['owner']});assert.equal((await membership(request({action:'issue',email:'x@example.com'},'https://attacker.test'))).status,403);
});
test('parallel Checkout attempts are serialized and lock is released after errors',async()=>{
 let release;const pending=new Promise(r=>release=r);
 const first=withCheckoutLock(db,'checkout-user',async()=>{await pending;return 'one';});
 await new Promise(r=>setImmediate(r));
 await assert.rejects(withCheckoutLock(db,'checkout-user',async()=> 'two'),{status:409});
 release();assert.equal(await first,'one');
 await assert.rejects(withCheckoutLock(db,'checkout-user',async()=>{throw Error('upstream failed');}),/upstream failed/);
 assert.equal(await withCheckoutLock(db,'checkout-user',async()=> 'retry'),'retry');
});
test('owner can issue and revoke; member receives private no-store data only after grant',async()=>{
 session({...user,roles:['owner']});let r=await membership(request({action:'issue',email:user.email,days:3}));assert.equal(r.status,200);const d=await r.json();
 session(user);await codes.redeemCode(db,user,d.code);let calls=0;
 const handler=guarded(async()=>{calls++;return {statusCode:200,headers:{'Access-Control-Allow-Origin':'*'},body:'secret'};});
 r=await handler(new Request('https://bank.test/api/data'));assert.equal(r.status,200);assert.equal(calls,1);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);assert.equal(r.headers.get('Cache-Control'),'private, no-store');
 await codes.revokeCode(db,d.codeHash);r=await handler(new Request('https://bank.test/api/data'));assert.equal(r.status,403);assert.equal(calls,1);
});
test('public output contains no dashboard HTML or server source',async()=>{
 const publicFiles=await readdir('dist');assert.deepEqual(publicFiles.sort(),['account-client.js','dashboard-session.js','learning-lab.js','account.css','index.html','kaibot.js','premium.css','premium.js','terminal-enhancements.js'].sort());
 const html=await readFile('dist/index.html','utf8');assert.doesNotMatch(html,/id="premiumRows"|id="kaiStart"/);
});
