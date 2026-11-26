import {getStore} from '@netlify/blobs';
import {admin} from '@netlify/identity';
import {liveRepository} from './live-state.mjs';
import {openKalshiCredentials} from './kalshi-credential-envelope.mjs';
import {kalshiClient} from './kalshi-execution-client.mjs';
import {liveBuildCommit} from './kalshi-release-gate.mjs';
import {championExecutionSignals,inspectChampionIntake} from '../../../src/champion-kaibot-intake.mjs';
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
 return {db,repo,client,async tick(){
  const record=await repo.read();
  const armed=record.state.manualArmVersion===1&&record.state.enabled&&!await repo.stopped();
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
  const result=await runLiveCycle({repo,client:exchange,canTrade:state=>state.manualArmVersion===1&&state.enabled,
   championMode:true,waitForDependencies:true,signalStatus:()=>intakeStatus,
   signals:async()=>{
    try{
     const worker=await getStore({name:'bank-trades-market-history',consistency:'strong'}).get('predator-v13/health',{type:'json'});
     intakeStatus=inspectChampionIntake(worker).status;
     return championExecutionSignals(worker);
    }catch{intakeStatus='PRO_SCALPER_FEED_UNAVAILABLE';return [];}
   },
   quoteFor:async ticker=>{
    const at=Date.now(),data=await exchange.request('GET','/trade-api/v2/markets/'+encodeURIComponent(ticker)),m=data.market;
    return parseLiveQuote(m,ticker,at,Date.now());
   }});
  return report(result);
 }};
}
