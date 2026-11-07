// Public, read-only verified OMEGA research leaderboard. Never authorizes trading.
import {getStore} from '@netlify/blobs';
import {blobWindow} from '../../src/blob-window.mjs';
import {evaluateResearchChampions,summarizeVerifiedScores} from '../../src/omega-learning.mjs';
export async function omegaLeaderboard(db,{limit=250}={}){
 const page=await blobWindow(db,{prefix:'omega/verified-scores/v1/',limit});
 const records=[];
 for(const entry of page.blobs){
  const record=await db.get(entry.key,{type:'json'});
  if(record?.status==='VERIFIED_SHADOW_SCORE')records.push(record);
 }
 const selection=evaluateResearchChampions(records);
 return {status:selection.status,observedRecords:records.length,historyTruncated:Boolean(page.cursor),
  scores:summarizeVerifiedScores(records),...selection,selectedForTrading:false,realOrdersAuthorized:false,
  originalPrimalComparison:'NOT_VERIFIED',
  notice:'Verified OMEGA scores only. No independent paired Original Primal predictions are available in this report; no outperformance claim.'};
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
