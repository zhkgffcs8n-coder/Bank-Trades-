import {scalpEngines} from './scalper-v8.mjs';

const bin=probability=>Math.min(9,Math.floor(probability*10));
export function walkForwardScalperCalibration(rows){
 const ordered=[...rows].sort((a,b)=>a.at-b.at);
 const resolved=[...ordered].sort((a,b)=>a.resolvedAt-b.resolvedAt);
 return Object.fromEntries(scalpEngines.map(name=>{
  const buckets=Array.from({length:10},()=>({n:0,yes:0}));
  let index=0,scored=0,raw=0,calibrated=0,market=0;
  for(const row of ordered){
   while(index<resolved.length&&resolved[index].resolvedAt<row.at){
    const prior=resolved[index++];
    const bucket=buckets[bin(prior.engines[name].probability)];
    bucket.n++;
    bucket.yes+=prior.outcome;
   }
   const p=row.engines[name].probability;
   const bucket=buckets[bin(p)];
   if(bucket.n<10)continue;
   const adjusted=(bucket.yes+20*p)/(bucket.n+20);
   raw+=(p-row.outcome)**2;
   calibrated+=(adjusted-row.outcome)**2;
   market+=(row.baseline-row.outcome)**2;
   scored++;
  }
  return [name,{sampleSize:scored,rawBrier:scored?raw/scored:null,
   calibratedBrier:scored?calibrated/scored:null,marketBrier:scored?market/scored:null}];
 }));
}
