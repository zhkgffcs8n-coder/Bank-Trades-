// Public, read-only verified OMEGA research leaderboard. Never authorizes trading.
import {getStore} from '@netlify/blobs';
import {blobWindow} from '../../src/blob-window.mjs';
import {evaluateResearchChampions,summarizeVerifiedScores,walkForwardChampionAudit} from '../../src/omega-learning.mjs';
function consensusCalibration(records){
 const bins=Array.from({length:5},(_,i)=>({low:50+i*10,high:60+i*10,readings:0,right:0}));
 const rounds=new Map(),conflicts=new Set();
 for(const record of records){
  const scores=record.scores?.filter?.(s=>s?.provider==='omega_consensus')??[];
  const score=scores[0],key=record.marketTicker;
  if(scores.length!==1||typeof score.correct!=='boolean'||!Number.isFinite(score.brier)||score.brier<0||score.brier>1){conflicts.add(key);continue;}
  const confidence=score.correct?1-Math.sqrt(score.brier):Math.sqrt(score.brier);
  if(confidence<.5||confidence>1){conflicts.add(key);continue;}
  if(rounds.has(key)&&(rounds.get(key).confidence!==confidence||rounds.get(key).correct!==score.correct))conflicts.add(key);
  rounds.set(key,{confidence,correct:score.correct});
 }
 for(const [key,{confidence,correct}] of rounds){
  if(conflicts.has(key))continue;
  const bin=bins[Math.min(4,Math.floor((confidence-.5+1e-12)*10))];
  bin.readings++;bin.right+=Number(correct);
 }
 return bins.map(bin=>({...bin,actualRate:bin.readings?bin.right/bin.readings:null}));
}
export async function omegaLeaderboard(db,{limit=250}={}){
 const page=await blobWindow(db,{prefix:'omega/verified-scores/v1/',limit});
 const records=[];
 let excludedUnproven=0;
 for(const entry of page.blobs){
  const record=await db.get(entry.key,{type:'json'});
  // Older or corrupted score records may have official outcomes but no
  // durable evidence of when the forecast was frozen or the contract closed.
  // Do not include them in public Brier scores or champion comparisons.
  const ticker=entry.key.slice('omega/verified-scores/v1/'.length);
  const prefix='omega/predictions/v1/'+ticker+'/';
  const valid=record?.status==='VERIFIED_SHADOW_SCORE'&&
   /^[A-Z0-9-]{3,100}$/.test(ticker)&&
   record.marketTicker===ticker&&record.roundId===ticker&&
   typeof record.forecastKey==='string'&&record.forecastKey.startsWith(prefix)&&
   /^\d+$/.test(record.forecastKey.slice(prefix.length))&&
   Number.isSafeInteger(record.predictedAtMs)&&record.predictedAtMs>0&&
   record.recordedAtMs===record.predictedAtMs&&
   Number.isSafeInteger(record.expiresAtMs)&&record.expiresAtMs>record.predictedAtMs&&
   Number.isSafeInteger(record.settledAtMs)&&record.settledAtMs>=record.expiresAtMs;
  if(valid)records.push(record);
  else excludedUnproven++;
 }
 const truncated=Boolean(page.cursor);
 const selection=evaluateResearchChampions(records);
 const walkForward=walkForwardChampionAudit(records);
 // A bounded lexicographic prefix is NOT a complete chronological sample.
 // Do not identify a champion or claim forward improvement from truncated history.
 const safeSelection=truncated?{...selection,status:'INCOMPLETE_HISTORY',champion:null,
  leaderboard:selection.leaderboard.map(x=>({...x,eligible:false}))}:selection;
 const safeForward=truncated?{...walkForward,status:'INCOMPLETE_HISTORY',beatsMarketBaseline:false,
  selected:[]}:walkForward;
 return {status:safeSelection.status,inspectedRecords:page.blobs.length,observedRecords:records.length,excludedUnproven,historyTruncated:truncated,
  calibration:consensusCalibration(records),scores:summarizeVerifiedScores(records),...safeSelection,walkForward:safeForward,selectedForTrading:false,realOrdersAuthorized:false,
  originalPrimalComparison:'NOT_VERIFIED',
  notice:'Only archived scores with durable pre-expiry freeze chronology are included. Legacy or corrupt records are excluded; truncated history is ineligible for champion selection. Original Primal remains unpaired.'};
}
export default async req=>{
 if(req.method!=='GET')return new Response(JSON.stringify({error:'GET only'}),{status:405,headers:{'content-type':'application/json'}});
 try{
  const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
  const result=await omegaLeaderboard(db);
  return new Response(JSON.stringify(result),{headers:{'content-type':'application/json','cache-control':'no-store'}});
 }catch{
  return new Response(JSON.stringify({status:'UNAVAILABLE',leaderboard:[],realOrdersAuthorized:false}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
};
