// Fail closed before a public quote can enter the immutable research archive.
// Kalshi dollar prices are probabilities in [0,1]. Zero bids are possible,
// but a zero or 100-cent ask is not a usable hypothetical entry.
export function validCollectorQuote(quote){
 const {yesBid,yesAsk,noBid,noAsk}=quote||{};
 return [yesBid,yesAsk,noBid,noAsk].every(v=>typeof v==='number'&&Number.isFinite(v))&&
  yesBid>=0&&noBid>=0&&yesAsk>0&&noAsk>0&&
  yesAsk<1&&noAsk<1&&yesBid<=yesAsk&&noBid<=noAsk&&
  // Binary YES and NO cannot both have bids above full payout, or both
  // have asks below full payout. Such mixed/stale books are not executable
  // evidence for paper entries or model training.
  yesBid+noBid<=1+1e-6&&yesAsk+noAsk>=1-1e-6;
}

// Prefer dollar-denominated fields when supplied. A blank or malformed field
// must not silently become a zero bid through Number('') or boolean coercion.
export function parseCollectorPrice(m,key){
 const dollars=m?.[key+'_dollars'];
 const raw=dollars!=null?dollars:m?.[key];
 if(typeof raw!=='number'&&
  !(typeof raw==='string'&&/^(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)$/.test(raw.trim())))return NaN;
 const value=Number(raw);
 return Number.isFinite(value)?(dollars!=null?value:value/100):NaN;
}
