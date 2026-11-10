import test from 'node:test';import assert from 'node:assert/strict';
import {liveRepository} from '../netlify/functions/lib/live-state.mjs';
import {initialState,reconcile,submitIntent} from '../src/live-execution.mjs';
import {accountRisk} from '../src/live-accounting.mjs';
import {runLiveCycle} from '../src/live-cycle.mjs';
import {createLiveControl} from '../netlify/functions/kalshi-live-control.mjs';
function database(){const values=new Map();let version=0;return {async get(k){return structuredClone(values.get(k)?.data??null);},async getWithMetadata(k){return structuredClone(values.get(k)||null);},async setJSON(k,v,o={}){const old=values.get(k);if(o.onlyIfNew&&old||o.onlyIfMatch&&o.onlyIfMatch!==old?.etag)return {modified:false};const etag=String(++version);values.set(k,{data:structuredClone(v),etag});return {modified:true,etag};}};}
const id='owner1234';
async function started(){const db=database(),repo=liveRepository(db,id),session=await repo.acquire();session.state.enabled=true;session.state.stopped=false;await session.persist(session.state);await repo.startFence(null);await session.release();return {db,repo};}
function exchange(){let pos=0,balance=1000,orders=[],fills=[],cancelCalls=0;return {async snapshot(){return structuredClone({at:Date.now(),complete:true,balanceCents:balance,orders,fills,positions:pos?[{ticker:'BTC-ROUND',position_fp:pos.toFixed(2)}]:[],settlements:[]});},async create(o){const price=Number(o.price),qty=Number(o.count),isBuy=!o.reduce_only;pos+=o.side==='bid'?qty:-qty;balance+=isBuy?-price*100*qty-1:price*100*qty-1;const oid='order'+orders.length;orders.push({order_id:oid,client_order_id:o.client_order_id,ticker:o.ticker,status:'executed',fill_count_fp:qty.toFixed(2)});fills.push({fill_id:'f'+fills.length,order_id:oid,ticker:o.ticker,count_fp:qty.toFixed(2),yes_price_dollars:o.price,fee_cost:'0.01',created_time:new Date().toISOString()});return {order_id:oid};},async cancel(){cancelCalls++;},count:()=>orders.length,cancels:()=>cancelCalls};}
const quote=bid=>({ticker:'BTC-ROUND',upAsk:bid+1,upBid:bid,downAsk:100-bid,downBid:99-bid,at:Date.now(),expiresAt:Date.now()+120000});
const signals=async()=>[{ticker:'BTC-ROUND',action:'BUY UP',at:Date.now()}];
test('atomic lease allows only one worker and retains crash lock',async()=>{const db=database(),a=liveRepository(db,id),b=liveRepository(db,id);const results=await Promise.allSettled([a.acquire(),b.acquire()]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);await assert.rejects(a.acquire(),/EXECUTION_BUSY/);await results.find(x=>x.status==='fulfilled').value.release();const again=await b.acquire();await again.release();});
test('compare-and-swap start cannot erase a concurrent stop',async()=>{const {repo}=await started();const old=await repo.fence();await repo.stop();await assert.rejects(repo.startFence(old),/STOP_CHANGED/);assert.equal(await repo.stopped(),true);});
test('automatic entry then profit exit uses actual fills and leaves account flat',async()=>{const {repo}=await started(),client=exchange();const result=await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});assert.equal(result.status,'ENTRY_SUBMITTED');const exit=await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(65),canTrade:true});assert.equal(exit.status,'EXIT_SUBMITTED');assert.equal(client.count(),2);assert.deepEqual((await client.snapshot()).positions,[]);const stored=(await repo.read()).state;assert.equal(stored.intents[1].action,'sell');assert.equal(stored.intents[1].status,'RECONCILED');});
test('automatic stop-loss exit fires below actual fill including entry fee',async()=>{const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});const result=await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(40),canTrade:true});assert.equal(result.reason,'STOP_LOSS');assert.equal(accountRisk((await repo.read()).state,await client.snapshot()).dailyLossCents,12);});
test('a concurrent STOP during POST drains the worker and prevents another entry',async()=>{const {repo}=await started(),client=exchange(),create=client.create;client.create=async order=>{await repo.stop();return create(order);};await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});assert.equal((await repo.read()).state.stopped,true);assert.equal(await repo.stopped(),true);await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});assert.equal(client.count(),1);});
test('partial fills reconcile fractional quantities without inventing a full position',()=>{const s=initialState();s.intents=[{id:'i',ticker:'BTC-ROUND',side:'up',action:'buy',qty:1,status:'AWAITING_RECONCILIATION'}];const snap={complete:true,at:Date.now(),balanceCents:100,orders:[{client_order_id:'i',order_id:'o',ticker:'BTC-ROUND',fill_count_fp:'0.50',status:'canceled'}],fills:[{fill_id:'f',order_id:'o',ticker:'BTC-ROUND',count_fp:'0.50',yes_price_dollars:'0.5',fee_cost:'0.01',created_time:new Date().toISOString()}],positions:[{ticker:'BTC-ROUND',position_fp:'0.50'}],settlements:[]};reconcile(s,snap);assert.equal(s.intents[0].filled,.5);assert.equal(accountRisk(s,snap).openCostCents,26);});
test('settlement closes only matching exposure and accounts for loss',async()=>{const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});const state=(await repo.read()).state,snap=await client.snapshot();snap.positions=[];snap.settlements=[{ticker:'BTC-ROUND',market_result:'no',yes_count_fp:'1.00',no_count_fp:'0.00',revenue:0,fee_cost:'0.00',settled_time:new Date().toISOString()}];reconcile(state,snap);const risk=accountRisk(state,snap);assert.equal(risk.open.length,0);assert.equal(risk.dailyLossCents,51);snap.settlements[0].revenue=100;assert.throws(()=>reconcile(state,snap),/CONFLICTING_CACHED_SETTLEMENTS/);});
test('missing fees prevents an invented net P/L',async()=>{const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});const s=(await repo.read()).state,snap=await client.snapshot();delete snap.fills[0].fee_cost;assert.throws(()=>accountRisk(s,snap),/MISSING_FILL_FEES/);});
test('daily loss budget reserves open cost and blocks entry before network',async()=>{const state=initialState();state.enabled=true;state.stopped=false;state.limits.lossCents=50;let called=false;await assert.rejects(submitIntent({state,client:{create:async()=>{called=true}},persist:async()=>{},checkStopped:async()=>false,snapshot:await exchange().snapshot(),signal:(await signals())[0],quote:quote(49)}),/DAILY_LOSS_LIMIT/);assert.equal(called,false);});
test('owner authorization and same-origin checks precede control mutations',async()=>{let runtimeCalls=0;const denied=createLiveControl({getOwner:async()=>{throw Object.assign(Error('Owner access required'),{status:403})},getRuntime:async()=>{runtimeCalls++}});assert.equal((await denied(new Request('https://site.test/control'))).status,403);assert.equal(runtimeCalls,0);const {repo}=await started();const allowed=createLiveControl({getOwner:async()=>({id}),getRuntime:async()=>({repo})});const res=await allowed(new Request('https://site.test/control',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:JSON.stringify({action:'stop'})}));assert.equal(res.status,403);assert.equal(await repo.stopped(),false);});
test('START remains blocked regardless of browser payload',async()=>{const {repo}=await started();const handler=createLiveControl({getOwner:async()=>({id}),getRuntime:async()=>({repo})});const r=await handler(new Request('https://site.test/control',{method:'POST',headers:{origin:'https://site.test','content-type':'application/json'},body:JSON.stringify({action:'start',canTrade:true,checks:{all:true}})}));assert.equal(r.status,409);assert.equal((await r.json()).canTrade,false);});
test('owner ledgers and stop fences are isolated',async()=>{const db=database(),a=liveRepository(db,'owner1234'),b=liveRepository(db,'owner5678');const sa=await a.acquire();sa.state.spent.today=100;await sa.persist(sa.state);await a.stop();assert.deepEqual((await b.read()).state.spent,{});const sb=await b.acquire();await sb.release();await sa.release();});
test('failed durable reservation never calls the exchange',async()=>{const state=initialState();state.enabled=true;state.stopped=false;let called=false;await assert.rejects(submitIntent({state,client:{create:async()=>{called=true}},persist:async()=>{throw Error('STORAGE_FAILED')},checkStopped:async()=>false,snapshot:await exchange().snapshot(),signal:(await signals())[0],quote:quote(49)}),/STORAGE_FAILED/);assert.equal(called,false);});
test('terminal fill evidence survives disappearance from active exchange history',async()=>{const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});const state=(await repo.read()).state,snap=await client.snapshot();snap.orders=[];snap.fills=[];reconcile(state,snap);assert.equal(accountRisk(state,snap).openCostCents,51);});

