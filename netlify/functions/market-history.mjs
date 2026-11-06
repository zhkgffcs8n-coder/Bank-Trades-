import {sampleTimestampFromKey} from '../../src/sample-archive-key.mjs';
import {mergeRecentMarketHistory} from '../../src/recent-market-history.mjs';
import {trustedStoredFinalizedOutcome} from '../../src/official-settlement.mjs';
import {getStore} from '@netlify/blobs';
const ASSETS=new Set(['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC']);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async req=>{
 if(req.method!=='GET')return json({error:'GET only'},405);
 const u=new URL(req.url),asset=String(u.searchParams.get('asset')||'').toUpperCase();
 if(!ASSETS.has(asset))return json({error:'Invalid asset'},400);
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
 // Keys are chronological; listing only the first page eventually hides new samples.
 // Scan bounded pages and keep the most recent four hours, never the oldest page.
 const cutoff=Date.now()-4*60*60*1000;
 const keys=[];let hasMore=false,pages=0;
 for await(const listed of db.list({prefix:'samples/'+asset+'/',paginate:true})){
  if(pages++===20){hasMore=true;break;}
  keys.push(...listed.blobs.filter(b=>sampleTimestampFromKey(b.key,asset)>=cutoff).map(b=>b.key));
 }
 // A 20-page bounded scan may stop before the newest chronological archive
 // keys. Recover recent samples from the collector's small rolling cache, but
 // explicitly report incomplete four-hour coverage instead of implying it.
 const archiveRecords=await Promise.all(keys.slice(-300).map(key=>db.get(key,{type:'json'})));
 const rolling=await db.get('recent/'+asset,{type:'json'}).catch(()=>[]);
 const {records,recoveredFromRolling,conflictingSampleCount}=mergeRecentMarketHistory(archiveRecords,rolling,asset,cutoff,Date.now());
 const tickers=[...new Set(records.map(x=>x.ticker).filter(Boolean))],outcomes={};
 let unverifiedOutcomeRecords=0;
 for(const ticker of tickers){
  const o=await db.get('outcomes/'+ticker,{type:'json'});
  // Legacy cached labels without strict finality evidence must not appear as
  // official settled outcomes in the public market-history response.
  if(trustedStoredFinalizedOutcome(o,ticker))outcomes[ticker]=o;
  else if(o)unverifiedOutcomeRecords++;
 }
 const omegaVerifiedScores=(await Promise.all(Object.keys(outcomes).map(ticker=>
  db.get('omega/verified-scores/v1/'+ticker,{type:'json'}).catch(()=>null)))).filter(score=>score?.status==='VERIFIED_SHADOW_SCORE');
 // Expose only the most recent contract's independently paired SHADOW record.
 // Historical legacy A/B aggregate stats are not this paired experiment.
 const latest=await db.get('latest/'+asset,{type:'json'});
 const pairedTicker=latest?.ticker;
 const pairedShadow=pairedTicker?(await db.get('paired-shadow/resolved/v1/'+pairedTicker,{type:'json'})||
  await db.get('paired-shadow/pending/v1/'+pairedTicker,{type:'json'})):null;
 const pairedStatus=pairedShadow?'RECORDED':!pairedTicker?'NO_CURRENT_CONTRACT':'AWAITING_QUALIFIED_SNAPSHOT';
 const training=await db.get('training/status',{type:'json'});
 const comparison=await db.get('comparison/report-v1',{type:'json'});
 const adaptiveResearch=await db.get('comparison/research-gate-v1',{type:'json'});
 const mistakeAnalysis=await db.get('comparison/mistake-analysis-v1',{type:'json'});
 const prospectiveEvaluation=await db.get('comparison/prospective-evaluation-v1',{type:'json'});
 const lessonSummary=await db.get('comparison/lesson-summary-v1',{type:'json'});
 const feedTelemetry=await db.get('telemetry/'+asset,{type:'json'});
 return json({omegaVerifiedScores,pairedShadow,pairedStatus,training,comparison,adaptiveResearch,mistakeAnalysis,prospectiveEvaluation,lessonSummary,feedTelemetry,asset,fetched_at:new Date().toISOString(),records,outcomes,unverifiedOutcomeRecords,hasMore,historyIncomplete:hasMore,recentCacheRecovered:recoveredFromRolling,conflictingSampleCount,source:'BANK TRADES scheduled Kalshi public quote archive with official finalized labels when available'});
};