// Immutable, prospective forecast evidence for SHADOW/PAPER research only.
export function freezeForecast({ticker,asset,at,expiresAt,yesBid,yesAsk,noBid,noAsk,momentumSide=null}){
 if(typeof ticker!=='string'||!ticker||!Number.isFinite(at)||!Number.isFinite(expiresAt)||expiresAt<=at||
 ![yesBid,yesAsk,noBid,noAsk].every(Number.isFinite)||yesBid<0||noBid<0||yesAsk<=0||noAsk<=0||yesAsk>=1||noAsk>=1||yesBid>yesAsk||noBid>noAsk)return null;
 const baseline=(yesBid+yesAsk)/2;
 const direction=['UP','DOWN'].includes(momentumSide)?momentumSide:baseline>=.5?'UP':'DOWN';
 return {version:1,mode:'SHADOW_ONLY',ticker,asset,at,expiresAt,direction,basis:momentumSide?'observed momentum':'market-implied quote direction',baseline,yesAsk,noAsk,status:'PENDING',actionable:false};
}
export function scoreFrozenForecast(row,officialOutcome,now,fee=0.02,slippage=0.01){
 if(row?.status!=='PENDING'||!['UP','DOWN'].includes(row.direction)||!['yes','no'].includes(officialOutcome)||!Number.isFinite(now)||now<=row.at||now<row.expiresAt||![fee,slippage].every(x=>Number.isFinite(x)&&x>=0))return null;
 const outcome=officialOutcome==='yes'?1:0;
 const predicted=row.direction==='UP'?1:0;
 const ask=row.direction==='UP'?row.yesAsk:row.noAsk;
 if(!Number.isFinite(ask)||ask<=0||ask>=1||!Number.isFinite(row.baseline)||row.baseline<=0||row.baseline>=1)return null;
 const won=predicted===outcome;
 return {...row,status:'RESOLVED',resolvedAt:now,officialOutcome,correct:won,baselineBrier:(row.baseline-outcome)**2,directionalBrier:(predicted-outcome)**2,simulatedNetPnl:(won?1:0)-ask-fee-slippage,costAssumptions:{fee,slippage},note:'One hypothetical contract at frozen ask; not a fill or validated probability'};
}
