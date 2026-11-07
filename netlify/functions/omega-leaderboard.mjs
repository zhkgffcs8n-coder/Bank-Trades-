// Public, read-only verified OMEGA research leaderboard. Never authorizes trading.
import {getStore} from '@netlify/blobs';
import {blobWindow} from '../../src/blob-window.mjs';
import {evaluateResearchChampions,summarizeVerifiedScores,walkForwardChampionAudit} from '../../src/omega-learning.mjs';
export async function omegaLeaderboard(db,{limit=250}={}){
 const page=await blobWindow(db,{prefix:'omega/verified-scores/v1/',limit});
 const records=[];
 for(const entry of page.blobs){
  const record=await db.get(entry.key,{type:'json'});
  if(record?.status==='VERIFIED_SHADOW_SCORE')records.push(record);
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
 return {status:safeSelection.status,observedRecords:records.length,historyTruncated:truncated,
  scores:summarizeVerifiedScores(records),...safeSelection,walkForward:safeForward,selectedForTrading:false,realOrdersAuthorized:false,
  originalPrimalComparison:'NOT_VERIFIED',
  notice:'Verified OMEGA scores only. Truncated history is not eligible for champion selection. No independently paired Original Primal predictions; no outperformance claim.'};
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
