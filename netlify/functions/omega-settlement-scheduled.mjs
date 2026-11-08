import {getStore} from '@netlify/blobs';
import {scanBlobPage} from '../../src/paged-blob-scan.mjs';
import {trustedStoredFinalizedOutcome} from '../../src/official-settlement.mjs';
import {scoreVerifiedRound} from '../../src/omega-learning.mjs';

export async function scoreOmegaArchive(db,{nowMs=Date.now()}={}){
 if(!Number.isSafeInteger(nowMs)||nowMs<=0)throw Error('Invalid OMEGA settlement scoring time');
 return scanBlobPage(db,{prefix:'omega/predictions/v1/',cursorKey:'omega/score-cursor/v1',limit:16},async ({key})=>{
  const [, , ,ticker]=key.split('/');
  if(!ticker)return;
  const scoreKey='omega/verified-scores/v1/'+ticker;
  if(await db.get(scoreKey,{type:'json'}))return;
  const [forecast,label]=await Promise.all([db.get(key,{type:'json'}),db.get('outcomes/'+ticker,{type:'json'})]);
  const outcome=trustedStoredFinalizedOutcome(label,ticker),settledAtMs=Date.parse(label?.settledAt);
  // An official result may be published after a contract has already expired.
  // A forecast made in that gap knows the market has closed and is not a
  // prospective prediction. Older archives without a frozen expiry cannot
  // prove pre-close timing and must remain unscored.
  if(!outcome||forecast?.ticker!==ticker||!Number.isSafeInteger(forecast.recordedAtMs)||
   !Number.isSafeInteger(forecast.expiresAtMs)||forecast.expiresAtMs<=forecast.recordedAtMs||
   // A stored verification marker cannot prove an outcome was already available
    // if its settlement timestamp is still in the future.
    !Number.isSafeInteger(settledAtMs)||settledAtMs>nowMs||
    forecast.expiresAtMs>settledAtMs||forecast.recordedAtMs>=settledAtMs||
   !Array.isArray(forecast.accepted)||forecast.accepted.length<2||
   forecast.accepted.some(x=>!Number.isSafeInteger(x?.observedAtMs)||x.observedAtMs>forecast.recordedAtMs||
    typeof x.upProbability!=='number'||!Number.isFinite(x.upProbability)||x.upProbability<0||x.upProbability>1)||
   new Set(forecast.accepted.map(x=>x.provider)).size!==forecast.accepted.length)return;
  const score=scoreVerifiedRound({status:forecast.status,marketTicker:ticker,roundId:ticker,
   marketBaseline:forecast.baseline,accepted:forecast.accepted},
  {marketTicker:ticker,roundId:ticker,upOutcome:Number(outcome==='yes'),settledAtMs,verified:true});
  if(score.status!=='VERIFIED_SHADOW_SCORE')return;
  // The research decision is not immutable until the scheduled coordinator
  // durably freezes it. Provider observation times can precede that freeze;
  // using them as predictedAtMs leaks earlier eligibility into walk-forward
  // selection and makes the official chronology look better than it was.
  await db.setJSON(scoreKey,{...score,predictedAtMs:forecast.recordedAtMs,outcome,settledAtMs,
   forecastKey:key,recordedAtMs:forecast.recordedAtMs,expiresAtMs:forecast.expiresAtMs},{onlyIfNew:true});
 });
}

export default async()=>{
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
 await scoreOmegaArchive(db);
 return new Response(null,{status:204});
};
export const config={schedule:'2-59/3 * * * *'};
