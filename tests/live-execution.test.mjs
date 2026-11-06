import test from 'node:test';import assert from 'node:assert/strict';
import {qualifiesLiveEntry,initialState,makeOrder,reconcile,exitAction,submitIntent,emergencyStop,releaseFailures,validateLimits} from '../src/live-execution.mjs';
import {releaseStatus} from '../netlify/functions/lib/kalshi-release-gate.mjs';
import {kalshiClient,signedHeaders} from '../netlify/functions/lib/kalshi-execution-client.mjs';
import {generateKeyPairSync,verify,constants} from 'node:crypto';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});const credentials={keyId:'test-key',privateKeyPem:pair.privateKey.export({type:'pkcs8',format:'pem'})};
const snapshot=()=>({complete:true,at:Date.now(),balanceCents:10000,orders:[],fills:[],positions:[]});
test('RSA-PSS signs method and path without query string',()=>{const h=signedHeaders(credentials,'GET','/trade-api/v2/portfolio/orders?cursor=x',123);assert.ok(verify('sha256',Buffer.from('123GET/trade-api/v2/portfolio/orders'),{key:pair.publicKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:constants.RSA_PSS_SALTLEN_DIGEST},Buffer.from(h['KALSHI-ACCESS-SIGNATURE'],'base64')));});
test('all four side/action combinations map to the single YES book',()=>{for(const [side,action,book,price] of [['up','buy','bid','0.6000'],['down','buy','ask','0.4000'],['up','sell','ask','0.6000'],['down','sell','bid','0.4000']]){const o=makeOrder({ticker:'BTC-ROUND',side,action,qty:1,priceCents:60});assert.equal(o.side,book);assert.equal(o.price,price);assert.equal(o.reduce_only,action==='sell');assert.equal(o.time_in_force,'immediate_or_cancel');}});
test('release cannot be enabled by incomplete or absent evidence',()=>{assert.equal(releaseStatus().canTrade,false);assert.ok(releaseStatus().failures.length);assert.equal(releaseFailures({},'commit').length,8);});
test('transport rejects writes by default',async()=>{const client=kalshiClient(credentials,{fetchImpl:()=>{throw Error('unexpected network')}});await assert.rejects(client.create({}),/WRITES_DISABLED/);});
test('pagination visits subsequent pages and rejects loops',async()=>{let n=0;const client=kalshiClient(credentials,{fetchImpl:async()=>({ok:true,json:async()=>({orders:[++n],cursor:n===1?'next':''})})});assert.deepEqual(await client.pages('/trade-api/v2/portfolio/orders','orders'),[1,2]);const looping=kalshiClient(credentials,{fetchImpl:async()=>({ok:true,json:async()=>({orders:[],cursor:'same'})})});await assert.rejects(looping.pages('/trade-api/v2/portfolio/orders','orders'),/CURSOR_LOOP/);});
test('profit, loss and trailing exit triggers use the position entry',()=>{const p={entryCents:50,profitPct:15,stopPct:8};assert.equal(exitAction({...p,bidCents:60}),'TAKE_PROFIT');assert.equal(exitAction({...p,bidCents:45}),'STOP_LOSS');assert.equal(exitAction({...p,bidCents:53,peakCents:57}),'TRAILING_EXIT');assert.equal(exitAction({...p,bidCents:51}),null);});
test('reconciliation rejects unexplained positions and missing fills',()=>{const s=initialState(),snap=snapshot();snap.positions=[{ticker:'BTC-ROUND',position_fp:'1.00'}];assert.throws(()=>reconcile(s,snap),/POSITION_MISMATCH/);s.intents=[{id:'ours',ticker:'BTC-ROUND',status:'UNKNOWN',qty:1,side:'up',action:'buy'}];snap.orders=[{order_id:'one',client_order_id:'ours',ticker:'BTC-ROUND',fill_count_fp:'1.00',status:'executed'}];assert.throws(()=>reconcile(s,snap),/FILL_COUNT_MISMATCH/);snap.fills=[{fill_id:'f',order_id:'one',count_fp:'1.00'}];reconcile(s,snap);assert.equal(s.intents[0].status,'RECONCILED');});
function setup(){const state=initialState();state.enabled=true;state.stopped=false;let writes=0,calls=0;return {state,snapshot:snapshot(),quote:{ticker:'BTC-ROUND',at:Date.now(),expiresAt:Date.now()+120000,upAsk:50,upBid:49},signal:{ticker:'BTC-ROUND',at:Date.now(),action:'BUY UP'},client:{create:async()=>{calls++;return {order_id:'test'}}},persist:async()=>{writes++},checkStopped:async()=>false,stats:()=>({writes,calls})};}
test('spending is reserved durably before an exchange request',async()=>{const x=setup();await submitIntent(x);assert.equal(x.state.intents[0].reserve,60);assert.equal(x.stats().calls,1);assert.equal(x.stats().writes,3);await assert.rejects(submitIntent(x),/UNRESOLVED_ORDER/);assert.equal(x.stats().calls,1);});
test('limits and stop block all exchange requests',async()=>{const x=setup();x.state.limits.orderCents=40;await assert.rejects(submitIntent(x),/SPENDING_LIMIT/);assert.equal(x.stats().calls,0);x.state.limits.orderCents=100;x.checkStopped=async()=>true;await assert.rejects(submitIntent(x),/TRADING_STOPPED/);assert.equal(x.stats().calls,0);assert.throws(()=>validateLimits({}),/INVALID_LIMIT/);});
test('unknown order outcome freezes trading and is not retried',async()=>{const x=setup();let calls=0;x.client.create=async()=>{calls++;throw Error('timeout')};await assert.rejects(submitIntent(x),/OUTCOME_UNKNOWN/);assert.equal(x.state.intents[0].status,'UNKNOWN');await assert.rejects(submitIntent(x),/TRADING_STOPPED/);assert.equal(calls,1);});
test('stop is persisted before cancellation and cancellation failure is visible',async()=>{const state=initialState();state.intents=[{id:'ours'}];let saved=false;const client={snapshot:async()=>({orders:[{order_id:'o',ticker:'BTC-ROUND',client_order_id:'ours',status:'resting'}]}),cancel:async()=>{assert.ok(saved);throw Error('network')}};await assert.rejects(emergencyStop({state,client,persist:async()=>{saved=true}}),/STOPPED_CANCEL_FAILED:o/);assert.equal(state.stopped,true);assert.equal(state.enabled,false);});
test('stop during intent persistence blocks exchange submission',async()=>{
 const x=setup();
 x.checkStopped=async()=>x.state.intents[0]?.status==='SUBMITTING';
 await assert.rejects(submitIntent(x),/STOPPED_BEFORE_SUBMISSION/);
 assert.equal(x.stats().calls,0);
 assert.equal(x.state.intents[0].status,'ABORTED');
});
test('a quote that ages during persistence blocks exchange submission',async()=>{
 const x=setup();
 x.clock=()=>x.quote.at+20000;
 await assert.rejects(submitIntent(x),/STALE_BEFORE_SUBMISSION/);
 assert.equal(x.stats().calls,0);
});
test('Kalshi rate limit retries reads but never order writes',async()=>{
 let calls=0;
 const client=kalshiClient(credentials,{allowWrites:true,fetchImpl:async()=>{
  if(++calls===2)return {ok:true,json:async()=>({balance:100})};
  return {ok:false,status:429,headers:new Headers({'retry-after':'0'})};
 }});
 assert.equal((await client.request('GET','/trade-api/v2/portfolio/balance')).balance,100);
 await assert.rejects(client.create({}),/KALSHI_HTTP_429/);
 assert.equal(calls,3);
});

