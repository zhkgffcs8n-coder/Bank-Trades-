// Automatic paper-only position monitoring for OMEGA. Never sends Kalshi orders.
// Requires fresh independently fetched side-specific Kalshi bid/ask quotes.
import {advanceOmegaPaper} from '../../../src/omega-paper-coordinator.mjs';
import {validCollectorQuote} from '../../../src/collector-quote.mjs';
import {trustedStoredFinalizedOutcome,SETTLEMENT_VERIFICATION} from '../../../src/official-settlement.mjs';
export function omegaPaperSignal(research,quote){
 const fusion=research?.fusion;
 const mean=fusion?.modelMean,disagreement=fusion?.modelDisagreement;
 // A probability above 50% is NOT evidence that buying UP is profitable:
 // compare each outcome probability to the actual executable side ask.
 // Include the paper simulator's 1c/contract slippage and a conservative
 // 5c/contract allowance for its fixed entry fee.
 if(research?.status!=='SHADOW_RESEARCH'||!Number.isFinite(mean)||mean<0||mean>1||
  !Number.isFinite(disagreement)||disagreement<0||disagreement>.2||
  !quote||quote.ticker!==fusion?.marketTicker||fusion?.roundId!==quote.ticker)
  return null;
 const validAsk=p=>typeof p==='number'&&Number.isFinite(p)&&p>0&&p<1;
 if(!validAsk(quote.yesAskDollars)||!validAsk(quote.noAskDollars)||
  ![quote.yesBidDollars,quote.noBidDollars].every(p=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<1)||
  quote.yesBidDollars>quote.yesAskDollars||quote.noBidDollars>quote.noAskDollars||
  !validCollectorQuote({yesBid:quote.yesBidDollars,yesAsk:quote.yesAskDollars,
   noBid:quote.noBidDollars,noAsk:quote.noAskDollars}))return null;
 const costs=.01+.05,minimumNetEdge=.10;
 const upEdge=mean-quote.yesAskDollars-costs;
 const downEdge=(1-mean)-quote.noAskDollars-costs;
 const best=Math.max(upEdge,downEdge);
 if(best<minimumNetEdge)return null;
 const side=upEdge>=downEdge?'UP':'DOWN';
 return {status:'SHADOW_CANDIDATE',marketTicker:fusion.marketTicker,roundId:fusion.roundId,
  forecast:{consensus:side},ordersAuthorized:false};
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
export async function fetchOmegaLiveQuote({ticker,nowMs=Date.now(),fetchImpl=fetch,clock=()=>nowMs}={}){
 if(!/^[A-Z0-9-]{3,100}$/.test(ticker||''))return null;
 try{
  const response=await fetchImpl('https://api.elections.kalshi.com/trade-api/v2/markets/'+encodeURIComponent(ticker),{
   headers:{accept:'application/json'},signal:AbortSignal.timeout(1500)});
  if(!response.ok)return null;
  const {market}=await response.json();
  const receivedAtMs=clock();
  if(!Number.isSafeInteger(receivedAtMs)||receivedAtMs<nowMs)return null;
  if(market?.ticker!==ticker||market.status!=='active')return null;
  // An active status alone is not proof that the contract still accepts orders.
  // Fail closed when an explicit close time has passed or cannot be parsed.
  if(market.close_time!=null){
   const closesAt=Date.parse(market.close_time);
   if(!Number.isFinite(closesAt)||closesAt<=receivedAtMs)return null;
  }
  // A legitimate 0 bid means there is no executable exit liquidity; it must
  // not invalidate the whole quote or be mistaken for a positive exit price.
  // Reject absent/null/blank/boolean values so missing bids cannot become zero.
  const parse=(d,c,allowZero=false)=>{
   const raw=d===undefined?c:d;
   if(raw===null||raw===undefined||typeof raw==='boolean'||
    (typeof raw==='string'&&!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)))return NaN;
   const v=d===undefined?Number(raw)/100:Number(raw);
   return Number.isFinite(v)&&v<1&&(allowZero?v>=0:v>0)?v:NaN;
  };
  const quote={ticker,asOfMs:nowMs,yesAskDollars:parse(market.yes_ask_dollars,market.yes_ask),
   noAskDollars:parse(market.no_ask_dollars,market.no_ask),
   yesBidDollars:parse(market.yes_bid_dollars,market.yes_bid,true),
   noBidDollars:parse(market.no_bid_dollars,market.no_bid,true)};
  return validCollectorQuote({yesBid:quote.yesBidDollars,yesAsk:quote.yesAskDollars,
   noBid:quote.noBidDollars,noAsk:quote.noAskDollars})?quote:null;
 }catch{return null;}
}

/** Close an OPEN shadow position only against a previously persisted, strictly
 * verified official Kalshi finalization. No synthetic bid, exit fill or live order.
 */
export async function settleOmegaPaperStored({db,ticker,nowMs=Date.now()}={}){
 if(typeof ticker!=='string'||!/^[A-Z0-9-]{3,100}$/.test(ticker)||!Number.isSafeInteger(nowMs))
  return {status:'BLOCKED',reason:'Invalid settlement request',realOrdersAuthorized:false};
 const key='omega/paper/v1/'+ticker;
 const [prior,label]=await Promise.all([db.get(key,{type:'json'}),db.get('outcomes/'+ticker,{type:'json'})]);
 const position=prior?.state?.positions?.[ticker];
 if(position?.status!=='OPEN'||position.ticker!==ticker||position.roundId!==ticker||
  !['UP','DOWN'].includes(position.side)||!Number.isSafeInteger(position.quantity)||position.quantity<=0||
  !Number.isFinite(position.entryCostDollars)||position.entryCostDollars<=0||position.entryCostDollars>5.00011||
  !Number.isSafeInteger(position.openedAtMs)||position.openedAtMs<=0)
  return {status:'BLOCKED',reason:'No valid open position',realOrdersAuthorized:false};
 const outcome=trustedStoredFinalizedOutcome(label,ticker);
 const settledAtMs=Date.parse(label?.settledAt||'');
 if(!outcome||label.verification!==SETTLEMENT_VERIFICATION||
  !Number.isSafeInteger(settledAtMs)||settledAtMs<=position.openedAtMs||settledAtMs>nowMs)
  return {status:'WAITING_FOR_VERIFIED_SETTLEMENT',realOrdersAuthorized:false};
 const wins=(position.side==='UP'&&outcome==='yes')||(position.side==='DOWN'&&outcome==='no');
 const payoutDollars=wins?position.quantity:0;
 const netDollars=Math.round((payoutDollars-position.entryCostDollars)*10000)/10000;
 const closed={...position,status:'SETTLED',settledAtMs,outcome,netDollars,exitReason:'OFFICIAL_SETTLEMENT',
  payoutDollars,settlementVerification:SETTLEMENT_VERIFICATION};
 await db.setJSON(key,{...prior,state:{...prior.state,positions:{...prior.state.positions,[ticker]:closed}},
  updatedAtMs:nowMs,lastAction:'PAPER_SETTLED'});
 if(typeof db.delete==='function')await db.delete('omega/paper/open/v1/'+ticker);
 await db.setJSON('omega/paper/latest',{ticker,roundId:ticker,action:'PAPER_SETTLED',updatedAtMs:nowMs,
  netDollars,officiallySettled:true,realOrdersAuthorized:false});
 return {status:'PAPER_SETTLED',netDollars,realOrdersAuthorized:false};
}
