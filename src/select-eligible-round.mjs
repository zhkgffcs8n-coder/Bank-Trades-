import {validCollectorQuote,parseCollectorPrice} from './collector-quote.mjs';
// Select the nearest-expiring *valid* open round, never synthesize prices.
// A malformed first round must not starve the rest of the market scanner.
export function selectEligibleRound(markets,now){
 if(!Array.isArray(markets)||!Number.isFinite(now))return null;
 const sorted=markets.filter(m=>m&&Number.isFinite(m._expiry)&&m._expiry>now&&m._expiry-now<=960000)
  .sort((a,b)=>a._expiry-b._expiry);
 for(const m of sorted){
  const yesBid=parseCollectorPrice(m,'yes_bid'),yesAsk=parseCollectorPrice(m,'yes_ask');
  const noBid=parseCollectorPrice(m,'no_bid'),noAsk=parseCollectorPrice(m,'no_ask');
  if(typeof m.ticker==='string'&&m.ticker.trim()&&validCollectorQuote({yesBid,yesAsk,noBid,noAsk}))
   return {market:m,yesBid,yesAsk,noBid,noAsk};
 }
 return null;
}
