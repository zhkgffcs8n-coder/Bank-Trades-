// Pure diagnostic for scheduled market research collection.
// A recent start timestamp is not evidence that a collection completed.
export function assessCollectorHealth(heartbeat,now=Date.now(),expectedAssets=8){
 const completedAt=Number(heartbeat?.completedAt);
 const ageSeconds=Number.isFinite(completedAt)&&completedAt>0&&completedAt<=now
  ?Math.floor((now-completedAt)/1000):null;
 const heartbeatFresh=ageSeconds!==null&&ageSeconds<=180;
 const fullCoverage=heartbeat?.status==='COMPLETED'&&
  heartbeat?.sampledAssetCount===expectedAssets&&
  Array.isArray(heartbeat?.failedAssets)&&heartbeat.failedAssets.length===0;
 const trainingSucceeded=heartbeat?.trainingSucceeded===true;
 return {lastCompletedAt:ageSeconds===null?null:completedAt,ageSeconds,
  heartbeatFresh,fullCoverage,trainingSucceeded,
  fresh:heartbeatFresh&&fullCoverage&&trainingSucceeded,
  expectedIntervalSeconds:60,
  note:'A recent heartbeat is not proof of complete quotes, finalized labels, or profitable predictions.'};
}
