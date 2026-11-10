import {getStore} from '@netlify/blobs';
import {admin} from '@netlify/identity';
import {liveRepository} from './live-state.mjs';
import {openKalshiCredentials} from './kalshi-credential-envelope.mjs';
import {kalshiClient} from './kalshi-execution-client.mjs';
import {releaseStatus} from './kalshi-release-gate.mjs';
import {championExecutionSignals} from '../../../src/champion-kaibot-intake.mjs';
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
 async function client(){
  const record=await getStore({name:'bank-trades-kalshi-credentials',consistency:'strong'}).get('credentials/'+user.id,{type:'json'});
  if(!record?.envelope)throw Error('KALSHI_CREDENTIALS_NOT_CONNECTED');
  if(record.securityVersion!==2)throw Error('CREDENTIAL_ROTATION_REQUIRED');
  const credentials=openKalshiCredentials({userId:user.id,envelope:record.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
  return kalshiClient(credentials,{allowWrites:releaseStatus().canTrade,allowCancellation:true});
 }
 return {db,repo,client,async tick(){
  const record=await repo.read();
  if(!releaseStatus().canTrade&&!record.state.intents.length)return {status:'RELEASE_BLOCKED',...releaseStatus()};
  const exchange=await client();
  const result=await runLiveCycle({repo,client:exchange,canTrade:releaseStatus().canTrade,
   championMode:true,
   signals:async()=>championExecutionSignals(await getStore({name:'bank-trades-market-history',consistency:'strong'})
    .get('predator-v13/health',{type:'json'})),
   quoteFor:async ticker=>{
    const at=Date.now(),data=await exchange.request('GET','/trade-api/v2/markets/'+encodeURIComponent(ticker)),m=data.market;
    return parseLiveQuote(m,ticker,at,Date.now());
   }});
  await db.setJSON('heartbeat/'+user.id,{at:Date.now(),result,commit:process.env.COMMIT_REF||null});return result;
 }};
}
