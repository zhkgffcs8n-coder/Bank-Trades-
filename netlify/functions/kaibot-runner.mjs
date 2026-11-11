import {paperSignal} from './lib/shared-paper-signals.mjs';
import {performance,gatePaperEntry,hasRecordedNumber,reconciledPaperTrade,validOpenPaperPosition,duplicatePaperTradeIds} from './lib/paper-performance.mjs';
import {verifiedFinalizedBinaryOutcome,trustedStoredFinalizedOutcome,SETTLEMENT_VERIFICATION} from '../../src/official-settlement.mjs';
import {assessPaperExitQuote} from '../../src/paper-exit-quote.mjs';
import {getStore} from '@netlify/blobs';
const SERIES={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const base='https://api.elections.kalshi.com/trade-api/v2',db=()=>getStore({name:'bank-trades-server-kaibot',consistency:'strong'}),hist=()=>getStore({name:'bank-trades-market-history',consistency:'strong'});
const q=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:m?.[k]!=null?Number(m[k]):NaN;
async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}finally{clearTimeout(t)}}
export default async()=>{
 const s=db(),state=await s.get('state',{type:'json'});
 let ledger=await s.get('ledger',{type:'json'})||{cash:1000,trades:[],updatedAt:null};const now=Date.now(),hdb=hist();
 // Never mutate virtual cash for duplicate trade IDs; both copies require reconciliation.
 const duplicateIds=duplicatePaperTradeIds(ledger.trades);
 const hasDuplicateId=t=>typeof t?.id==='string'&&duplicateIds.has(t.id.trim());
 // Reconcile historical simulated early exits from recorded executable bids without paying cash twice.
 for(const t of ledger.trades.filter(x=>x.status==='CLOSED'&&!x.paperExitOnly)){
  if(hasRecordedNumber(t.exitBid)&&hasRecordedNumber(t.pnl)&&hasRecordedNumber(t.cost)){
   t.paperExitOnly=true;t.settlement=Number(t.pnl)>0?'WIN':Number(t.pnl)<0?'LOSS':'TIE';t.settledAt=t.exitedAt||now;
  }
 }
 // Settle prior server paper positions only from official finalized labels.
 for(const t of ledger.trades.filter(x=>x.status==='OPEN'||(x.status==='CLOSED'&&!['WIN','LOSS'].includes(x.settlement)))){
  // Preserve malformed OPEN records for manual reconciliation, never pay them.
  if(t.status==='OPEN'&&(!validOpenPaperPosition(t)||hasDuplicateId(t)))continue;
  let o=await hdb.get('outcomes/'+t.ticker,{type:'json'});
  // Legacy cached labels were not all checked for finality and payout. Reverify.
  let result=trustedStoredFinalizedOutcome(o,t.ticker);
  if(!result){
   try{
    const official=await get(base+'/markets/'+encodeURIComponent(t.ticker));
    result=verifiedFinalizedBinaryOutcome(official?.market,t.ticker);
    if(result){
     o={ticker:t.ticker,result,source:'Kalshi official finalized market',verification:SETTLEMENT_VERIFICATION,verifiedAt:now};
     await hdb.setJSON('outcomes/'+t.ticker,o);
    }
   }catch(e){console.warn('KaiBot settlement lookup unavailable',t.ticker,String(e))}
  }
  if(!result)continue;
  const won=(t.side==='up'&&result==='yes')||(t.side==='down'&&result==='no'),payout=won?t.qty:0;
  if(t.status==='CLOSED'){
   // A simulated early exit has already returned its proceeds to cash. Never pay it twice.
   // Classify the actual paper exit P/L, not the later market outcome.
   if(!hasRecordedNumber(t.pnl))continue;
   t.settlement=Number(t.pnl)>0?'WIN':Number(t.pnl)<0?'LOSS':'TIE';
   t.marketResult=result;t.outcomeVerifiedAt=now;
  }else{
   ledger.cash=Math.round((ledger.cash+payout)*100)/100;
   t.status='SETTLED';t.marketResult=result;t.settlement=won?'WIN':'LOSS';
   t.pnl=Math.round((payout-t.cost)*100)/100;t.settledAt=now;
   t.outcomeVerification=SETTLEMENT_VERIFICATION;t.outcomeVerifiedAt=now;
  }
 }
 // Gradually reverify legacy SETTLED paper records without touching historical cash,
 // payouts, or P/L. A legacy yes/no label alone must not qualify as official.
 // Bound remote lookups and rotate the review window so an unavailable contract
 // cannot starve all later legacy records.
 const legacySettled=ledger.trades.filter(t=>t.status==='SETTLED'&&
  t.outcomeVerification!==SETTLEMENT_VERIFICATION&&typeof t.ticker==='string'&&
  ['yes','no'].includes(t.marketResult));
 const reviewCount=Math.min(4,legacySettled.length);
 const reviewStart=Number.isSafeInteger(ledger.settlementReviewOffset)&&ledger.settlementReviewOffset>=0?
  ledger.settlementReviewOffset%Math.max(legacySettled.length,1):0;
 await Promise.all(Array.from({length:reviewCount},async(_,i)=>{
  const t=legacySettled[(reviewStart+i)%legacySettled.length];
  try{
   let result=trustedStoredFinalizedOutcome(await hdb.get('outcomes/'+t.ticker,{type:'json'}),t.ticker);
   if(!result){
    const official=await get(base+'/markets/'+encodeURIComponent(t.ticker));
    result=verifiedFinalizedBinaryOutcome(official?.market,t.ticker);
    if(result)await hdb.setJSON('outcomes/'+t.ticker,{ticker:t.ticker,result,
     source:'Kalshi official finalized market',verification:SETTLEMENT_VERIFICATION,verifiedAt:now});
   }
   if(result===t.marketResult){
    t.outcomeVerification=SETTLEMENT_VERIFICATION;t.outcomeVerifiedAt=now;
   }else if(result){
    t.outcomeConflict=true; // Preserve the original ledger for manual reconciliation.
   }
  }catch(e){console.warn('Legacy paper settlement verification unavailable',t.ticker,String(e))}
 }));
 ledger.settlementReviewOffset=reviewStart+reviewCount;
 // Paper-only exit simulation: use the executable bid, never the mid/ask.
 // This does not imply a real Kalshi order could fill at that price or quantity.
 const openForExit=ledger.trades.filter(x=>validOpenPaperPosition(x)&&!hasDuplicateId(x));
 // Fetch independent exit quotes concurrently so one slow market does not delay every other market.
 const exitQuotes=await Promise.all(openForExit.map(async t=>{
  try{return {market:(await get(base+'/markets/'+encodeURIComponent(t.ticker)))?.market};}
  catch(e){return {error:e};}
 }));
 for(const [index,t] of openForExit.entries()){
  try{
   if(exitQuotes[index].error)throw exitQuotes[index].error;
   const m=exitQuotes[index].market;
   const exitQuote=assessPaperExitQuote(t,m,now);
   if(!exitQuote.eligible)continue;
   const {bid,secondsLeft,roi}=exitQuote;
   // Track the best observed sellable bid for a conservative paper trailing exit.
   // Observations are only as frequent as the scheduled runner, not tick-by-tick.
   t.peakObservedBid=Math.max(Number.isFinite(Number(t.peakObservedBid))?Number(t.peakObservedBid):0,bid);
   const trailingDrawdown=t.peakObservedBid>0?(bid-t.peakObservedBid)/t.peakObservedBid:0;
   // Paper-only adaptive trailing: protect modest observed gains, allow stronger moves more room.
   const peakGain=(t.peakObservedBid-Number(t.ask))/Number(t.ask);
   const trail=peakGain>=.30?.10:peakGain>=.15?.07:peakGain>=.05?.035:null;
   const reason=roi<=-.12?'PAPER STOP LOSS':trail!==null&&trailingDrawdown<=-trail?'PAPER TRAILING EXIT':secondsLeft>0&&secondsLeft<=90?'PAPER TIME EXIT':null;
   if(!reason)continue;
   const proceeds=Math.round(Number(t.qty)*bid)/100;
   t.status='CLOSED';t.exitReason=reason;t.exitBid=bid;t.exitedAt=now;
   t.pnl=Math.round((proceeds-Number(t.cost))*100)/100;
   t.paperExitOnly=true;t.settlement=t.pnl>0?'WIN':t.pnl<0?'LOSS':'TIE';t.settledAt=now;
   ledger.cash=Math.round((ledger.cash+proceeds)*100)/100;
  }catch(e){console.warn('Paper exit quote unavailable',t.ticker,String(e))}
 }
 const training=await hdb.get('training/status',{type:'json'});
 await s.setJSON('research-training-status',training||{count:0,validated:false,mode:'PAPER RESEARCH'});
 const adaptiveGate=await hdb.get('comparison/active-paper-gate-v1',{type:'json'});
 const paperScore=adaptiveGate?.status==='ACTIVE'?Math.max(75,Number(adaptiveGate.gate?.score)||75):75;
 const paperMaxAsk=adaptiveGate?.status==='ACTIVE'?Math.min(65,Number(adaptiveGate.gate?.maxAsk)||65):65;
 const stats=performance(ledger.trades);
 await s.setJSON('performance',stats);
 // Temporary fail-closed research circuit breaker after observed severe paper losses.
 // Continue settlement and exit processing above; never erase or reset the ledger.
 const entryPaused=stats?.gateRecent50?.trades>=30 && stats?.gatePrevious50?.trades>=30 && stats.gateRecent50.roi<0 && stats.gateRecent50.roi<stats.gatePrevious50.roi;
 const initialCash=1000;
 const openCost=ledger.trades.filter(t=>t.status==='OPEN').reduce((sum,t)=>sum+(Number(t.cost)||0),0);
 const recordedPnl=ledger.trades.filter(t=>['SETTLED','CLOSED'].includes(t.status)&&hasRecordedNumber(t.pnl)).reduce((sum,t)=>sum+Number(t.pnl),0);
 const expectedCash=initialCash+recordedPnl-openCost;
 const cashDifference=Number((Number(ledger.cash)-expectedCash).toFixed(2));
 const resolvedRecords=ledger.trades.filter(t=>['SETTLED','CLOSED'].includes(t.status));
 const verifiedAccountingRecords=resolvedRecords.filter(reconciledPaperTrade);
 const unreconciledRecords=resolvedRecords.filter(t=>!reconciledPaperTrade(t));
 const pnlSum=rows=>Number(rows.filter(t=>hasRecordedNumber(t.pnl)).reduce((sum,t)=>sum+Number(t.pnl),0).toFixed(2));
 const excludedFromEligible=resolvedRecords.filter(t=>t.entryBasis==='UNVALIDATED QUOTE-BASED PAPER TEST');
 await s.setJSON('risk-audit',{at:now,entryPaused,reason:entryPaused?'Recent verified paper cohort deteriorated; entries paused':'Paper entries subject to qualified signals, cohort loss gates, and risk checks',cash:Number(ledger.cash),expectedCash:Number(expectedCash.toFixed(2)),cashDifference,openPositions:ledger.trades.filter(t=>t.status==='OPEN').length,invalidOpenPaperPositionCount:ledger.trades.filter(t=>t.status==='OPEN'&&!validOpenPaperPosition(t)).length,duplicatePaperTradeIdCount:duplicateIds.size,duplicateOpenPaperPositionCount:ledger.trades.filter(t=>t.status==='OPEN'&&hasDuplicateId(t)).length,recordedPnl:Number(recordedPnl.toFixed(2)),openCost:Number(openCost.toFixed(2)),resolvedRecordCount:resolvedRecords.length,reconciledRecordCount:verifiedAccountingRecords.length,unreconciledRecordCount:unreconciledRecords.length,unverifiedSettledRecordCount:ledger.trades.filter(t=>t.status==='SETTLED'&&t.outcomeVerification!==SETTLEMENT_VERIFICATION).length,settlementConflictCount:ledger.trades.filter(t=>t.outcomeConflict===true).length,reconciledPnl:pnlSum(verifiedAccountingRecords),unreconciledRecordedPnl:pnlSum(unreconciledRecords),excludedResearchRecordCount:excludedFromEligible.length,excludedResearchRecordedPnl:pnlSum(excludedFromEligible),note:'Diagnostic assumes initial virtual cash of $1,000 and a complete ledger; investigate differences without rewriting history.'});
 // Keep quote-based signal observations flowing during the paper-entry safety pause.
 // No simulated positions may open while the circuit breaker is active.
 if(!state?.running){ledger.updatedAt=now;await s.setJSON('ledger',ledger);await s.setJSON('last-run',{at:now,running:false});return new Response(null,{status:204});}
 const globalModel=await hdb.get('training/model',{type:'json'});
 const research={model:globalModel,status:training};
 const round=Math.floor(now/900000);
 const mode=['lock','balanced','extreme'].includes(state.mode)?state.mode:'balanced';
 const roundAudit={at:now,running:true,mode,entriesPaused:entryPaused,markets:{}};
 // Fetch the eight market lists concurrently to reduce scan latency without changing signal qualification.
 const marketLists=await Promise.all(Object.entries(SERIES).map(async([asset,series])=>{
  try{return [asset,{data:await get(base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'50'}))}];}
  catch(error){return [asset,{error}];}
 }));
 const marketListByAsset=new Map(marketLists);
 // Per-contract deduplication below prevents duplicate entries without skipping a new round.
 for(const [asset,series] of Object.entries(SERIES)){
  try{
   roundAudit.markets[asset]={status:'CHECKING'};
   const marketResponse=marketListByAsset.get(asset);
   if(marketResponse?.error)throw marketResponse.error;
   const d=marketResponse?.data||{};
   const ms=(d.markets||[]).map(m=>({...m,_e:Date.parse(m.expected_expiration_time||m.expiration_time||m.close_time||'')})).filter(m=>Number.isFinite(m._e)&&m._e-now>=120000&&m._e-now<=930000).sort((a,b)=>a._e-b._e);const m=ms[0];if(!m){roundAudit.markets[asset]={status:'SKIPPED',reason:'No active contract with 2–15.5 minutes remaining'};continue;}roundAudit.markets[asset]={status:'CHECKING',ticker:m.ticker};const previous=ledger.trades.filter(t=>t.ticker===m.ticker);if(previous.some(t=>t.status==='OPEN')||previous.length>=(mode==='extreme'?5:3)||previous.some(t=>now-Number(t.at)<(mode==='extreme'?60000:120000))){roundAudit.markets[asset]={status:'SKIPPED',ticker:m.ticker,reason:'Position open, mode entry limit, or mode cooldown',entries:previous.length};continue;}
   const recent=await hdb.get('recent/'+asset,{type:'json'}).catch(()=>[]),records=(Array.isArray(recent)?recent:[]).filter(x=>x?.ticker===m.ticker).sort((a,b)=>a.t-b.t).slice(-8);
   // Paper-only coverage mode: make one bounded hypothetical entry per verified contract.
   // A quote-implied direction is not a validated edge and is never a real-money order.
   const yesAsk=q(m,'yes_ask'),noAsk=q(m,'no_ask'),yesBid=q(m,'yes_bid'),noBid=q(m,'no_bid');
   if(![yesAsk,noAsk,yesBid,noBid].every(Number.isFinite)||yesAsk<=0||noAsk<=0||yesAsk>=100||noAsk>=100||yesBid<0||noBid<0||yesBid>yesAsk||noBid>noAsk){roundAudit.markets[asset]={status:'SKIPPED',ticker:m.ticker,reason:'Invalid or untradeable quote',secondsLeft:Math.round((m._e-now)/1000),quote:{yesAsk,noAsk,yesBid,noBid}};continue;}
   const fresh=records.length>0&&now-Number(records.at(-1)?.t)<120000;
   const validHistory=fresh&&records.length>=4&&records.every(x=>Number.isFinite(x.yesMid)&&Number.isFinite(x.t));
   const assetModel=await hdb.get('training/model/'+asset,{type:'json'}).catch(()=>null);
   const assetResearch={model:assetModel?.count>=20?assetModel:globalModel,status:training?.perAsset?.[asset]||training};
   const signal=validHistory?gatePaperEntry({...paperSignal(m,records,null,now,assetResearch),asset},stats):{action:'WAIT',score:0,reason:'Insufficient fresh training samples'};
   await hdb.setJSON('signals/'+asset,{...signal,asset,updatedAt:now});
   // Immutable first eligible observation per round, including WAIT decisions.
   // Store both hypothetical sides so avoided losses and missed wins can be measured.
   try{
    const key='signal-observations/v1/'+m.ticker;
    if(!await hdb.get(key,{type:'json'})){
     await hdb.setJSON(key,{version:1,asset,ticker:m.ticker,at:now,expiresAt:m._e,
      action:signal.action,score:signal.score||0,reason:signal.reason||'',
      quote:{yesAsk,noAsk,yesBid,noBid},secondsLeft:(m._e-now)/1000,
      research:{modelForecast:Number.isFinite(signal.researchForecast)?signal.researchForecast:null,modelValidated:signal.researchValidated===true,modelMode:signal.researchMode||'NOT_VALIDATED',sampleCount:records.length,latestSampleAt:records.at(-1)?.t||null,latestSampleAgeMs:records.length?now-Number(records.at(-1).t):null,spreadCents:Math.max(yesAsk-yesBid,noAsk-noBid),baselineUpProbability:(yesBid+yesAsk)/200,estimatedUpEntryCost:yesAsk/100,estimatedDownEntryCost:noAsk/100,feeAndSlippageIncluded:false},
      decision:['BUY UP','BUY DOWN'].includes(signal.action)?'QUALIFIED':'ABSTAIN',
      status:'PENDING',source:'KaiBot scheduled shared signal evaluation; paper research only'});
    }
   }catch(e){console.warn('Signal observation journal unavailable',asset,String(e))}

   // Keep the first-observation research journal active, but never open a new
   // simulated position while the loss-review circuit breaker is enabled.
   if(entryPaused){
    roundAudit.markets[asset]={status:'PAPER_ENTRIES_PAUSED',ticker:m.ticker,signal:signal.action,qualified:['BUY UP','BUY DOWN'].includes(signal.action),score:Number.isFinite(Number(signal.score))?Number(signal.score):null,secondsLeft:Math.round((m._e-now)/1000),sampleCount:records.length,latestSampleAgeMs:records.length?now-Number(records.at(-1).t):null,quote:{yesAsk,noAsk,yesBid,noBid},reason:'Safety circuit breaker: research continues; no new paper entries'};
    continue;
   }
   // Lock adds confirmation; Extreme increases only per-contract frequency, not model or quote safety.
   if(mode==='lock'&&['BUY UP','BUY DOWN'].includes(signal.action)&&Number(signal.score)<75){roundAudit.markets[asset]={status:'SKIPPED',ticker:m.ticker,reason:'LOCK mode requires signal score at least 75',signal:signal.action};continue;}
   // Only qualified shared-engine signals can open automatic paper positions.
   // WAIT observations remain in the research journal above.
   if(!['BUY UP','BUY DOWN'].includes(signal.action)){
    roundAudit.markets[asset]={status:'SKIPPED',ticker:m.ticker,reason:'Unqualified signal; research observation retained',signal:signal.action};
    continue;
   }
   const modelUp=Number(signal.probability??signal.prediction);
   const chooseUp=signal.action==='BUY UP'?true:signal.action==='BUY DOWN'?false:Number.isFinite(modelUp)&&modelUp>=0&&modelUp<=1?modelUp>=0.5:yesAsk<=noAsk;
   const side=chooseUp?'up':'down',ask=chooseUp?yesAsk:noAsk;
   if(previous.length&&(!['BUY UP','BUY DOWN'].includes(signal.action)||previous.at(-1).side===side&&Math.abs(ask-Number(previous.at(-1).ask))<5)){roundAudit.markets[asset]={status:'SKIPPED',ticker:m.ticker,reason:'Re-entry requires fresh qualified signal and meaningful price change',signal:signal.action};continue;}
   // Preserve the shared BUY signal, but prevent last-minute paper entries
   // when a reversal cannot be monitored reliably by the minute scheduler.
   const secondsRemaining=(m._e-now)/1000;
   if(secondsRemaining<240){
    roundAudit.markets[asset]={status:'SKIPPED',ticker:m.ticker,signal:signal.action,secondsLeft:Math.round(secondsRemaining),reason:'LATE_ENTRY_PROTECTION: under 4 minutes left; minute runner cannot reliably react to a fast flip'};
    continue;
   }
   const currentSideBid=side==='up'?yesBid:noBid;
   const spreadAtEntry=ask-currentSideBid;
   if(!Number.isFinite(currentSideBid)||spreadAtEntry>5){
    roundAudit.markets[asset]={status:'SKIPPED',ticker:m.ticker,signal:signal.action,reason:'ENTRY_SPREAD_PROTECTION: executable bid unavailable or spread over 5 cents'};
    continue;
   }
   if(ask<=0||ask>=100){roundAudit.markets[asset]={status:'SKIPPED',ticker:m.ticker,reason:'Selected side not tradable'};continue;}
   const entryBasis='QUALIFIED PAPER SIGNAL';
   const max=100; // Fixed $100 virtual stake ceiling per qualified paper entry; never affects live orders.
   const qty=Math.floor(Math.min(max,ledger.cash)/(ask/100)),cost=Math.round(qty*ask)/100;if(qty<1||cost<=0||cost>ledger.cash){roundAudit.markets[asset]={status:'SKIPPED',ticker:m.ticker,reason:'Insufficient virtual cash'};continue;}
   roundAudit.markets[asset]={status:'ENTERED',ticker:m.ticker,side,ask,entryBasis,entries:previous.length+1};
   ledger.cash=Math.round((ledger.cash-cost)*100)/100;ledger.trades.push({id:'srv_'+now+'_'+asset,asset,ticker:m.ticker,side,qty,ask,cost,at:now,status:'OPEN',source:'SERVER KAIBOT PAPER',entryBasis,secondsToExpiryAtEntry:(m._e-now)/1000,entryQuote:{yesAsk,yesBid,noAsk,noBid},signalQuality:{sharedEngine:true,score:signal.score,reason:signal.reason,validation:signal.validation,secondsLeft:(m._e-now)/1000}});
  }catch(e){roundAudit.markets[asset]={status:'ERROR',reason:String(e).slice(0,240)};console.error('KaiBot paper round failed',asset,String(e));await s.setJSON('round-error/'+asset,{asset,at:now,error:String(e).slice(0,240)}).catch(()=>{});}
 }
 // EXTREME must never fabricate an entry from an unqualified quote.
 // Record coverage honestly; only the shared qualified BUY path above opens positions.
 const enteredRound=ledger.trades.some(t=>Math.floor(Number(t.at)/900000)===round&&t.entryBasis==='QUALIFIED PAPER SIGNAL');
 roundAudit.extremeCoverage={round,mode,status:entryPaused?'PAUSED':enteredRound?'QUALIFIED_ENTRY':'NO_QUALIFIED_ENTRY',note:'No forced quote-only entries; every position requires the same shared validated paper BUY signal.'};
 ledger.updatedAt=now;await s.setJSON('ledger',ledger);await s.setJSON('last-run',roundAudit);
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};