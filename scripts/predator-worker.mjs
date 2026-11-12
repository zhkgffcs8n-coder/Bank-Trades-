import {randomBytes} from 'node:crypto';
import {DEMO_WAKE_KEY,hashDemoWake} from '../src/demo-wake-ticket.mjs';
import {recoverInterruptedDemoWakeAudit,recordDemoWakeAcknowledgment} from '../src/demo-wake-audit.mjs';
import {championSpotEvidence,observeChampion} from '../src/champion-live-shadow.mjs';
import {observeVoltHorizons,forecastVoltHorizons,voltV18Horizons,predatorEarlyHorizons,forecastPredatorEarly} from '../src/volt-horizons.mjs';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import WebSocket from 'ws';
import {predatorStreamCredentials} from './predator-stream-credentials.mjs';
import {getStore} from '@netlify/blobs';
import {checkKalshiProductionReads} from './kalshi-production-readiness.mjs';
import {readSanitizedDemoProbe} from '../src/kaibot-demo-probe-telemetry.mjs';
import {kalshiClient,signedHeaders} from '../netlify/functions/lib/kalshi-execution-client.mjs';
import {openPredatorTape} from '../src/predator-stream.mjs';
import {createKalshiDepth} from '../src/kalshi-depth-stream.mjs';
import {parseDepthV8} from '../src/scalper-v8.mjs';
import {verifiedFinalizedBinaryOutcome} from '../src/official-settlement.mjs';
import {predatorObservation,openPredatorWatch,advancePredatorWatch,confirmPredatorEntry,predatorEarlyProbe} from '../src/btc-predator.mjs';

const env=process.env,dir=env.PREDATOR_STATE_DIR;
if(!dir)throw Error('PREDATOR_STATE_DIR must point to a persistent writable directory');
await mkdir(dir,{recursive:true});
const path=join(dir,'state.json');
let state={positions:{},rounds:{},closed:[],rejections:{},totalClosed:0};
let tape,ws,lastDepthAt=0,stopping=false,market,book,bookSource,gaps=0,nextConnect=0,lastPersist=0,dirty=false;
const startedAt=Date.now();
const base='https://external-api.kalshi.com';
if(Boolean(env.PREDATOR_NETLIFY_SITE_ID)!==Boolean(env.PREDATOR_NETLIFY_TOKEN))
 throw Error('PREDATOR_NETLIFY_SITE_ID and PREDATOR_NETLIFY_TOKEN must be configured together');
const credentials=await predatorStreamCredentials(env);
const productionReadClient=credentials?kalshiClient(credentials):null;
let productionReads=null,nextProductionRead=0;
let demoProbeReceipt=null,nextDemoProbeRead=0;
function sampleProductionReads(now){
 if(!productionReadClient||now<nextProductionRead)return;
 nextProductionRead=now+300000;
 void checkKalshiProductionReads(productionReadClient).then(result=>{productionReads=result;});
}
const remote=env.PREDATOR_NETLIFY_SITE_ID&&env.PREDATOR_NETLIFY_TOKEN?
 getStore({name:'bank-trades-market-history',siteID:env.PREDATOR_NETLIFY_SITE_ID,token:env.PREDATOR_NETLIFY_TOKEN,
  fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(4000)})}):null;
const demoProbeStore=remote?getStore({name:'bank-trades-kalshi-demo',siteID:env.PREDATOR_NETLIFY_SITE_ID,
 token:env.PREDATOR_NETLIFY_TOKEN,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(4000)})}):null;
