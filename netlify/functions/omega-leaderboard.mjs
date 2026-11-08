// Public, read-only verified OMEGA research leaderboard. Never authorizes trading.
import {getStore} from '@netlify/blobs';
import {blobWindow} from '../../src/blob-window.mjs';
import {evaluateResearchChampions,summarizeVerifiedScores,walkForwardChampionAudit} from '../../src/omega-learning.mjs';
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
  scores:summarizeVerifiedScores(records),...safeSelection,walkForward:safeForward,selectedForTrading:false,realOrdersAuthorized:false,
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
