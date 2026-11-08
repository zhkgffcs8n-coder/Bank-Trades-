import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import WebSocket from 'ws';
import {getStore} from '@netlify/blobs';
import {signedHeaders} from '../netlify/functions/lib/kalshi-execution-client.mjs';
import {openPredatorTape} from '../src/predator-stream.mjs';
import {createKalshiDepth} from '../src/kalshi-depth-stream.mjs';
import {parseDepthV8} from '../src/scalper-v8.mjs';
import {verifiedFinalizedBinaryOutcome} from '../src/official-settlement.mjs';
import {predatorObservation,openPredatorWatch,advancePredatorWatch} from '../src/btc-predator.mjs';

const env=process.env,dir=env.PREDATOR_STATE_DIR;
if(!dir)throw Error('PREDATOR_STATE_DIR must point to a persistent writable directory');
await mkdir(dir,{recursive:true});
const path=join(dir,'state.json');
let state={positions:{},rounds:{},closed:[],rejections:{},totalClosed:0};
let tape,ws,stopping=false,market,book,bookSource,gaps=0,nextConnect=0,lastPersist=0,dirty=false,lastEval=0,lastTapeId;
const startedAt=Date.now();
const base='https://external-api.kalshi.com';
const credentials=env.PREDATOR_KALSHI_KEY_ID&&env.PREDATOR_KALSHI_PRIVATE_KEY_FILE?
 {keyId:env.PREDATOR_KALSHI_KEY_ID,privateKeyPem:await readFile(env.PREDATOR_KALSHI_PRIVATE_KEY_FILE,'utf8')}:null;
const remote=env.PREDATOR_NETLIFY_SITE_ID&&env.PREDATOR_NETLIFY_TOKEN?
 getStore({name:'bank-trades-market-history',siteID:env.PREDATOR_NETLIFY_SITE_ID,token:env.PREDATOR_NETLIFY_TOKEN}):null;
let latest=null,lastPublish=0,publishError=false,nextDiscovery=0,nextRest=0,nextSettlement=0;
const counters={events:0,evaluations:0,websocketAttempts:0,restSamples:0,settlementErrors:0};
async function persist(){
 await writeFile(path+'.tmp',JSON.stringify(state),{mode:0o600});
 await rename(path+'.tmp',path);
 dirty=false;lastPersist=Date.now();
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
 socket.on('open',()=>socket.send(JSON.stringify({id:1,cmd:'subscribe',params:{channels:['orderbook_delta'],market_ticker:ticker}})));
 socket.on('message',bytes=>{
  if(socket!==ws||market?.ticker!==ticker)return;
  try{
   const frame=JSON.parse(bytes);
   if(frame.type==='error'){socket.terminate();return;}
   const update=depth.apply(frame,Date.now());
   if(update.status==='GAP'){gaps++;book=null;socket.terminate();return;}
   if(update.status==='INVALID_BOOK'){book=null;return;}
   if(update.status==='READY'){
    book=update;bookSource='KALSHI_WS';counters.events++;
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
   closePosition(position,{...position,reason:'OFFICIAL_SETTLEMENT',closedAt:now,net:payout-position.ask-entryCost});
  }catch{counters.settlementErrors++;}
 }
}
async function run(){
 try{state=JSON.parse(await readFile(path,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;}
 tape=openPredatorTape();
 while(!stopping){
  const now=Date.now(),spot=tape.snapshot();
  if(now>=nextDiscovery||market&&Date.parse(market.close_time)<=now){
   nextDiscovery=now+5000;
   try{await discover(now)}catch{reject('DISCOVERY_FAILED');}
  }
  connect();
  if(market&&(!book||now-book.receivedAt>2500)&&now>=nextRest){
   nextRest=now+2500;
   try{
    const depth=parseDepthV8(await get('/markets/'+encodeURIComponent(market.ticker)+'/orderbook?depth=1'),market.ticker,Date.now());
    if(depth&&(!book||Date.now()-book.receivedAt>2500)){
     book={...depth,receivedAt:depth.at,eventAt:null};bookSource='KALSHI_REST';counters.restSamples++;
    }
   }catch{reject('REST_DEPTH_FAILED');}
  }
  const decisionAt=Date.now(),event=spot.tape.at(-1);
  if(market&&decisionAt-lastEval>=250&&(event?.id!==lastTapeId||book?.receivedAt>lastEval||decisionAt-lastEval>=1000)){
   lastEval=decisionAt;lastTapeId=event?.id;counters.evaluations++;
   const expiresAt=Date.parse(market.close_time);
   latest={ticker:market.ticker,decisionAt,bookSource,coinbaseAgeMs:event?decisionAt-event.time:null,
    kalshiEventAgeMs:Number.isFinite(book?.eventAt)?decisionAt-book.eventAt:null};
   const observation=book?.ticker===market.ticker&&
    (!Number.isFinite(book.eventAt)||decisionAt-book.eventAt>=0&&decisionAt-book.eventAt<=4000)?
    predatorObservation({ticker:market.ticker,now:decisionAt,bookAt:book.receivedAt,
     remaining:(expiresAt-decisionAt)/1000,yes:book.yes,no:book.no,trades:spot.tape}):null;
   const position=state.positions[market.ticker];
   if(position&&observation){
    const next=advancePredatorWatch(position,observation);
    if(next.closedAt&&next.reason!=='UNSCORED_GAP'){closePosition(position,next);await persist();}
    else if(!next.closedAt){state.positions[market.ticker]=next;dirty=true;}
   }else if(!observation)reject('STALE_OR_INVALID_BOOK');
   else if(!observation.sourceEventAt)reject('INSUFFICIENT_OR_STALE_TAPE');
   else if(!observation.early)reject('NO_EARLY_SETUP');
   else{
    const candidate=openPredatorWatch(observation);
    if(!candidate)reject('NET_EDGE_OR_PRICE_GATE');
    else if(state.rounds[market.ticker]&&!state.rounds[market.ticker].watch){
     state.rounds[market.ticker].watch={...candidate,mode:'EXPERIMENTAL_SHADOW'};
     latest.reason='EXPERIMENTAL_EARLY_WATCH';
     if(env.PREDATOR_ENABLE_EXPERIMENTAL_PAPER==='true'){
      state.positions[market.ticker]={...candidate,expiresAt};
     }
     dirty=true;await persist();
    }
   }
  }
  if(now>=nextSettlement){nextSettlement=now+15000;await settle(now);}
  if(dirty&&now-lastPersist>=3000)await persist();
  if(now-lastPublish>=15000){
   lastPublish=now;
   const health={mode:'ALWAYS_ON_WORKER',startedAt,at:Date.now(),latest,counters,gaps,publishError,
    paperEnabled:env.PREDATOR_ENABLE_EXPERIMENTAL_PAPER==='true',ordersAuthorized:false,
    open:Object.keys(state.positions).length,closed:state.totalClosed,
    wins:state.closed.filter(row=>row.net>0).length,losses:state.closed.filter(row=>row.net<0).length,
    net:state.closed.reduce((sum,row)=>sum+row.net,0),rejections:state.rejections};
   console.log(JSON.stringify(health));
   if(remote)try{await remote.setJSON('predator-v13/health',health);publishError=false;}catch{publishError=true;}
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