function sampleDemoProbeReceipt(now){
 if(!demoProbeStore||now<nextDemoProbeRead)return;
 nextDemoProbeRead=now+300000;
 void readSanitizedDemoProbe(demoProbeStore).then(receipt=>{demoProbeReceipt=receipt;});
}
let previousEarlyBook=null;
const demoWakeQueue=[];
let demoWakeInFlight=false;
function dispatchDemoWake(){
 if(demoWakeInFlight||!demoWakeQueue.length)return;
 const {event,worker}=demoWakeQueue.shift();
 const now=Date.now();
 if(now-event.signalAt>10000){event.status='EXPIRED_BEFORE_SEND';event.completedAt=now;dirty=true;return;}
 event.status='SENDING';
 event.sentAt=now;
 dirty=true;
 demoWakeInFlight=true;
 void wakeDemo(worker).then(response=>{recordDemoWakeAcknowledgment(event,response);},error=>{
  event.status=/^DEMO_WAKE_HTTP_[0-9]{3}$/.test(error?.message)?error.message:'TRANSPORT';
 }).finally(()=>{
  event.completedAt=Date.now();
  dirty=true;
  demoWakeInFlight=false;
 });
}
async function wakeDemo(worker){
 const token=randomBytes(32).toString('hex');
 await remote.setJSON(DEMO_WAKE_KEY,{hash:hashDemoWake(token),at:worker.championShadow.at,worker:{feeds:{kalshiAuthenticated:worker.feeds.kalshiAuthenticated},championShadow:worker.championShadow}});
 const response=await fetch('https://neon-gecko-046bff.netlify.app/.netlify/functions/kalshi-demo-wake',{
  method:'POST',headers:{'x-demo-wake':token},signal:AbortSignal.timeout(20000),redirect:'error'
 });
 if(!response.ok)throw Error('DEMO_WAKE_HTTP_'+response.status);
  return response;
}
let championEvidence=null,championDecision=null,nextChampionSample=0,nextChampionCandles=0;
function sampleChampion(now){
 if(now>=nextChampionCandles){
  nextChampionCandles=now+30000;
  const end=Math.floor(now/60000)*60000;
  const query=new URLSearchParams({granularity:'60',start:new Date(end-180*60000).toISOString(),end:new Date(end).toISOString()});
  fetch('https://api.exchange.coinbase.com/products/BTC-USD/candles?'+query,{signal:AbortSignal.timeout(5000)})
   .then(response=>response.ok?response.json():null)
   .then(rows=>{
    const candles=rows.filter(row=>Array.isArray(row)&&row.length>=6&&row.slice(0,6).every(Number.isFinite)&&row[0]*1000<end)
     .map(([t,low,high,open,close,volume])=>({t,low,high,open,close,volume}));
    championEvidence=championSpotEvidence({asset:'BTC',fetched_at:new Date().toISOString(),candles});
   }).catch(()=>{championEvidence=null;});
 }
 if(now<nextChampionSample)return;
 nextChampionSample=now+5000;
 const observation=observeChampion({market,book,bookSource,evidence:championEvidence,previous:state.championReference,now});
 // BUY exists for only the first sample of a round. Publish actionable
 // transitions immediately so a routine heartbeat cannot replace them with HOLD.
 if(observation&&/^(BUY|TAKE PROFIT|SELL FAST|TIME EXIT|EXIT) (UP|DOWN)$/.test(observation.action)&&
  (observation.action!==championDecision?.action||observation.ticker!==championDecision?.ticker)&&
  !state.demoWakeAudit?.some(event=>event.ticker===observation.ticker&&event.action===observation.action)){
  lastPublish=0;
  const event={ticker:observation.ticker,action:observation.action,signalAt:observation.at,
   bookAt:observation.bookAt,status:'QUEUED'};
  state.demoWakeAudit=[...(state.demoWakeAudit||[]),event].slice(-32);
  if(remote)demoWakeQueue.push({event,worker:{feeds:{kalshiAuthenticated:true},championShadow:observation}});
  else event.status='PUBLISHING_UNCONFIGURED';
  dirty=true;
 }
 championDecision=observation;
 if(observation?.position&&JSON.stringify(observation.position)!==JSON.stringify(state.championReference)){
  state.championReference=observation.position;
  dirty=true;
 }
}
let latest=null,lastPublish=0,publishError=false,nextDiscovery=0,nextRest=0,nextSettlement=0;
const counters={events:0,evaluations:0,websocketAttempts:0,restSamples:0,settlementErrors:0,depthTimeouts:0,heartbeatFailures:0};
async function persist(){
 dirty=false;
 await writeFile(path+'.tmp',JSON.stringify(state),{mode:0o600});
 await rename(path+'.tmp',path);
 lastPersist=Date.now();
}
const reject=reason=>{
 latest={...latest,reason};
 state.rejections[reason]=(state.rejections[reason]||0)+1;dirty=true;
};
async function get(endpoint){
 const response=await fetch(base+'/trade-api/v2'+endpoint,{signal:AbortSignal.timeout(2500)});
 if(!response.ok)throw Error('KALSHI_HTTP_'+response.status);
 return response.json();
}
function connect(){
 if(!credentials||!market||ws||Date.now()<nextConnect)return;
 const ticker=market.ticker,depth=createKalshiDepth(ticker);
 nextConnect=Date.now()+3000;
 counters.websocketAttempts++;
 const socket=new WebSocket('wss://external-api-ws.kalshi.com/trade-api/ws/v2',{
  headers:signedHeaders(credentials,'GET','/trade-api/ws/v2'),handshakeTimeout:5000
 });
 ws=socket;
 lastDepthAt=Date.now();
 socket.on('open',()=>socket.send(JSON.stringify({id:1,cmd:'subscribe',params:{channels:['orderbook_delta'],market_ticker:ticker}})));
 socket.on('message',bytes=>{
  if(socket!==ws||market?.ticker!==ticker)return;
  try{
   const frame=JSON.parse(bytes);
   if(frame.type==='error'){socket.terminate();return;}
   const update=depth.apply(frame,Date.now());
   if(update.status==='GAP'){gaps++;book=null;socket.terminate();return;}
   if(update.status==='INVALID_BOOK'){lastDepthAt=Date.now();book=null;return;}
   if(update.status==='READY'){
    lastDepthAt=update.receivedAt;
    book=update;bookSource='KALSHI_WS';counters.events++;
    evaluate(tape.snapshot().tape,'KALSHI_WS',update.receivedAt);
   }
  }catch{book=null;socket.terminate();}
 });
 socket.on('error',()=>{});
 socket.on('close',()=>{
  if(ws===socket){ws=null;if(bookSource==='KALSHI_WS')book=null;}
 });
}
async function discover(now){
 const data=await get('/markets?series_ticker=KXBTC15M&status=open&limit=20');
 const selected=(data.markets||[]).filter(row=>row.ticker?.startsWith('KXBTC15M-')&&
  Date.parse(row.close_time)>now&&Date.parse(row.close_time)-now<=900000)
  .sort((a,b)=>Date.parse(a.close_time)-Date.parse(b.close_time))[0];
 if(selected?.ticker!==market?.ticker){ws?.terminate();ws=null;book=null;}
 market=selected;
 if(market&&!state.rounds[market.ticker]){
  state.rounds[market.ticker]={firstSeenAt:now,expiresAt:Date.parse(market.close_time)};
  dirty=true;
 }
}
function closePosition(position,result){
 state.closed.push(result);state.totalClosed++;
 delete state.positions[position.ticker];dirty=true;
}
async function settle(now){
 for(const position of Object.values(state.positions)){
  if(now<position.expiresAt)continue;
  try{
   const result=verifiedFinalizedBinaryOutcome((await get('/markets/'+encodeURIComponent(position.ticker))).market,position.ticker);
   if(!result)continue;
   const payout=(position.side==='UP')===(result==='yes')?1:0;
   const entryCost=Math.ceil(7*position.ask*(1-position.ask))/100+.01;
   closePosition(position,{...position,bid:null,payout,reason:'OFFICIAL_SETTLEMENT',closedAt:now,net:payout-position.ask-entryCost});
  }catch{counters.settlementErrors++;}
 }
}
function evaluate(trades,trigger,receivedAt){
 if(!market||stopping)return;
 const started=performance.now();
 const decisionAt=Date.now(),event=trades.at(-1);
 try{
   counters.evaluations++;
   const expiresAt=Date.parse(market.close_time);
   latest={ticker:market.ticker,decisionAt,bookSource,coinbaseAgeMs:event?decisionAt-event.time:null,
    kalshiEventAgeMs:Number.isFinite(book?.eventAt)?decisionAt-book.eventAt:null};
   const observation=book?.ticker===market.ticker&&
    (!Number.isFinite(book.eventAt)||decisionAt-book.eventAt>=0&&decisionAt-book.eventAt<=4000)?
    predatorObservation({ticker:market.ticker,now:decisionAt,bookAt:book.receivedAt,
     remaining:(expiresAt-decisionAt)/1000,yes:book.yes,no:book.no,trades,monitoring:Number.isFinite(state.positions[market.ticker]?.warningMs)}):null;
   latest.quoteFresh=Boolean(observation&&decisionAt-observation.bookAt<=1500);
   const round=state.rounds[market.ticker];
   if(round&&!round.voltV18Profile){round.voltV18Profile=structuredClone(state.voltV18Cells);dirty=true;}
   if(round&&observation&&bookSource==='KALSHI_WS'){
    if(!round.predatorEarlyProfile){round.predatorEarlyProfile=structuredClone(state.predatorEarlyCells);dirty=true;}
    const probes=round.predatorEarlyProbes??={};
    for(const entry of Object.values(probes)){
     if(observeVoltHorizons({voltV16Probe:entry},state.predatorEarlyCells,observation,predatorEarlyHorizons))dirty=true;
    }
    const probe=predatorEarlyProbe(observation,previousEarlyBook);
    if(probe&&!probes[probe.side]){
     probes[probe.side]=probe;dirty=true;
    }
    if(observation.bookAt!==previousEarlyBook?.bookAt||observation.ticker!==previousEarlyBook?.ticker)
     previousEarlyBook={ticker:observation.ticker,bookAt:observation.bookAt,spread:1-observation.yes.price-observation.no.price};
    latest.earlyResearch=Object.values(probes).map(entry=>({side:entry.side,ask:entry.ask,at:entry.at,reason:entry.reason,
     horizons:forecastPredatorEarly(round.predatorEarlyProfile,entry,observation.remaining)}));
   }
   const position=state.positions[market.ticker];
   if(round&&observation&&observeVoltHorizons({voltV16Probe:round.voltV18Probe},state.voltV18Cells,observation,voltV18Horizons))dirty=true;
   if(round?.v15Filled&&!position&&state.closed.at(-1)?.ticker===market.ticker)latest.position=state.closed.at(-1);
   if(position){
    latest.position=position;
    if(observation&&decisionAt-observation.bookAt<=1500){
     const next=advancePredatorWatch(position,observation);
     if(next.closedAt&&next.reason!=='UNSCORED_GAP'){
      closePosition(position,next);latest.position=next;lastPublish=0;
     }else if(!next.closedAt){
      state.positions[market.ticker]=next;latest.position=next;dirty=true;
     }
    }
   }else if(!observation)reject('STALE_OR_INVALID_BOOK');
   else if(!observation.sourceEventAt)reject('INSUFFICIENT_OR_STALE_TAPE');
   else if(round&&!round.v15Filled){
    if(round.v15Watch&&decisionAt-round.v15Watch.at>10000){
     round.v15Expired=(round.v15Expired||0)+1;
     delete round.v15Watch;dirty=true;
    }
    const candidate=decisionAt-observation.bookAt<=1500 &&
     confirmPredatorEntry(round.v15Watch,observation);
    if(candidate){
     latest.horizons=forecastVoltHorizons(round.voltV18Profile,candidate,observation.remaining,voltV18Horizons);
     if(!round.voltV18Probe){
      round.voltV18Probe={ticker:candidate.ticker,side:candidate.side,at:candidate.at,ask:candidate.ask,scored:{}};
      dirty=true;
     }
    }
    const forecast=latest.horizons?.filter(row=>row.qualified).sort((a,b)=>b.rank-a.rank)[0];
    if(candidate&&forecast&&env.PREDATOR_ENABLE_EXPERIMENTAL_PAPER==='true'){
     const bid=(candidate.side==='UP'?observation.yes:observation.no).price;
     state.positions[market.ticker]={...candidate,version:16,strategyVersion:18,quantity:1,forecast,target:forecast.bid,deadline:candidate.at+forecast.seconds*1000,expiresAt,bid,
      net:bid-candidate.ask-candidate.entryCost-(Math.ceil(7*bid*(1-bid))/100+.01)};
     round.v15Filled=true;
     latest.position=state.positions[market.ticker];
     latest.reason='VOLT_PAPER_FILL';lastPublish=0;
     dirty=true;
    }else{
     if(!round.v15Watch&&observation.early){
      const watch=openPredatorWatch(observation);
      if(watch){round.v15Watch=watch;lastPublish=0;dirty=true;}
     }
     latest.watch=round.v15Watch??null;
     if(latest.watch)latest.reason='VOLT_WATCH';
     else reject('NO_QUALIFIED_EARLY_WATCH');
    }
   }
 }finally{
  latest.trigger=trigger;
  latest.quoteAgeMs=book?decisionAt-book.receivedAt:null;
  latest.receiveToDecisionMs=Date.now()-receivedAt;
  latest.computeUs=Math.round((performance.now()-started)*1000);
 }
}
async function run(){
 try{state=JSON.parse(await readFile(path,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;}
 if(recoverInterruptedDemoWakeAudit(state))dirty=true;
 state.voltV18Cells??={};
 state.predatorEarlyCells??={};
 tape=openPredatorTape({onTrades:(trades,at)=>evaluate(trades,'COINBASE_WS',at)});
 while(!stopping){
  const now=Date.now();
  tape.snapshot();
  if(now>=nextDiscovery||market&&Date.parse(market.close_time)<=now){
   nextDiscovery=now+5000;
   try{await discover(now)}catch{reject('DISCOVERY_FAILED');}
  }
  if(ws?.readyState===WebSocket.OPEN&&Date.now()-lastDepthAt>10000){
   counters.depthTimeouts++;
   book=null;
   ws.terminate();
  }
  connect();
  if(market&&(!book||now-book.receivedAt>2500)&&now>=nextRest){
   nextRest=now+2500;
   try{
    const depth=parseDepthV8(await get('/markets/'+encodeURIComponent(market.ticker)+'/orderbook?depth=1'),market.ticker,Date.now());
    if(depth&&(!book||Date.now()-book.receivedAt>2500)){
     book={...depth,receivedAt:depth.at,eventAt:null};bookSource='KALSHI_REST';counters.restSamples++;
     evaluate(tape.snapshot().tape,'KALSHI_REST',depth.at);
    }
   }catch{reject('REST_DEPTH_FAILED');}
  }
  sampleChampion(Date.now());
  dispatchDemoWake();
  sampleProductionReads(now);
  sampleDemoProbeReceipt(now);
  if(now>=nextSettlement){nextSettlement=now+15000;await settle(now);}
  if(dirty&&(lastPublish===0||now-lastPersist>=3000))await persist();
  if(now-lastPublish>=(latest?.position&&!latest.position.closedAt?2000:15000)){
   lastPublish=now;
   const health={version:16,
    feeds:{coinbase:tape.snapshot().connectedAt!==null,
     kalshiAuthenticated:bookSource==='KALSHI_WS'&&!!book&&Date.now()-book.receivedAt<=1500,
     kalshiCredentialsConfigured:!!credentials,heartbeatPublishingConfigured:!!remote},
    mode:'ALWAYS_ON_WORKER',startedAt,at:Date.now(),latest,counters,gaps,publishError,championShadow:championDecision,demoWakeAudit:state.demoWakeAudit||[],productionReads,demoProbeReceipt,
    strategyVersion:18,earlyResearchMode:'SHADOW_ONLY',earlyResearchCells:state.predatorEarlyCells,horizonResearch:state.voltV18Cells,
    voltV15:state.closed.filter(row=>row.version!==16&&Number.isFinite(row.warningMs)).reduce((stats,row)=>{
     stats.trades++;stats.wins+=Number(row.net>0);stats.losses+=Number(row.net<0);
     stats.net+=row.net;stats.warningMs+=row.warningMs;stats.entryTotal+=row.ask;
     stats.fees+=row.entryCost+(row.reason==='OFFICIAL_SETTLEMENT'?0:Math.ceil(7*row.bid*(1-row.bid))/100+.01);
     stats.peak=Math.max(stats.peak,stats.net);
     stats.drawdown=Math.max(stats.drawdown,stats.peak-stats.net);
     return stats;
    },{trades:0,wins:0,losses:0,net:0,warningMs:0,entryTotal:0,fees:0,peak:0,drawdown:0}),
    voltV16:state.closed.filter(row=>row.version===16&&row.strategyVersion!==18).reduce((stats,row)=>{
     stats.trades++;stats.wins+=Number(row.net>.01);stats.losses+=Number(row.net<.01);
     stats.net+=row.net-.01;
     stats.holdMs+=row.closedAt-row.at;
     stats.peak=Math.max(stats.peak,stats.net);
     stats.drawdown=Math.max(stats.drawdown,stats.peak-stats.net);
     return stats;
    },{trades:0,wins:0,losses:0,net:0,holdMs:0,peak:0,drawdown:0}),
    voltV18:state.closed.filter(row=>row.strategyVersion===18).reduce((stats,row)=>{
     stats.trades++;stats.wins+=Number(row.net>.01);stats.losses+=Number(row.net<.01);
     stats.net+=row.net-.01;
     stats.holdMs+=row.closedAt-row.at;
     stats.peak=Math.max(stats.peak,stats.net);
     stats.drawdown=Math.max(stats.drawdown,stats.peak-stats.net);
     return stats;
    },{trades:0,wins:0,losses:0,net:0,holdMs:0,peak:0,drawdown:0}),
    paperEnabled:env.PREDATOR_ENABLE_EXPERIMENTAL_PAPER==='true',ordersAuthorized:false,
    open:Object.keys(state.positions).length,closed:state.totalClosed,
    wins:state.closed.filter(row=>row.net>0).length,losses:state.closed.filter(row=>row.net<0).length,
    net:state.closed.reduce((sum,row)=>sum+row.net,0),rejections:state.rejections};
   console.log(JSON.stringify(health));
   if(remote)try{await remote.setJSON('predator-v13/health',health);publishError=false;
   }catch(error){
    publishError=true;counters.heartbeatFailures++;
    console.error(JSON.stringify({event:'PREDATOR_HEARTBEAT_WRITE_FAILED',errorType:error?.name??'Error'}));
   }
  }
  await new Promise(resolve=>setTimeout(resolve,100));
 }
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
try{await run();}
finally{
 tape?.close();ws?.terminate();
 if(dirty)await persist();
}
