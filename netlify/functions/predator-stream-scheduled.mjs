import {getStore} from '@netlify/blobs';
import {openPredatorTape} from '../../src/predator-stream.mjs';
import {freezePredatorSample,scorePredatorSamples} from '../../src/predator-forward.mjs';
import {parseDepthV8} from '../../src/scalper-v8.mjs';
import {selectEligibleRound} from '../../src/select-eligible-round.mjs';

const base='https://api.elections.kalshi.com/trade-api/v2';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function get(path){
 const response=await fetch(base+path,{signal:AbortSignal.timeout(1800)});
 if(!response.ok)throw Error('KALSHI_HTTP_'+response.status);
 return response.json();
}

export default async()=>{
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
 const startedAt=Date.now(),bucket=Math.floor(startedAt/60000)*60000;
 const health={startedAt,mode:'BOUNDED_STREAM_BURST',samples:0,scored:0,alerts:0,errors:0};
 let tape;
 try{
  const markets=await get('/markets?series_ticker=KXBTC15M&status=open&limit=20');
  const selection=selectEligibleRound((markets.markets||[]).map(m=>({...m,
   _expiry:Date.parse(m.close_time)})).filter(m=>m.ticker?.startsWith('KXBTC15M-')),Date.now());
  if(!selection){health.stage='NO_EXECUTABLE_CONTRACT';return new Response(null,{status:204});}
  const {ticker,_expiry:expiresAt}=selection.market;
  tape=openPredatorTape();
  const previous=[];
  await sleep(4500);
  for(let index=0;index<3&&Date.now()-startedAt<18000;index++){
   let depth=null;
   try{depth=parseDepthV8(await get('/markets/'+encodeURIComponent(ticker)+'/orderbook?depth=1'),ticker,Date.now())}
   catch{health.errors++}
   const state=tape.snapshot(),now=Date.now();
   const computeStarted=performance.now();
   const sample=freezePredatorSample({ticker,now,bookAt:depth?.at,expiresAt,
    remaining:(expiresAt-now)/1000,yes:depth?.yes,no:depth?.no,trades:state.tape});
   const computeMs=performance.now()-computeStarted;
   const observedTrade=state.tape.at(-1);
   health.latest={...sample,feedAgeMs:observedTrade?now-observedTrade.time:null,
    computeMs,websocketAttempts:state.attempts,websocketErrors:state.errors};
   await db.setJSON('predator-v12/samples/'+ticker+'/'+bucket+'/'+index,sample,{onlyIfNew:true});
   health.samples++;health.alerts+=Number(Boolean(sample.early));
   for(const outcome of scorePredatorSamples(previous,sample,[3,6,9],1200)){
    await db.setJSON('predator-v12/results/'+ticker+'/'+outcome.at+'/'+outcome.horizon,outcome,{onlyIfNew:true});
    health.scored++;
   }
   previous.push(sample);
   if(index<2)await sleep(2900);
  }
  health.stage=health.latest?.stage??'NO_SAMPLE';
 }catch(error){health.stage='FAILED';health.error=String(error.message||error).slice(0,120)}
 finally{
  tape?.close();
  await db.setJSON('predator-v12/health',{...health,completedAt:Date.now()});
 }
 return new Response(null,{status:204});
};

export const config={schedule:'* * * * *'};
