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
 return {ticker,signal:reasons.length?'WAIT':'HOLD',stage:reasons.length?'DATA REJECTED':'DATA READY',quality_score:quality,
  estimated_win_probability:null,seconds_left:Number.isFinite(remaining)?Math.max(0,Math.floor(remaining)):null,
  quotes,reasons:reasons.length?reasons:['Directional signals require validated historical data']};
}
function rankMarkets(markets,now=Date.now()){
 return markets.map(m=>analyzeMarket(m,now)).sort((a,b)=>b.quality_score-a.quality_score||a.ticker.localeCompare(b.ticker));
}
// Shared paper-only position guidance; never infer a BUY from spread quality alone.
function positionAlert(m,position,now=Date.now()){
 const market=analyzeMarket(m,now);
 if(!position)return {...market,signal:'WAIT',reasons:[...market.reasons,'No position; entry requires independently validated directional evidence']};
 if(market.stage!=='DATA READY')return {...market,signal:'WAIT',reasons:[...market.reasons,'Exit quote unavailable; review position manually']};
 const side=String(position.side||'').toLowerCase();
 const bid=side==='up'?market.quotes.upBid:side==='down'?market.quotes.downBid:NaN;
 const entry=Number(position.ask);
 if(!Number.isFinite(entry)||entry<=0||!Number.isFinite(bid))return {...market,signal:'WAIT',reasons:['Missing entry or executable exit bid']};
 const roi=(bid-entry)/entry;
 const signal=roi<=-.12?'SELL FAST':'HOLD';
 return {...market,signal,unrealized_roi:roi,reasons:[signal==='SELL FAST'?'Paper stop-loss threshold crossed; executable bid may change':'Paper position open; no stop-loss threshold crossed']};
}
module.exports={analyzeMarket,rankMarkets,positionAlert};