test('missing exit quote pauses entries without permanently disabling monitoring',async()=>{const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});const result=await runLiveCycle({repo,client,signals,quoteFor:async()=>null,canTrade:true});assert.equal(result.status,'EXIT_QUOTE_UNAVAILABLE');assert.equal(result.retryRequired,true);assert.equal(client.count(),1);assert.equal((await repo.read()).state.enabled,true);assert.equal(await repo.stopped(),false);const recovered=await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(65),canTrade:true});assert.equal(recovered.status,'EXIT_SUBMITTED');assert.equal(client.count(),2);});

test('fractional fills tolerate floating-point addition without hiding material discrepancies',()=>{const make=(reported,position)=>({complete:true,at:Date.now(),balanceCents:100,orders:[{client_order_id:'i',order_id:'o',ticker:'BTC-ROUND',fill_count_fp:String(reported),status:'canceled'}],fills:[{fill_id:'f1',order_id:'o',count_fp:'0.1'},{fill_id:'f2',order_id:'o',count_fp:'0.2'}],positions:[{ticker:'BTC-ROUND',position_fp:String(position)}],settlements:[]});const state=()=>({...initialState(),intents:[{id:'i',ticker:'BTC-ROUND',side:'up',action:'buy',qty:1,status:'AWAITING_RECONCILIATION'}]});assert.doesNotThrow(()=>reconcile(state(),make(.3,.3)));assert.throws(()=>reconcile(state(),make(.31,.3)),/FILL_COUNT_MISMATCH/);assert.throws(()=>reconcile(state(),make(.3,.31)),/POSITION_MISMATCH/);});

