// Fail closed before a public quote can enter the immutable research archive.
// Kalshi dollar prices are probabilities in [0,1]. Zero bids are possible,
// but a zero or 100-cent ask is not a usable hypothetical entry.
export function validCollectorQuote(quote){
 const {yesBid,yesAsk,noBid,noAsk}=quote||{};
 return [yesBid,yesAsk,noBid,noAsk].every(v=>typeof v==='number'&&Number.isFinite(v))&&
  yesBid>=0&&noBid>=0&&yesAsk>0&&noAsk>0&&
  yesAsk<1&&noAsk<1&&yesBid<=yesAsk&&noBid<=noAsk;
}
