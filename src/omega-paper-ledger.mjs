// OMEGA deterministic paper execution ledger. Does not submit real orders.
const good=x=>typeof x==='number'&&Number.isFinite(x);
const money=x=>Math.round(x*10000)/10000;
export function paperEntry({signal,quote,stakeDollars=5,feesDollars,slippageDollars=0,nowMs}={}){
 const reasons=[];
 if(signal?.status!=='SHADOW_CANDIDATE'||signal.ordersAuthorized!==false)reasons.push('No approved shadow candidate');
 if(!['UP','DOWN'].includes(signal?.forecast?.consensus))reasons.push('No directional agreement');
 if(!quote?.ticker||!good(quote.askDollars)||quote.askDollars<=0||quote.askDollars>=1)reasons.push('No executable ask');
 if(!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(quote?.asOfMs)||quote.asOfMs>nowMs||nowMs-quote.asOfMs>3000)reasons.push('Stale ask');
 if(!good(stakeDollars)||stakeDollars<=0||stakeDollars>5)reasons.push('Paper stake exceeds $5 cap');
 if(!good(feesDollars)||feesDollars<0||!good(slippageDollars)||slippageDollars<0)reasons.push('Unknown execution costs');
 const effectiveAsk=quote?.askDollars+slippageDollars;
 const quantity=good(effectiveAsk)&&effectiveAsk>0?Math.floor((stakeDollars-feesDollars)/effectiveAsk):0;
 if(!Number.isSafeInteger(quantity)||quantity<=0)reasons.push('Stake insufficient after costs');
 if(reasons.length)return {status:'BLOCKED',reasons,realOrdersAuthorized:false};
 return {status:'PAPER_OPEN',position:{status:'OPEN',ticker:quote.ticker,side:signal.forecast.consensus,quantity,entryCostDollars:money(quantity*effectiveAsk+feesDollars),openedAtMs:nowMs},realOrdersAuthorized:false};
}
export function paperExit({position,quote,feesDollars,slippageDollars=0,nowMs}={}){
 const reasons=[];
 if(position?.status!=='OPEN'||!Number.isSafeInteger(position?.quantity)||position.quantity<=0||!good(position?.entryCostDollars)||position.entryCostDollars<=0||!['UP','DOWN'].includes(position?.side))reasons.push('No valid open paper position');
 if(quote?.ticker!==position?.ticker)reasons.push('Ticker mismatch');
 if(!good(quote?.bidDollars)||quote.bidDollars<=0||quote.bidDollars>=1)reasons.push('No executable bid');
 if(!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(quote?.asOfMs)||quote.asOfMs>nowMs||nowMs-quote.asOfMs>3000)reasons.push('Stale bid');
 if(!good(feesDollars)||feesDollars<0||!good(slippageDollars)||slippageDollars<0)reasons.push('Unknown costs');
 if(reasons.length)return {status:'BLOCKED',reasons,realOrdersAuthorized:false};
 const proceeds=position.quantity*Math.max(0,quote.bidDollars-slippageDollars)-feesDollars;
 return {status:'PAPER_CLOSED',netDollars:money(proceeds-position.entryCostDollars),realOrdersAuthorized:false};
}
