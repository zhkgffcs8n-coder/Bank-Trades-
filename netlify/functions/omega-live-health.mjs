// Public read-only heartbeat: never report a configured schedule as proof of live operation.
import {getStore} from '@netlify/blobs';
export function omegaLiveHealth(heartbeat,nowMs=Date.now(),omegaHeartbeat=null,paperHeartbeat=null){
 const raw=heartbeat?.completedAt;
 const completed=typeof raw==='number'?raw:typeof raw==='string'?Date.parse(raw):NaN;
 const ageSeconds=Number.isFinite(completed)?Math.max(0,Math.floor((nowMs-completed)/1000)):null;
 const sampled=Array.isArray(heartbeat?.sampledAssets)?heartbeat.sampledAssets:[];
 const fresh=ageSeconds!==null&&completed<=nowMs&&ageSeconds<=150;
 const healthy=fresh&&heartbeat?.status==='COMPLETED'&&sampled.length>=8&&heartbeat?.trainingSucceeded===true;
 const omegaAt=Date.parse(omegaHeartbeat?.checkedAt||'');
 const omegaAgeSeconds=Number.isFinite(omegaAt)&&omegaAt<=nowMs?Math.floor((nowMs-omegaAt)/1000):null;
 const omegaRunning=omegaAgeSeconds!==null&&omegaAgeSeconds<=150&&omegaHeartbeat?.status==='SHADOW_RESEARCH';
 return {status:healthy?'COLLECTOR_FRESH':'NOT_VERIFIED',collectorStatus:heartbeat?.status||'UNKNOWN',
  collectorAgeSeconds:ageSeconds,sampledAssetCount:sampled.length,sampledAssets:sampled,
  trainingSucceeded:heartbeat?.trainingSucceeded===true,expectedIntervalSeconds:60,
  omegaExternalProvidersRunning:omegaRunning,omegaLiveResearchRunning:omegaRunning,
  omegaStatus:omegaHeartbeat?.status||'NOT_VERIFIED',omegaAgeSeconds,
  omegaReasons:Array.isArray(omegaHeartbeat?.reasons)?omegaHeartbeat.reasons:[],
  omegaProviderCheckedAt:omegaHeartbeat?.lastProviderCheckAt||null,
  omegaProviderStatus:Array.isArray(omegaHeartbeat?.providerStatus)?omegaHeartbeat.providerStatus.map(x=>({provider:x.provider,status:x.status,...(x.checkedAt?{checkedAt:x.checkedAt}:{}),...(Number.isInteger(x.httpStatus)?{httpStatus:x.httpStatus}:{}),...(x.errorCode?{errorCode:x.errorCode}:{})})):[],
  omegaProvidersConfigured:omegaHeartbeat?.providersConfigured??0,
  omegaPaperMonitoring:Object.fromEntries(['open','exits','holds','settled','unpriced','backfilled'].map(k=>
   [k,Number.isSafeInteger(omegaHeartbeat?.paperMonitoring?.[k])&&omegaHeartbeat.paperMonitoring[k]>=0?
    omegaHeartbeat.paperMonitoring[k]:null])),
  paperLastAction:paperHeartbeat?.action||'NONE_VERIFIED',paperLastActionAtMs:paperHeartbeat?.updatedAtMs??null,
  realOrdersAuthorized:false,
  notice:'Fresh collector observations do not prove OMEGA external provider integration or verified trading accuracy.'};
}
export default async req=>{
 if(req.method!=='GET')return new Response(JSON.stringify({error:'GET only'}),{status:405,headers:{'content-type':'application/json'}});
 try{
  const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
  const [heartbeat,omegaHeartbeat,paperHeartbeat]=await Promise.all([
   db.get('collector/heartbeat',{type:'json'}),db.get('omega/heartbeat',{type:'json'}),db.get('omega/paper/latest',{type:'json'})]);
  return new Response(JSON.stringify(omegaLiveHealth(heartbeat,Date.now(),omegaHeartbeat,paperHeartbeat)),{headers:{'content-type':'application/json','cache-control':'no-store'}});
 }catch{
  return new Response(JSON.stringify(omegaLiveHealth(null)),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
};