test('temporary exchange quote outage does not disable monitoring or open another trade',async()=>{const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});const unavailable=await runLiveCycle({repo,client,signals,quoteFor:async()=>{throw Error('KALSHI_HTTP_503')},canTrade:true});assert.equal(unavailable.status,'EXIT_QUOTE_UNAVAILABLE');assert.equal((await repo.read()).state.enabled,true);assert.equal(client.count(),1);const recovered=await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(65),canTrade:true});assert.equal(recovered.status,'EXIT_SUBMITTED');});
test('quote authentication failures fail closed rather than silently retrying',async()=>{const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});await assert.rejects(runLiveCycle({repo,client,signals,quoteFor:async()=>{throw Error('KALSHI_HTTP_401')},canTrade:true}),/KALSHI_HTTP_401/);assert.equal(await repo.stopped(),true);});

test('invalid exit bid never poisons trailing peak or permits another entry',async()=>{const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});const invalid={...quote(65),upBid:NaN};const r=await runLiveCycle({repo,client,signals,quoteFor:async()=>invalid,canTrade:true});assert.equal(r.status,'EXIT_QUOTE_UNAVAILABLE');assert.equal(client.count(),1);assert.equal((await repo.read()).state.enabled,true);assert.equal((await repo.read()).state.peaks?.['BTC-ROUND'],undefined);const recovered=await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(65),canTrade:true});assert.equal(recovered.status,'EXIT_SUBMITTED');});

test('stale or mismatched exit quote cannot update peaks or submit an order',async()=>{for(const bad of [{...quote(65),ticker:'OTHER-ROUND'},{...quote(65),at:Date.now()-30000}]){const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});const r=await runLiveCycle({repo,client,signals,quoteFor:async()=>bad,canTrade:true});assert.equal(r.status,'EXIT_QUOTE_UNAVAILABLE');assert.equal(client.count(),1);assert.equal((await repo.read()).state.peaks?.['BTC-ROUND'],undefined);}}
);

// Release gating must not be defeated by browser or deployment environment flags.
test('production release gate stays closed without exchange certification',async()=>{const {releaseStatus,RELEASE_BLOCKERS}=await import('../netlify/functions/lib/kalshi-release-gate.mjs');const result=releaseStatus();assert.equal(result.canTrade,false);assert.equal(result.liveOrdersEnabled,false);assert.equal(result.failures.length,7);assert.deepEqual(result.failures,[...RELEASE_BLOCKERS]);});

test('wide spreads block entry but never suppress a reduce-only risk exit',async()=>{
 const {repo}=await started(),client=exchange();
 await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});
 const result=await runLiveCycle({repo,client,signals,quoteFor:async()=>({...quote(30),upAsk:70}),canTrade:true});
 assert.equal(result.reason,'STOP_LOSS');assert.equal(client.count(),2);assert.deepEqual((await client.snapshot()).positions,[]);
});
test('trailing thresholds are configurable and invalid limits are rejected',async()=>{
 const {exitAction,validateLimits}=await import('../src/live-execution.mjs');
 const p={entryCents:50,peakCents:60,bidCents:57,profitPct:50,stopPct:10};
 assert.equal(exitAction({...p,trailPct:4,trailActivationPct:5}),'TRAILING_EXIT');
 assert.equal(exitAction({...p,trailPct:10,trailActivationPct:5}),null);
 assert.throws(()=>validateLimits({...initialState().limits,trailPct:-1}),/INVALID_LIMIT/);
});

