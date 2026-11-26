import {getStore} from '@netlify/blobs';
import {admin} from '@netlify/identity';
import {liveRepository} from './live-state.mjs';
import {openKalshiCredentials} from './kalshi-credential-envelope.mjs';
import {kalshiClient} from './kalshi-execution-client.mjs';
import {liveBuildCommit} from './kalshi-release-gate.mjs';
import {runLiveCycle} from '../../../src/live-cycle.mjs';
import {parseCollectorPrice,validCollectorQuote} from '../../../src/collector-quote.mjs';
export function parseLiveQuote(m,ticker,at,receivedAt){
 if(m?.ticker!==ticker||m.status!=='active'||receivedAt<at||receivedAt-at>10000)return null;
 const close=Date.parse(m.close_time);
 if(m.close_time!=null&&!Number.isFinite(close))return null;
 const expiresAt=Math.min(...[close,Date.parse(m.expiration_time),Date.parse(m.expected_expiration_time)].filter(Number.isFinite));
 if(!Number.isFinite(expiresAt)||expiresAt<=receivedAt)return null;
 const yesAsk=parseCollectorPrice(m,'yes_ask'),yesBid=parseCollectorPrice(m,'yes_bid');
 const noAsk=parseCollectorPrice(m,'no_ask'),noBid=parseCollectorPrice(m,'no_bid');
 if(!validCollectorQuote({yesAsk,yesBid,noAsk,noBid}))return null;
 return {ticker,at,expiresAt,upAsk:yesAsk*100,upBid:yesBid*100,downAsk:noAsk*100,downBid:noBid*100};
}
export const liveStore=()=>getStore({name:'bank-trades-live-execution-v1',consistency:'strong'});
export async function runtime(userId){
 const user=await admin.getUser(userId);if(!user?.confirmedAt||!user.roles?.includes('owner'))throw Error('OWNER_ACCESS_REQUIRED');
 const db=liveStore(),repo=liveRepository(db,user.id);
 async function client(allowWrites=false){
  const record=await getStore({name:'bank-trades-kalshi-credentials',consistency:'strong'}).get('credentials/'+user.id,{type:'json'});
  if(!record?.envelope)throw Error('KALSHI_CREDENTIALS_NOT_CONNECTED');
  if(record.securityVersion!==2)throw Error('CREDENTIAL_ROTATION_REQUIRED');
  const credentials=openKalshiCredentials({userId:user.id,envelope:record.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
  return kalshiClient(credentials,{allowWrites,allowCancellation:true});
 }
 const live={db,repo,client,async acceptScalperEvent(signal){
  const now=Date.now(),{ticker,side,stage,action,entry,exitBid,at}=signal??{};
  const cross=signal?.source==='cross-coin',source=cross?'cross-coin':'pro-scalper';
  if(typeof ticker!=='string'||!(cross?/^KX(?:BTC|ETH|SOL|XRP|DOGE|BNB|HYPE|ZEC)15M-[A-Z0-9-]{1,48}$/:/^KXBTC15M-[A-Z0-9-]{1,48}$/).test(ticker)||!['up','down'].includes(side)||
   !Number.isFinite(at)||at>now||now-at>10000||!(Number.isFinite(entry)&&entry>0&&entry<100)||
   !(stage==='entry'&&action==='BUY'&&(!cross||entry>=40&&entry<=80)||stage==='exit'&&['TAKE PROFIT','SELL FAST'].includes(action)&&Number.isFinite(exitBid)&&exitBid>0&&exitBid<=100))
   return {status:'REJECTED_INVALID_OR_STALE_SCALPER_EVENT'};
  const session=await repo.acquire();
  try{
   const state=session.state;
   if(!state.enabled||!state.scalperArmedAt||at<state.scalperArmedAt||await repo.stopped())return {status:'LIVE_OFF_OR_EVENT_BEFORE_ARM'};
   if(cross&&state.crossCoinArmed!==true)return {status:'START_REQUIRED_FOR_CROSS_COIN'};
   state.scalperEvents??={};
   const slot=cross?'cross-'+stage:stage;
   const prior=state.scalperEvents[slot];
   if(prior?.ticker===ticker||prior?.at>=at)return {status:'DUPLICATE_OR_OLDER_SCALPER_EVENT'};
   state.scalperEvents[slot]={ticker,source,action:action+' '+side.toUpperCase(),at,receivedAt:now,entryReference:entry,exitReference:exitBid};
   await session.persist(state);
  }finally{await session.release();}
  return live.tick();
 },async tick(){
  const record=await repo.read();
  const armed=record.state.manualArmVersion===1&&record.state.enabled&&!!record.state.scalperArmedAt&&!await repo.stopped();
  const report=async result=>{
   await db.setJSON('heartbeat/'+user.id,{at:Date.now(),result,commit:liveBuildCommit()});
   return result;
  };
  if(!armed&&!record.state.intents.length)return report({status:'STOPPED'});
  let exchange;
  try{exchange=await client(true);}catch(error){
   if(!armed)throw error;
   return report({status:'ARMED_WAITING',reason:/^[A-Z0-9_]+$/.test(error.message)?error.message:'KALSHI_CLIENT_UNAVAILABLE'});
  }
  let intakeStatus='NO_SIGNAL';
  const result=await runLiveCycle({repo,client:exchange,canTrade:state=>state.manualArmVersion===1&&state.enabled&&!!state.scalperArmedAt,
   championMode:true,waitForDependencies:true,signalStatus:()=>intakeStatus,
   signals:async state=>{
    const at=Date.now(),events=Object.values(state.scalperEvents??{}).filter(event=>at>=event.at&&at-event.at<=10000);
    intakeStatus=events.length?'OFFICIAL_SCALPER_EVENT':'WAITING_FOR_FRESH_OFFICIAL_SCALPER_EVENT';
    return events.filter(event=>!event.action.startsWith('BUY ')||!events.some(exit=>
     !exit.action.startsWith('BUY ')&&exit.ticker===event.ticker&&exit.source===event.source));
   },
   quoteFor:async ticker=>{
    const at=Date.now(),data=await exchange.request('GET','/trade-api/v2/markets/'+encodeURIComponent(ticker)),m=data.market;
    return parseLiveQuote(m,ticker,at,Date.now());
   }});
  return report(result);
 }};
 return live;
}
