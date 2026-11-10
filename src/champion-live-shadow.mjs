import {spotAnalysis} from './champion-spot-evidence.mjs';
import {replayChampionScalper} from './champion-scalper-replay.mjs';

export function championSpotEvidence(data,now=Date.now()){
 if(data?.asset!=='BTC'||!(Math.abs(now-Date.parse(data.fetched_at))<=30000)||!Array.isArray(data.candles))return null;
 const candles=data.candles.filter(p=>[p.t,p.open,p.high,p.low,p.close].every(Number.isFinite)&&
  p.low>0&&p.high>=p.low&&p.open>=p.low&&p.open<=p.high&&p.close>=p.low&&p.close<=p.high&&p.t*1000<now)
  .sort((a,b)=>a.t-b.t);
 return spotAnalysis(candles,'BTC')?.evidence??null;
}

export function observeChampion({market,book,bookSource,evidence,previous,now=Date.now()}){
 if(bookSource!=='KALSHI_WS'||!market||book?.ticker!==market.ticker||
  !(now-book.receivedAt>=0&&now-book.receivedAt<=1500)||
  !(now-book.eventAt>=0&&now-book.eventAt<=4000))return null;
 if(!evidence||!(now-evidence.at>=0&&now-evidence.at<=90000)||
  !(now-evidence.candleAt<=180000&&evidence.candleAt<=evidence.at))return null;
 const left=(Math.min(...[market.expected_expiration_time,market.expiration_time,market.close_time]
  .map(value=>Date.parse(value)).filter(time=>Number.isFinite(time)&&time>now))-now)/1000;
 const secondsLeft=(Date.parse(market.close_time)-now)/1000;
 const upBid=book.yes?.price*100,downBid=book.no?.price*100;
 const upAsk=100-downBid,downAsk=100-upBid;
 if(!(left>0&&left<=900&&secondsLeft>0&&secondsLeft<=900)||
  ![upBid,downBid,upAsk,downAsk].every(p=>p>0&&p<100)||upAsk<upBid||downAsk<downBid)return null;
 const diff=evidence.bull-evidence.bear;
 const side=diff>=3?'up':diff<=-3?'down':'mixed';
 const ask=side==='up'?upAsk:downAsk;
 const strong=side!=='mixed'&&evidence.direction===side&&Math.abs(diff)>=4&&
  Math.max(upAsk-upBid,downAsk-downBid)<=3&&ask>=35&&ask<=80&&left>=180;
 const input={ticker:market.ticker,secondsLeft,side,strong,
  quotes:{up:{ask:upAsk,bid:upBid},down:{ask:downAsk,bid:downBid}}};
 return {...replayChampionScalper(input,previous),ticker:market.ticker,at:now,mode:'SHADOW_ONLY',
  inputs:input,bookAt:book.eventAt,candleAt:evidence.candleAt};
}
