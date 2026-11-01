import {sampleTimestampFromKey} from '../../src/sample-archive-key.mjs';
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
 const keys=[];let cursor,hasMore=false;
 for(let page=0;page<20;page++){
  const listed=await db.list({prefix:'samples/'+asset+'/',limit:1000,...(cursor?{cursor}:{})});
  keys.push(...listed.blobs.filter(b=>sampleTimestampFromKey(b.key,asset)>=cutoff).map(b=>b.key));
  cursor=listed.cursor;hasMore=!!cursor;
  if(!cursor)break;
 }
 const records=(await Promise.all(keys.slice(-300).map(key=>db.get(key,{type:'json'})))).filter(x=>x&&x.t>=cutoff).sort((a,b)=>a.t-b.t);
 const tickers=[...new Set(records.map(x=>x.ticker).filter(Boolean))],outcomes={};
 let unverifiedOutcomeRecords=0;
 for(const ticker of tickers){
  const o=await db.get('outcomes/'+ticker,{type:'json'});
  // Legacy cached labels without strict finality evidence must not appear as
  // official settled outcomes in the public market-history response.
  if(trustedStoredFinalizedOutcome(o,ticker))outcomes[ticker]=o;
  else if(o)unverifiedOutcomeRecords++;
 }
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
 return json({pairedShadow,pairedStatus,training,comparison,adaptiveResearch,mistakeAnalysis,prospectiveEvaluation,lessonSummary,feedTelemetry,asset,fetched_at:new Date().toISOString(),records,outcomes,unverifiedOutcomeRecords,hasMore,source:'BANK TRADES scheduled Kalshi public quote archive with official finalized labels when available'});
};