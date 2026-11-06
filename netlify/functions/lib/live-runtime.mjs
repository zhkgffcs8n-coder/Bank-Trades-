import {getStore} from '@netlify/blobs';
import {admin} from '@netlify/identity';
import {liveRepository} from './live-state.mjs';
import {openKalshiCredentials} from './kalshi-credential-envelope.mjs';
import {kalshiClient} from './kalshi-execution-client.mjs';
import {releaseStatus} from './kalshi-release-gate.mjs';
import {runLiveCycle} from '../../../src/live-cycle.mjs';
import sharedSignals from '../shared-signals.mjs';
export const liveStore=()=>getStore({name:'bank-trades-live-execution-v1',consistency:'strong'});
export async function runtime(userId){
 const user=await admin.getUser(userId);if(!user?.confirmedAt||!user.roles?.includes('owner'))throw Error('OWNER_ACCESS_REQUIRED');
 const db=liveStore(),repo=liveRepository(db,user.id);
 async function client(){
  const record=await getStore({name:'bank-trades-kalshi-credentials',consistency:'strong'}).get('credentials/'+user.id,{type:'json'});
  if(!record?.envelope)throw Error('KALSHI_CREDENTIALS_NOT_CONNECTED');
  const credentials=openKalshiCredentials({userId:user.id,envelope:record.envelope,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
  return kalshiClient(credentials,{allowWrites:releaseStatus().canTrade,allowCancellation:true});
 }
 return {db,repo,client,async tick(){
  const record=await repo.read();
  if(!releaseStatus().canTrade&&!record.state.intents.length)return {status:'RELEASE_BLOCKED',...releaseStatus()};
  const exchange=await client();
  const result=await runLiveCycle({repo,client:exchange,canTrade:releaseStatus().canTrade,
   signals:async()=>{const res=await sharedSignals(new Request('https://internal/shared-signals'));if(!res.ok)throw Error('SIGNAL_SERVICE_FAILED');const payload=await res.json();return (payload.results||[]).filter(s=>s.roundAssessment?.entryQualified===true&&s.entryGate?.finalAction===s.action);},
   quoteFor:async ticker=>{
    const at=Date.now(),data=await exchange.request('GET','/trade-api/v2/markets/'+encodeURIComponent(ticker)),m=data.market;
    if(m?.ticker!==ticker||m.status!=='active')return null;
    const price=k=>m[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:Number(m[k]);
    const q={ticker,at,expiresAt:Math.min(...[m.close_time,m.expiration_time,m.expected_expiration_time].filter(Boolean).map(v=>Date.parse(v)).filter(Number.isFinite)),upAsk:price('yes_ask'),upBid:price('yes_bid'),downAsk:price('no_ask'),downBid:price('no_bid')};
    if(!Number.isFinite(q.expiresAt)||![q.upAsk,q.upBid,q.downAsk,q.downBid].every(Number.isFinite))return null;
    return q;
   }});
  await db.setJSON('heartbeat/'+user.id,{at:Date.now(),result,commit:process.env.COMMIT_REF||null});return result;
 }};
}
