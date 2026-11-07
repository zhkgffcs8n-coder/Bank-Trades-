(()=>{'use strict';
const chart=document.getElementById('btcSpotChart');if(!chart)return;
const box=document.createElement('section');box.className='card';box.id='btcLockDesk';box.innerHTML='<h2>🔐 BTC 15-MIN · LOCK & FLIP RADAR</h2><div id="btcLockState" class="notice" role="status" aria-live="polite">Collecting independent candle evidence…</div><p id="btcLockFacts" class="premium-foot">A lock candidate is not a confirmed win. Actual settlement determines the result.</p><p class="premium-foot">Uses completed Coinbase BTC-USD candles plus Kalshi quote agreement. No fixed 93% accuracy claim; not the TradingView proprietary script. Paper research only.</p>';chart.closest('section')?.append(box);
const scalper=document.createElement('section');
scalper.className='card';
scalper.innerHTML='<h2>BTC 15-MIN PRO SCALPER</h2><div class="notice" role="status" aria-live="polite"></div><p class="premium-foot">Research signals only. Entry uses the contract ask. Exit uses the bid. Quote changes exclude fees and do not represent fills.</p>';
box.before(scalper);
const scalpState=scalper.querySelector('.notice');
let tracked=null,busy=false;
function showScalp(message){if(scalpState.textContent!==message)scalpState.textContent=message}
function scalp(market,left,side,strong,quotes){
  const ticker=market.ticker;
  let entered=false;
  if(tracked?.ticker!==ticker)tracked=null;
  if(!tracked){
    if(!strong||left<180||!['up','down'].includes(side)){
      showScalp('NO ENTRY · Waiting for aligned BTC momentum and a tight spread');
      return;
    }
    tracked={ticker,side,entry:quotes[side].ask,exit:null};
    entered=true;
  }
  const quote=quotes[tracked.side];
  const move=quote.bid-tracked.entry;
  if(!tracked.exit){
    if(left<=90)tracked.exit='TIME EXIT';
    else if(move<=-5)tracked.exit='SELL FAST';
    else if(move>=8)tracked.exit='TAKE PROFIT';
    else if(side!=='mixed'&&side!==tracked.side&&strong)tracked.exit='EXIT · MOMENTUM REVERSED';
  }
  if(tracked.exit&&tracked.exitBid==null)tracked.exitBid=quote.bid;
  const displayedBid=tracked.exitBid??quote.bid;
  const displayedMove=displayedBid-tracked.entry;
  const action=tracked.exit||(entered?'BUY ':'HOLD ')+tracked.side.toUpperCase()+(entered?' SETUP':'');
  showScalp(action+' · '+ticker+' · '+Math.ceil(left)+'s left · Entry reference '+tracked.entry.toFixed(1)+'% · '+(tracked.exit?'Exit bid ':'Bid ')+displayedBid.toFixed(1)+'% · Move '+(displayedMove>=0?'+':'')+displayedMove.toFixed(1)+' pts');
}
const state=box.querySelector('#btcLockState'),facts=box.querySelector('#btcLockFacts');let lastDirection='mixed',confirmed=0,history=[];
const price=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:Number(m?.[k]);
async function evaluate(){if(busy)return;busy=true;try{
showScalp('DATA WAIT · Checking the BTC contract and spot feed');const e=window.__BANK_TRADES_BTC_EVIDENCE__;if(!e||Date.now()-e.at>90000||Date.now()-e.candleAt>180000){state.textContent='DATA WAIT · BTC spot candle evidence unavailable or stale';showScalp(state.textContent);return}
let market=null;try{const r=await fetch('/api/data?mode=markets',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(r.ok){const d=await r.json();if(Math.abs(Date.now()-Date.parse(d.fetched_at))<30000)market=(d.results||[]).find(x=>String(x.asset).toUpperCase()==='BTC')?.market}}catch{}
if(!market){state.textContent='DATA WAIT · Kalshi BTC contract unavailable';showScalp(state.textContent);return}
const expiry=Date.parse(market.expires_at),left=(expiry-Date.now())/1000,ya=price(market,'yes_ask'),yb=price(market,'yes_bid'),na=price(market,'no_ask'),nb=price(market,'no_bid');
if(!Number.isFinite(left)||left<=0||left>900||![ya,yb,na,nb].every(Number.isFinite)||ya<yb||na<nb){state.textContent='DATA WAIT · Invalid BTC market or quotes';showScalp(state.textContent);return}
const diff=e.bull-e.bear,side=diff>=3?'up':diff<=-3?'down':'mixed',ask=side==='up'?ya:na,bid=side==='up'?yb:nb,spread=Math.max(ya-yb,na-nb);
const strong=side!=='mixed'&&e.direction===side&&Math.abs(diff)>=4&&spread<=3&&ask>=35&&ask<=80&&left>=180;
const closeLeft=(Date.parse(market.close_time)-Date.now())/1000;
if(/^KXBTC15M-/.test(market.ticker)&&closeLeft>0&&closeLeft<=900&&
    [ya,yb,na,nb].every(value=>value>0&&value<100)){
  scalp(market,closeLeft,side,strong,{up:{ask:ya,bid:yb},down:{ask:na,bid:nb}});
}else{
  showScalp('DATA WAIT · No open BTC 15-minute contract with valid quotes');
}
const quality=Math.max(0,Math.min(100,Math.round(35+Math.min(30,Math.abs(diff)*6)+Math.max(0,3-spread)*6+(left>=360?10:0))));
if(side!=='mixed'&&side===lastDirection)confirmed++;else confirmed=1;
const flipped=lastDirection!=='mixed'&&side!=='mixed'&&side!==lastDirection;
lastDirection=side;
const label=flipped?'⚡ POSSIBLE FLIP '+side.toUpperCase():strong&&confirmed>=2?'🔐 '+side.toUpperCase()+' LOCK CANDIDATE':side!=='mixed'?'EARLY LEAN '+side.toUpperCase():'MIXED · NO LOCK';
state.textContent=label+' · '+Math.ceil(left/60)+' min remaining · '+(strong?'Spot/Kalshi evidence aligned':'Not enough independent agreement');
facts.textContent='Evidence quality '+quality+'/100 · Bull '+e.bull+'/8 · Bear '+e.bear+'/8 · RSI '+Number(e.rsi).toFixed(1)+' · '+(side==='mixed'?'No direction':'Contract ask '+ask.toFixed(1)+'¢ / bid '+bid.toFixed(1)+'¢')+' · spread '+spread.toFixed(1)+'¢ · '+confirmed+' consecutive assessments. Quality is a rule score, not win probability. Lock candidate ≠ settled win.';
window.__BANK_TRADES_BTC_LOCK__={at:Date.now(),direction:side,lockCandidate:strong&&confirmed>=2,flipCandidate:flipped,secondsLeft:left,spread,ask,bid,quality,source:'BTC spot indicators and Kalshi quotes'};
if(flipped){window.dispatchEvent(new CustomEvent('banktrades:btc-flip',{detail:window.__BANK_TRADES_BTC_LOCK__}))}
}finally{busy=false}}
showScalp('DATA WAIT · Checking the BTC contract and spot feed');
evaluate();setInterval(()=>{if(!document.hidden)evaluate()},30000);
})();