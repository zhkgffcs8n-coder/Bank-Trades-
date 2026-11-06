// Owner-only live-trading risk policy. This module is deliberately fail-closed.
// It is not an execution service; passing a check never authorizes orders by itself.
export const LIVE_MODES=Object.freeze({
 LOCK:Object.freeze({maxOrderUsd:1,maxOpenPositions:1,maxDailyLossUsd:3,minSignalScore:95}),
 BALANCED:Object.freeze({maxOrderUsd:2,maxOpenPositions:1,maxDailyLossUsd:5,minSignalScore:85}),
 EXTREME:Object.freeze({maxOrderUsd:3,maxOpenPositions:2,maxDailyLossUsd:5,minSignalScore:75})
});
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function assessLiveOrder({owner=false,mode='LOCK',start=false,emergencyStop=true,
 credentialVerified=false,executionVerified=false,fillReconciliationVerified=false,
 quoteAgeMs=Infinity,spreadCents=Infinity,signalScore=0,orderUsd=Infinity,
 dailyRealizedPnlUsd=0,openPositions=Infinity,signalSource='',orderId='',seenOrderIds=[]}={}){
 const limits=LIVE_MODES[mode];
 const reasons=[];
 if(!owner)reasons.push('OWNER_REQUIRED');
 if(!limits)reasons.push('INVALID_MODE');
 if(!start)reasons.push('NOT_STARTED');
 if(emergencyStop)reasons.push('EMERGENCY_STOP');
 if(!credentialVerified)reasons.push('KALSHI_NOT_VERIFIED');
 if(!executionVerified)reasons.push('EXECUTION_NOT_VERIFIED');
 if(!fillReconciliationVerified)reasons.push('FILLS_NOT_RECONCILED');
 if(!finite(quoteAgeMs)||quoteAgeMs<0||quoteAgeMs>2000)reasons.push('STALE_QUOTE');
 if(!finite(spreadCents)||spreadCents<0||spreadCents>8)reasons.push('SPREAD_TOO_WIDE');
 if(!limits||!finite(signalScore)||signalScore<limits.minSignalScore)reasons.push('SIGNAL_NOT_QUALIFIED');
 if(!limits||!finite(orderUsd)||orderUsd<=0||orderUsd>limits.maxOrderUsd)reasons.push('ORDER_LIMIT');
 if(!limits||!finite(dailyRealizedPnlUsd)||dailyRealizedPnlUsd<=-limits.maxDailyLossUsd)reasons.push('DAILY_LOSS_LIMIT');
 if(!limits||!Number.isSafeInteger(openPositions)||openPositions<0||openPositions>=limits.maxOpenPositions)reasons.push('POSITION_LIMIT');
 if(signalSource!=='SPIDER_PRIMAL_VERIFIED')reasons.push('UNVERIFIED_SIGNAL');
 if(typeof orderId!=='string'||!orderId||seenOrderIds.includes(orderId))reasons.push('DUPLICATE_OR_MISSING_ORDER_ID');
 return {allowed:reasons.length===0,reasons,limits:limits||null};
}
