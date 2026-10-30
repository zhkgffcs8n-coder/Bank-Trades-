'use strict';
// BANK TRADES PRO: research-only signal quality gate. No order execution.
// Quality scores are NOT probabilities or claims of predictive accuracy.
function number(m,side,field){
 const dollars=m?.[side+'_'+field+'_dollars'];
 if(dollars!==undefined&&dollars!==null&&dollars!=='')return Number(dollars)*100;
 const cents=m?.[side+'_'+field];
 return cents===undefined||cents===null?NaN:Number(cents);
}
function analyzeMarket(m,now=Date.now()){
 const ticker=String(m?.ticker||'');
 const expires=Date.parse(m?.expires_at||m?.expected_expiration_time||m?.expiration_time||m?.close_time||'');
 const remaining=(expires-now)/1000;
 const quotes={upBid:number(m,'yes','bid'),upAsk:number(m,'yes','ask'),downBid:number(m,'no','bid'),downAsk:number(m,'no','ask')};
 const reasons=[];
 if(!ticker)reasons.push('Missing ticker');
 if(!Number.isFinite(remaining)||remaining<45)reasons.push('Expired or near expiration');
 for(const [k,v] of Object.entries(quotes))if(!Number.isFinite(v)||v<0||v>100)reasons.push('Invalid '+k);
 if(!reasons.length){
  if(quotes.upBid>quotes.upAsk||quotes.downBid>quotes.downAsk)reasons.push('Crossed quotes');
  if(quotes.upAsk-quotes.upBid>12||quotes.downAsk-quotes.downBid>12)reasons.push('Wide spread');
  if(quotes.upBid===0||quotes.downBid===0)reasons.push('Insufficient two-sided liquidity');
 }
 const quality=reasons.length?0:Math.max(0,Math.min(100,Math.round(100-3*((quotes.upAsk-quotes.upBid)+(quotes.downAsk-quotes.downBid)))));
 return {ticker,signal:'AVOID',stage:reasons.length?'DATA REJECTED':'DATA READY',quality_score:quality,
  estimated_win_probability:null,seconds_left:Number.isFinite(remaining)?Math.max(0,Math.floor(remaining)):null,
  quotes,reasons:reasons.length?reasons:['Directional signals require validated historical data']};
}
function rankMarkets(markets,now=Date.now()){
 return markets.map(m=>analyzeMarket(m,now)).sort((a,b)=>b.quality_score-a.quality_score||a.ticker.localeCompare(b.ticker));
}
module.exports={analyzeMarket,rankMarkets};
