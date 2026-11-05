// Public read-only heartbeat: never report a configured schedule as proof of live operation.
import {getStore} from '@netlify/blobs';
export function omegaLiveHealth(heartbeat,nowMs=Date.now()){
 const completed=Date.parse(heartbeat?.completedAt||'');
 const ageSeconds=Number.isFinite(completed)?Math.max(0,Math.floor((nowMs-completed)/1000)):null;
 const sampled=Array.isArray(heartbeat?.sampledAssets)?heartbeat.sampledAssets:[];
 const fresh=ageSeconds!==null&&completed<=nowMs&&ageSeconds<=150;
 const healthy=fresh&&heartbeat?.status==='COMPLETED'&&sampled.length>=8&&heartbeat?.trainingSucceeded===true;
 return {status:healthy?'COLLECTOR_FRESH':'NOT_VERIFIED',collectorStatus:heartbeat?.status||'UNKNOWN',
  collectorAgeSeconds:ageSeconds,sampledAssetCount:sampled.length,sampledAssets:sampled,
  trainingSucceeded:heartbeat?.trainingSucceeded===true,expectedIntervalSeconds:60,
  omegaExternalProvidersRunning:false,omegaLiveResearchRunning:false,realOrdersAuthorized:false,
  notice:'Fresh collector observations do not prove OMEGA external provider integration or verified trading accuracy.'};
}
export default async req=>{
 if(req.method!=='GET')return new Response(JSON.stringify({error:'GET only'}),{status:405,headers:{'content-type':'application/json'}});
 try{
  const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
  const heartbeat=await db.get('collector/heartbeat',{type:'json'});
  return new Response(JSON.stringify(omegaLiveHealth(heartbeat)),{headers:{'content-type':'application/json','cache-control':'no-store'}});
 }catch{
  return new Response(JSON.stringify(omegaLiveHealth(null)),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
};
