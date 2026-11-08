// Pure diagnostic for scheduled market research collection.
// A recent start timestamp is not evidence that a collection completed.
export function assessCollectorHealth(heartbeat,now=Date.now(),expectedAssets=8){
 const completedAt=Number(heartbeat?.completedAt);
 const ageSeconds=Number.isFinite(completedAt)&&completedAt>0&&completedAt<=now
  ?Math.floor((now-completedAt)/1000):null;
 const heartbeatFresh=ageSeconds!==null&&ageSeconds<=180;
 // Count-only heartbeats can claim complete coverage with repeated or
 // substituted markets. Both the dashboard and the KaiBot paper status must
 // verify the actual distinct eight-asset set before reporting health.
 const expected=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
 const sampled=Array.isArray(heartbeat?.sampledAssets)?heartbeat.sampledAssets:[];
 const unique=new Set(sampled);
 const fullCoverage=heartbeat?.status==='COMPLETED'&&
  expectedAssets===expected.length&&sampled.length===expected.length&&
  unique.size===expected.length&&expected.every(asset=>unique.has(asset))&&
  heartbeat?.sampledAssetCount===unique.size&&
  Array.isArray(heartbeat?.failedAssets)&&heartbeat.failedAssets.length===0;
 const trainingSucceeded=heartbeat?.trainingSucceeded===true;
 return {lastCompletedAt:ageSeconds===null?null:completedAt,ageSeconds,
  heartbeatFresh,fullCoverage,trainingSucceeded,
  fresh:heartbeatFresh&&fullCoverage&&trainingSucceeded,
  expectedIntervalSeconds:60,
  note:'A recent heartbeat is not proof of complete quotes, finalized labels, or profitable predictions.'};
}