test('previously verified fills cannot silently change cost or fee',async()=>{
 const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});
 for(const field of ['fee_cost','yes_price_dollars','created_time']){
  const state=(await repo.read()).state,snap=await client.snapshot();snap.fills[0][field]='changed';
  assert.throws(()=>reconcile(state,snap),/CONFLICTING_CACHED_FILLS/);
 }
});
test('economic evidence tolerates object property ordering but rejects altered terminal orders',async()=>{
 const {repo}=await started(),client=exchange();await runLiveCycle({repo,client,signals,quoteFor:async()=>quote(49),canTrade:true});
 const state=(await repo.read()).state,snap=await client.snapshot();snap.fills[0]=Object.fromEntries(Object.entries(snap.fills[0]).reverse());reconcile(state,snap);
 snap.orders[0].fill_count_fp='0.00';assert.throws(()=>reconcile(state,snap),/CONFLICTING_CACHED_ORDERS/);
});
test('fractional settlement tolerates binary floating point without tolerating wrong exposure',()=>{
 const {settlementFor}=accounting;
 const snapshot={settlements:[{ticker:'BTC-ROUND',yes_count_fp:'0.30',no_count_fp:'0.00',market_result:'yes',revenue:30,settled_time:new Date().toISOString()}]};
 assert.ok(settlementFor(snapshot,'BTC-ROUND',.1+.2));assert.throws(()=>settlementFor(snapshot,'BTC-ROUND',.31),/SETTLEMENT_MISMATCH/);
});
import * as accounting from '../src/live-accounting.mjs';
import {runDemoLifecycle} from '../netlify/functions/lib/kalshi-demo-lifecycle.mjs';
test('demo lifecycle uses real execution reconciliation and never resubmits an ambiguous order',async()=>{
 const db=database(),repo=liveRepository(db,'demo-owner'),client=exchange();let calls=0;
 client.create=async()=>{calls++;throw Error('timeout')};
 const args={repo,client,findMarket:async()=>({ticker:'BTC-ROUND'}),quoteFor:async()=>quote(49),commit:'test'};
 const result=await runDemoLifecycle(args);assert.equal(result.status,'DEMO_LIFECYCLE_FAILED');assert.match(result.error,/OUTCOME_UNKNOWN/);
 await runDemoLifecycle(args);assert.equal(calls,1);
});
test('demo lifecycle requires actual exit fills before reporting a round trip',async()=>{
 const db=database(),repo=liveRepository(db,'demo-owner'),client=exchange();
 const args={repo,client,findMarket:async()=>({ticker:'BTC-ROUND'}),quoteFor:async()=>quote(49),commit:'test'};
 assert.equal((await runDemoLifecycle(args)).status,'DEMO_ENTRY_RECONCILED');
 assert.equal((await runDemoLifecycle(args)).upRoundTripVerified,undefined);
 assert.equal((await runDemoLifecycle(args)).upRoundTripVerified,true);
});

test('live quote parser rejects malformed, stale, and closed books',async()=>{
 const {parseLiveQuote}=await import('../netlify/functions/lib/live-runtime.mjs');
 const at=100000,ticker='BTC-ROUND';
 const market={ticker,status:'active',close_time:new Date(at+20000).toISOString(),yes_ask:50,yes_bid:49,no_ask:51,no_bid:50};
 assert.equal(parseLiveQuote(market,ticker,at,at+100).upBid,49);
 for(const bad of [{yes_bid:null},{yes_bid:''},{yes_bid:false},{yes_bid:70},{close_time:'invalid'}]){
  assert.equal(parseLiveQuote({...market,...bad},ticker,at,at+100),null);
 }
 assert.equal(parseLiveQuote(market,ticker,at,at+10001),null);
 assert.equal(parseLiveQuote({...market,close_time:new Date(at+50).toISOString()},ticker,at,at+100),null);
});

test('champion routing holds confirmed exposure, ignores a wrong-side exit, then closes reduce-only',async()=>{
 const {repo}=await started(),client=exchange();
 let action='BUY UP';
 const championSignals=async()=>[{ticker:'BTC-ROUND',action,at:Date.now(),entryReference:50}];
 const tick=bid=>runLiveCycle({repo,client,signals:championSignals,quoteFor:async()=>quote(bid),canTrade:true,championMode:true});
 assert.equal((await tick(49)).status,'ENTRY_SUBMITTED');
 action='HOLD UP';
 assert.equal((await tick(65)).status,'MONITORING');
 action='SELL FAST DOWN';
 assert.equal((await tick(65)).status,'MONITORING');
 action='TAKE PROFIT UP';
 assert.equal((await tick(65)).status,'EXIT_SUBMITTED');
 assert.equal(client.count(),2);
 assert.deepEqual((await client.snapshot()).positions,[]);
});
