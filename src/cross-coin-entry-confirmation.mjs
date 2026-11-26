const QUOTE_AGE_MS=5000;
const MIN_CONFIRMATION_MS=1000;
const MIN_TIME_LEFT_MS=60000;
const MAX_TIME_LEFT_MS=360000;

export function crossCoinEntryCheck({candidate,previous,current,now=Date.now()}){
 const {ticker,direction,close}=candidate??{};
 if(!ticker||!['UP','DOWN'].includes(direction)||!Number.isFinite(close)||
  close-now<MIN_TIME_LEFT_MS||close-now>MAX_TIME_LEFT_MS)return 'OUTSIDE_ENTRY_WINDOW';
 const opposing=direction==='UP'?'DOWN':'UP';
 if(!previous||!current||previous.close!==close||current.close!==close||
  !Number.isFinite(previous.at)||!Number.isFinite(current.at)||
  current.at>now||now-previous.at>QUOTE_AGE_MS||current.at-previous.at<MIN_CONFIRMATION_MS)
  return 'WAITING_FOR_FRESH_CONFIRMATION';
 for(const sample of [previous,current]){
  const assets=new Set(),aligned=new Set();
  for(const row of sample.rows??[]){
   if(!row.asset||row.close!==close||!Number.isFinite(row.at)||row.at>sample.at||sample.at-row.at>QUOTE_AGE_MS)continue;
   if(assets.has(row.asset))return 'DUPLICATE_ASSET_QUOTE';
   assets.add(row.asset);
   if(row.direction===direction)aligned.add(row.asset);
  }
  if(assets.size<5||aligned.size<Math.ceil(assets.size*0.75))return 'WEAK_GROUP_ALIGNMENT';
 }
 const before=previous.rows.find(row=>row.ticker===ticker),latest=current.rows.find(row=>row.ticker===ticker);
 if(!before||!latest||before.close!==close||latest.close!==close||
  ![before.at,latest.at].every(at=>Number.isFinite(at)&&now-at>=0&&now-at<=QUOTE_AGE_MS)||
  latest.at<=before.at)return 'TARGET_QUOTE_NOT_CONFIRMED';
 if(before.direction!==direction||latest.direction!==direction||latest.flipWatch===opposing)return 'TARGET_FLIP_RISK';
 if(![before.bid,before.ask,latest.bid,latest.ask].every(Number.isFinite)||
  latest.ask<40||latest.ask>80||latest.bid<=0||latest.ask<latest.bid||latest.ask-latest.bid>4)
  return 'ENTRY_QUOTE_OUTSIDE_LIMITS';
 if(latest.bid<before.bid||latest.ask<before.ask)return 'TARGET_MOVING_AGAINST_CALL';
 return 'QUALIFIED';
}