test('live modes only adjust screening of already qualified entries',()=>{
 const signal={action:'BUY DOWN',score:65,roundAssessment:{entryQualified:true},entryGate:{finalAction:'BUY DOWN'}};
 assert.equal(qualifiesLiveEntry(signal,'easy'),false);
 assert.equal(qualifiesLiveEntry(signal),true);
 assert.equal(qualifiesLiveEntry({...signal,score:55},'balanced'),false);
 assert.equal(qualifiesLiveEntry({...signal,score:55},'extreme'),true);
 assert.equal(qualifiesLiveEntry({...signal,entryGate:{finalAction:'WAIT'}},'extreme'),false);
});
test('demo credentials are used only for a read to the demo host',async()=>{
 const {checkDemoConnection}=await import('../netlify/functions/kalshi-demo-check.mjs');
 const env={KALSHI_DEMO_KEY_ID:credentials.keyId,KALSHI_DEMO_PRIVATE_KEY:credentials.privateKeyPem};
 assert.equal(await checkDemoConnection(env,async(url,options)=>{
  assert.equal(url,'https://external-api.demo.kalshi.co/trade-api/v2/portfolio/balance');
  assert.equal(options.method,'GET');
  return {ok:true,json:async()=>({balance:0})};
 }),'DEMO_AUTHENTICATED');
 assert.equal(await checkDemoConnection({},()=>assert.fail('Unexpected request')),'DEMO_CREDENTIALS_MISSING');
});
