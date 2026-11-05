// PRIMAL OMEGA: read-only independent research layer. NEVER sends orders.
// Model names are original and do not represent Spider Ultra's private code.
import {evaluateTeam} from './engine-team.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round(x*10000)/10000;
export const OMEGA_PROFILES=Object.freeze({
 careful:Object.freeze({maxSpreadCents:2,maxQuoteAgeMs:3000,minAgreement:0.83,maxStakeDollars:5}),
 balanced:Object.freeze({maxSpreadCents:3,maxQuoteAgeMs:5000,minAgreement:0.67,maxStakeDollars:5}),
 bold:Object.freeze({maxSpreadCents:5,maxQuoteAgeMs:5000,minAgreement:0.5,maxStakeDollars:5})
});
export function omegaForecast(snapshot,profile='careful'){
 const settings=OMEGA_PROFILES[profile];
 if(!settings)return {status:'BLOCKED',reasons:['Unknown risk profile'],ordersAuthorized:false};
 const team=evaluateTeam(snapshot);
 const reasons=[];
 if(team.status!=='SHADOW_ONLY')reasons.push('Invalid forecasting features');
 if(!finite(snapshot?.spread)||snapshot.spread<0||snapshot.spread>settings.maxSpreadCents)reasons.push('Spread too wide or unavailable');
 // ageMs is sample age, NOT live Kalshi quote age. Require an independent quote timestamp.
 const quoteAt=snapshot?.quoteTimestampMs,now=snapshot?.nowMs;
 if(!finite(quoteAt)||!finite(now)||quoteAt>now||now-quoteAt>settings.maxQuoteAgeMs)reasons.push('Live quote timestamp missing or stale');
 if(!finite(snapshot?.yesBid)||!finite(snapshot?.yesAsk)||!finite(snapshot?.noBid)||!finite(snapshot?.noAsk)||
 snapshot.yesBid<=0||snapshot.noBid<=0||snapshot.yesAsk>=1||snapshot.noAsk>=1||
 snapshot.yesBid>snapshot.yesAsk||snapshot.noBid>snapshot.noAsk)reasons.push('No valid two-sided market');
 if(team.status==='SHADOW_ONLY'&&(team.consensus==='SPLIT'||team.agreement<settings.minAgreement))reasons.push('Forecasters disagree');
 return {status:reasons.length?'BLOCKED':'SHADOW_CANDIDATE',reasons,profile,forecast:team,
 ordersAuthorized:false,notice:'Research-only; agreement is not calibrated accuracy or proof of profitability'};
}
export function omegaPaperExit(position,quote,policy={}){
 const reasons=[];
 if(!position||position.status!=='OPEN')reasons.push('No confirmed open position');
 if(!quote||quote.ticker!==position?.ticker)reasons.push('Contract mismatch');
 if(!finite(position?.quantity)||!Number.isSafeInteger(position.quantity)||position.quantity<=0)reasons.push('Invalid filled quantity');
 if(!finite(position?.entryCostDollars)||position.entryCostDollars<=0)reasons.push('Invalid entry cost');
 if(!finite(quote?.bidDollars)||quote.bidDollars<=0||quote.bidDollars>=1)reasons.push('No executable exit bid');
 if(!finite(quote?.asOfMs)||!finite(quote?.nowMs)||quote.asOfMs>quote.nowMs||quote.nowMs-quote.asOfMs>3000)reasons.push('Exit quote stale');
 if(!finite(policy?.feesDollars)||policy.feesDollars<0)reasons.push('Unknown fees');
 if(!finite(policy?.slippageDollars)||policy.slippageDollars<0)reasons.push('Unknown slippage');
 if(reasons.length)return {status:'BLOCKED',reasons,ordersAuthorized:false};
 const net=position.quantity*quote.bidDollars-position.entryCostDollars-policy.feesDollars-policy.slippageDollars;
 const loss=policy.stopLossDollars,profit=policy.takeProfitDollars;
 if(loss!==undefined&&(!finite(loss)||loss<=0))reasons.push('Invalid stop loss');
 if(profit!==undefined&&(!finite(profit)||profit<=0))reasons.push('Invalid profit target');
 if(reasons.length)return {status:'BLOCKED',reasons,ordersAuthorized:false};
 const action=finite(loss)&&net<=-loss?'PAPER_EXIT_LOSS':finite(profit)&&net>=profit?'PAPER_TAKE_PROFIT':'PAPER_HOLD';
 return {status:'SHADOW_ONLY',action,estimatedNetDollars:round(net),ordersAuthorized:false,
 notice:'Bid-based estimate; real exits may slip or fail to fill. Stop losses cannot cap actual loss.'};
}
