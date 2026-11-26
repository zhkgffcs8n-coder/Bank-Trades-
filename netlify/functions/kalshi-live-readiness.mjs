import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {runtime} from './lib/live-runtime.mjs';
import {liveBuildCommit,releaseStatus} from './lib/kalshi-release-gate.mjs';
export default async req=>{try{
 if(req.method!=='GET')fail(405,'Method not allowed');
 const user=await owner(),live=await runtime(user.id),record=await live.repo.read();
 const heartbeat=await live.db.get('heartbeat/'+user.id,{type:'json'});
 const runner=await live.db.get('runner-status',{type:'json'});
 const release=releaseStatus(),commit=liveBuildCommit();
 const authentication=commit?await live.db.get('release-receipts/'+user.id+'/'+commit+'/authentication',{type:'json'}):null;
 return json({...release,mode:record.state.manualArmVersion===1&&record.state.enabled&&!await live.repo.stopped()?'ARMED':'LIVE OFF',canAcceptApiKeys:/^[a-fA-F0-9]{64}$/.test(process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY||''),
  ownerConfigured:process.env.KALSHI_LIVE_OWNER_ID===user.id,busy:!!record.lock,limits:record.state.limits,
  receipts:{authentication},accountReconciledAt:record.state.lastReconciledAt||null,heartbeat,runner,
  monitoring:{scheduledSeconds:60,foregroundSeconds:5,latencyVerified:false},
  note:'Release checks are informational. Live orders depend on runtime execution checks.'});
}catch(e){return errorResponse(e)}};
