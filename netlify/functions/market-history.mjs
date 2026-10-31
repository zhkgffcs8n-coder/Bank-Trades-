import {visibleMarketSamples} from '../../src/history-snapshot.mjs';
import {pairedDisplay} from '../../src/paired-display.mjs';
import {getStore} from '@netlify/blobs';
const ASSETS=new Set(['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC']);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async req=>{
 if(req.method!=='GET')return json({error:'GET only'},405);
 const u=new URL(req.url),asset=String(u.searchParams.get('asset')||'').toUpperCase();
 if(!ASSETS.has(asset))return json({error:'Invalid asset'},400);
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'}),listed=await db.list({prefix:'samples/'+asset+'/',limit:240});
 const cutoff=Date.now()-4*60*60*1000;
 const archive=await Promise.all(listed.blobs.map(b=>db.get(b.key,{type:'json'})));
 const rolling=await db.get('recent/'+asset,{type:'json'});
 const records=visibleMarketSamples(archive,rolling,asset,cutoff);
 const tickers=[...new Set(records.map(x=>x.ticker).filter(Boolean))],outcomes={};
 for(const ticker of tickers){const o=await db.get('outcomes/'+ticker,{type:'json'});if(o)outcomes[ticker]=o}
 // Expose only the most recent contract's independently paired SHADOW record.
 // Historical legacy A/B aggregate stats are not this paired experiment.
 const latest=await db.get('latest/'+asset,{type:'json'});
 const pairedTicker=latest?.ticker;
 const currentPaired=pairedTicker?(await db.get('paired-shadow/resolved/v1/'+pairedTicker,{type:'json'})||
  await db.get('paired-shadow/pending/v1/'+pairedTicker,{type:'json'})):null;
 const latestResolved=await db.get('paired-shadow/latest-resolved/v1/'+asset,{type:'json'});
 const {pairedShadow,pairedShadowPrevious,pairedShadowLatestResolved}=pairedDisplay(currentPaired,latestResolved);
 // Status describes the CURRENT contract, even when an older verified result is shown.
 const pairedStatus=currentPaired?'RECORDED':!pairedTicker?'NO_CURRENT_CONTRACT':'AWAITING_QUALIFIED_SNAPSHOT';
 const training=await db.get('training/status',{type:'json'});
 const comparison=await db.get('comparison/report-v1',{type:'json'});
 const adaptiveResearch=await db.get('comparison/research-gate-v1',{type:'json'});
 const mistakeAnalysis=await db.get('comparison/mistake-analysis-v1',{type:'json'});
 const prospectiveEvaluation=await db.get('comparison/prospective-evaluation-v1',{type:'json'});
 const lessonSummary=await db.get('comparison/lesson-summary-v1',{type:'json'});
 const feedTelemetry=await db.get('telemetry/'+asset,{type:'json'});
 return json({pairedShadow,pairedShadowPrevious,pairedShadowLatestResolved,pairedStatus,training,comparison,adaptiveResearch,mistakeAnalysis,prospectiveEvaluation,lessonSummary,feedTelemetry,asset,fetched_at:new Date().toISOString(),records,outcomes,hasMore:!!listed.cursor,source:'BANK TRADES scheduled Kalshi public quote archive with official finalized labels when available'});
};