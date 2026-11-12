import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {checkDemoConnection,classifyDemoBalanceTransport} from '../netlify/functions/kalshi-demo-check.mjs';

const {privateKey}=generateKeyPairSync('ed25519');
const env={KALSHI_DEMO_KEY_ID:'test-id',KALSHI_DEMO_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};

test('saved Demo balance probe distinguishes a timeout without leaking details or changing status',async()=>{
 const diagnostics={};
 const status=await checkDemoConnection(env,async()=>{
  throw new DOMException('SECRET_PRIVATE_KEY_VALUE','TimeoutError');
 },diagnostics);
 assert.equal(status,'DEMO_TRANSPORT_ERROR');
 assert.deepEqual(diagnostics,{failedPhase:'BALANCE',transportCause:'DEMO_REQUEST_TIMEOUT'});
 assert.doesNotMatch(JSON.stringify(diagnostics),/SECRET_PRIVATE_KEY_VALUE/);
});

test('saved Demo probe classifies invalid JSON and network failure without raw error details',async()=>{
 const invalid={};
 assert.equal(await checkDemoConnection(env,async()=>new Response('SECRET_PRIVATE_KEY_VALUE',{status:200}),invalid),'DEMO_TRANSPORT_ERROR');
 assert.equal(invalid.transportCause,'DEMO_RESPONSE_INVALID_JSON');
 assert.equal(invalid.failedPhase,'BALANCE');
 const network={};
 assert.equal(await checkDemoConnection(env,async()=>{throw new TypeError('SECRET_PRIVATE_KEY_VALUE');},network),'DEMO_TRANSPORT_ERROR');
 assert.equal(network.transportCause,'DEMO_NETWORK_OR_TLS_FAILURE');
 assert.equal(network.failedPhase,'BALANCE');
 assert.doesNotMatch(JSON.stringify({invalid,network}),/SECRET_PRIVATE_KEY_VALUE/);
});

test('HTTP failures retain exact sanitized status and successful balance never claims an error',async()=>{
 const http={};
 assert.equal(await checkDemoConnection(env,async()=>new Response('{}',{status:503}),http),'KALSHI_HTTP_503');
 assert.deepEqual(http,{failedPhase:'BALANCE',httpStatus:503});
 const success={};
 assert.equal(await checkDemoConnection(env,async()=>new Response(JSON.stringify({balance:100}),{status:200}),success),'DEMO_AUTHENTICATED');
 assert.deepEqual(success,{});
 assert.equal(classifyDemoBalanceTransport({name:'UnexpectedError',message:'SECRET_PRIVATE_KEY_VALUE'}),'DEMO_TRANSPORT_UNCLASSIFIED');
});


test('HTTP 401 captures sanitized authentication failure without response content',async()=>{
 const diagnostics={};
 const result=await checkDemoConnection(env,async()=>new Response('SECRET_EXCHANGE_BODY',{status:401}),diagnostics);
 assert.equal(result,'KALSHI_HTTP_401');
 assert.deepEqual(diagnostics,{failedPhase:'BALANCE',httpStatus:401});
 assert.doesNotMatch(JSON.stringify(diagnostics),/SECRET_EXCHANGE_BODY/);
});

test('invalid balance reports fixed failing phase, not raw data',async()=>{
 const diagnostics={};
 const result=await checkDemoConnection(env,async()=>new Response(JSON.stringify({balance:-1,secret:'PRIVATE'}),{status:200}),diagnostics);
 assert.equal(result,'DEMO_INVALID_BALANCE_RESPONSE');
 assert.deepEqual(diagnostics,{failedPhase:'BALANCE'});
});
