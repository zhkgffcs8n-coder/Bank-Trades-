// Read-only explanation of why a current contract has no frozen paired A+B record.
// Mirrors the collector's 3–7 minute, four-sample gate; never creates a signal.
import {recentContractSamples} from './recent-contract-samples.mjs';

export function pairedWaitDiagnostics(latest, rolling, telemetry, now=Date.now()) {
 const reasons=[];
 const ticker=latest?.ticker;
 if (!ticker) return {status:'NO_CURRENT_CONTRACT',sampleCount:0,reasons:['No current Kalshi contract snapshot is stored']};
 if (telemetry?.valid===false) reasons.push('Collector error: '+String(telemetry.error||'invalid feed').slice(0,120));
 const observedAt=Number(latest.observedAt);
 if (!Number.isFinite(observedAt)||observedAt<=0||observedAt>now||now-observedAt>120000)
  reasons.push('Current quote snapshot is missing, future-dated, or older than 120 seconds');
 const expiresAt=Number(latest.expiresAt);
 if (!Number.isFinite(expiresAt)||expiresAt-now<=180000||expiresAt-now>420000)
  reasons.push('Contract is outside the 3–7 minute pre-expiry freeze window');
 const prices=['yesBid','yesAsk','noBid','noAsk'].map(k=>latest[k]);
 const [yb,ya,nb,na]=prices;
 if (!prices.every(Number.isFinite)||yb<0||nb<0||ya<=0||na<=0||ya>=1||na>=1||yb>ya||nb>na)
  reasons.push('Executable bid/ask quote is missing, crossed, or invalid');
 else if (Math.max(ya-yb,na-nb)>.04)
  reasons.push('Executable bid/ask spread exceeds four cents');
 const samples=recentContractSamples(rolling,ticker,observedAt);
 if (samples.length<4) reasons.push('Need four distinct same-contract minute samples (have '+samples.length+')');
 if (samples.length&&samples.at(-1).t-samples[0].t<180000)
  reasons.push('Need at least three minutes of same-contract sample history');
 if (samples.length&&observedAt-samples.at(-1).t>90000)
  reasons.push('Newest same-contract sample is older than 90 seconds at quote capture');
 return {status:reasons.length?'WAIT':'READY_TO_EVALUATE',sampleCount:samples.length,reasons,
  note:'Ready inputs do not imply either engine predicts a direction or that a trade is authorized'};
}
