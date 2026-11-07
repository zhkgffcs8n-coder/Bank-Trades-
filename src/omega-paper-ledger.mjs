// OMEGA deterministic paper execution ledger. Does not submit real orders.
const good=x=>typeof x==='number'&&Number.isFinite(x);
const money=x=>Math.round(x*10000)/10000;
export function paperEntry({signal,quote,stakeDollars=5,feesDollars,slippageDollars=0,nowMs}={}){
 const reasons=[];
 if(signal?.status!=='SHADOW_CANDIDATE'||signal.ordersAuthorized!==false)reasons.push('No approved shadow candidate');
 if(!['UP','DOWN'].includes(signal?.forecast?.consensus))reasons.push('No directional agreement');
 const side=signal?.forecast?.consensus;
 const ask=side==='UP'?quote?.yesAskDollars:quote?.noAskDollars;
 if(!quote?.ticker||!good(ask)||ask<=0||ask>=1)reasons.push('No executable side-specific ask');
 if(!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(quote?.asOfMs)||quote.asOfMs>nowMs||nowMs-quote.asOfMs>3000)reasons.push('Stale ask');
 if(!good(stakeDollars)||stakeDollars<=0||stakeDollars>5)reasons.push('Paper stake exceeds $5 cap');
 if(!good(feesDollars)||feesDollars<0||!good(slippageDollars)||slippageDollars<0)reasons.push('Unknown execution costs');
 const effectiveAsk=ask+slippageDollars;
 const quantity=good(effectiveAsk)&&effectiveAsk>0?Math.floor((stakeDollars-feesDollars)/effectiveAsk):0;
 if(!Number.isSafeInteger(quantity)||quantity<=0)reasons.push('Stake insufficient after costs');
 if(reasons.length)return {status:'BLOCKED',reasons,realOrdersAuthorized:false};
 return {status:'PAPER_OPEN',position:{status:'OPEN',ticker:quote.ticker,side:signal.forecast.consensus,quantity,entryCostDollars:money(quantity*effectiveAsk+feesDollars),openedAtMs:nowMs},realOrdersAuthorized:false};
}
export function paperExit({position,quote,feesDollars,slippageDollars=0,nowMs}={}){
 const reasons=[];
 if(position?.status!=='OPEN'||!Number.isSafeInteger(position?.quantity)||position.quantity<=0)reasons.push('No valid open paper position');
 if(quote?.ticker!==position?.ticker)reasons.push('Ticker mismatch');
 // Persisted OPEN records can be corrupted independently of the entry gate.
 // Refuse to realize paper exits from an entry exceeding the $5 cap.
 if(!good(position?.entryCostDollars)||position.entryCostDollars<=0||position.entryCostDollars>5.00011)reasons.push('Invalid or over-cap entry cost');
 // A delayed or reordered paper-monitor invocation must never realize an exit
 // using a quote captured before the simulated position existed. Legacy records
 // without openedAtMs remain readable, but malformed present timestamps fail closed.
 if(position?.openedAtMs!==undefined&&
  (!Number.isSafeInteger(position.openedAtMs)||position.openedAtMs<=0||
   !Number.isSafeInteger(nowMs)||nowMs<=position.openedAtMs||
   !Number.isSafeInteger(quote?.asOfMs)||quote.asOfMs<position.openedAtMs))
  reasons.push('Paper exit precedes entry');
 if(!['UP','DOWN'].includes(position?.side))reasons.push('Invalid position side');
 const bid=position?.side==='UP'?quote?.yesBidDollars:position?.side==='DOWN'?quote?.noBidDollars:NaN;
 if(!good(bid)||bid<=0||bid>=1)reasons.push('No executable side-specific bid');
 if(!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(quote?.asOfMs)||quote.asOfMs>nowMs||nowMs-quote.asOfMs>3000)reasons.push('Stale bid');
 if(!good(feesDollars)||feesDollars<0||!good(slippageDollars)||slippageDollars<0)reasons.push('Unknown costs');
 if(reasons.length)return {status:'BLOCKED',reasons,realOrdersAuthorized:false};
 const proceeds=position.quantity*Math.max(0,bid-slippageDollars)-feesDollars;
 return {status:'PAPER_CLOSED',netDollars:money(proceeds-position.entryCostDollars),realOrdersAuthorized:false};
}
