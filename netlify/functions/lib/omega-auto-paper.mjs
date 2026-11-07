// Automatic paper-only position monitoring for OMEGA. Never sends Kalshi orders.
// Requires fresh independently fetched side-specific Kalshi bid/ask quotes.
import {advanceOmegaPaper} from '../../../src/omega-paper-coordinator.mjs';
export function omegaPaperSignal(research){
 const edge=research?.fusion?.modelMinusMarket;
 const mean=research?.fusion?.modelMean;
 const disagreement=research?.fusion?.modelDisagreement;
 if(research?.status!=='SHADOW_RESEARCH'||!Number.isFinite(edge)||!Number.isFinite(mean)||
 !Number.isFinite(disagreement)||disagreement>.2||Math.abs(edge)<.1)
 return null;
 return {status:'SHADOW_CANDIDATE',marketTicker:research.fusion.marketTicker,roundId:research.fusion.roundId,
  forecast:{consensus:mean>=.5?'UP':'DOWN'},ordersAuthorized:false};
}
export async function advanceOmegaPaperStored({db,ticker,roundId,signal,quote,nowMs=Date.now(),feesDollars=.05}={}){
 if(!ticker||ticker!==quote?.ticker||ticker!==roundId||!Number.isSafeInteger(nowMs))
 return {status:'BLOCKED',reason:'Invalid paper round',realOrdersAuthorized:false};
 const key='omega/paper/v1/'+ticker;
 const prior=await db.get(key,{type:'json'});
 const state=prior?.state||{};
 // A settled/expired contract cannot be priced for an exit at a fabricated bid.
 const result=advanceOmegaPaper({state,signal,quote,roundId,feesDollars,nowMs,stakeDollars:5,
  slippageDollars:.01,exitAtProfitDollars:.5,exitAtLossDollars:-.5});
 if(['PAPER_ENTRY','PAPER_EXIT','PAPER_HOLD'].includes(result.status)){
  await db.setJSON(key,{state:result.state,updatedAtMs:nowMs,lastAction:result.status});
  // One marker per open contract, not per rotating asset. If a marker write
  // fails, the scheduler's bounded ledger backfill can reconstruct it.
  if(result.status==='PAPER_ENTRY')await db.setJSON('omega/paper/open/v1/'+ticker,
   {ticker,openedAtMs:nowMs,realOrdersAuthorized:false});
  if(result.status==='PAPER_EXIT'&&typeof db.delete==='function')await db.delete('omega/paper/open/v1/'+ticker);
  if(result.status!=='PAPER_HOLD')await db.setJSON('omega/paper/latest',{ticker,roundId,action:result.status,updatedAtMs:nowMs,
   netDollars:result.netDollars??null,realOrdersAuthorized:false});
 }
 return {status:result.status,netDollars:result.netDollars??null,reason:result.reason??null,realOrdersAuthorized:false};
}
export async function fetchOmegaLiveQuote({ticker,nowMs=Date.now(),fetchImpl=fetch}={}){
 if(!/^[A-Z0-9-]{3,100}$/.test(ticker||''))return null;
 try{
  const response=await fetchImpl('https://api.elections.kalshi.com/trade-api/v2/markets/'+encodeURIComponent(ticker),{
   headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});
  if(!response.ok)return null;
  const {market}=await response.json();
  if(market?.ticker!==ticker||market.status!=='active')return null;
  const parse=(d,c)=>{const v=d===undefined?Number(c)/100:Number(d);return Number.isFinite(v)&&v>0&&v<1?v:NaN};
  const quote={ticker,asOfMs:nowMs,yesAskDollars:parse(market.yes_ask_dollars,market.yes_ask),
   noAskDollars:parse(market.no_ask_dollars,market.no_ask),
   yesBidDollars:parse(market.yes_bid_dollars,market.yes_bid),
   noBidDollars:parse(market.no_bid_dollars,market.no_bid)};
  return Object.values(quote).slice(2).every(Number.isFinite)?quote:null;
 }catch{return null;}
}
