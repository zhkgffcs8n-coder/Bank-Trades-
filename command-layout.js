(()=>{'use strict';
function addResearchPanels(grid){
 const left=grid.querySelector('.bt-command-left'),right=grid.querySelector('.bt-command-right');
 if(!left||!right||document.getElementById('btTechnicalSide'))return;
 const technical=document.createElement('section'),performance=document.createElement('section');
 technical.id='btTechnicalSide';performance.id='btPerformanceSide';
 technical.className=performance.className='card bt-side-research';
 technical.innerHTML=`<h2>BTC technical analysis</h2><p data-ta="lean">Waiting for completed Coinbase candles</p>
 <dl><div><dt>EMA 9 / 21 / 50</dt><dd data-ta="ema">—</dd></div><div><dt>RSI 14</dt><dd data-ta="rsi">—</dd></div>
 <div><dt>MACD histogram</dt><dd data-ta="macd">—</dd></div><div><dt>Volume vs 20-bar average</dt><dd data-ta="vol">—</dd></div>
 <div><dt>Support</dt><dd data-ta="support">—</dd></div><div><dt>Resistance</dt><dd data-ta="resistance">—</dd></div>
 <div><dt>1-minute candle range</dt><dd data-ta="range">—</dd></div><div><dt>Range sweep</dt><dd data-ta="sweep">—</dd></div></dl>
 <a href="#btcSpotChart">View BTC candles and EMA overlays ↓</a>`;
 performance.innerHTML=`<h2>Market spreads &amp; scorecard</h2><p>Kalshi BTC · live top of book</p>
 <dl><div><dt>UP spread</dt><dd data-score="up">—</dd></div><div><dt>DOWN spread</dt><dd data-score="down">—</dd></div></dl>
 <h3>Paper session performance</h3><dl><div><dt>Wins</dt><dd data-score="wins">—</dd></div>
 <div><dt>Losses</dt><dd data-score="losses">—</dd></div><div><dt>Profitable closes</dt><dd data-score="rate">—</dd></div>
 <div><dt>Realized net P&amp;L</dt><dd data-score="net">—</dd></div></dl>
 <small data-score="status">Waiting for the paper ledger</small>`;
 left.append(technical);right.append(performance);
 const timeframes=document.getElementById('spotTimeframePanel');
 if(timeframes){timeframes.classList.add('bt-side-research');right.append(timeframes);}
 const fields=Object.fromEntries([...technical.querySelectorAll('[data-ta]')].map(el=>[el.dataset.ta,el]));
 const scores=Object.fromEntries([...performance.querySelectorAll('[data-score]')].map(el=>[el.dataset.score,el]));
 const price=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
 const number=(value,digits=1)=>Number.isFinite(value)?value.toFixed(digits):'—';
 function renderAnalysis(e){
  const fresh=e&&Date.now()-e.candleAt>=60000&&Date.now()-e.candleAt<180000;
  fields.lean.textContent=fresh?(e.direction==='mixed'?'Mixed':e.direction==='up'?'Bullish':'Bearish')+' · '+e.bull+'/8 bullish vs '+e.bear+'/8 bearish':'Waiting for fresh completed Coinbase candles';
  fields.lean.dataset.tone=fresh?e.direction:'';
  fields.ema.textContent=fresh?[e.ema9,e.ema21,e.ema50].map(v=>number(v,2)).join(' / '):'—';
  fields.rsi.textContent=fresh?number(e.rsi):'—';
  fields.macd.textContent=fresh?number(e.macdHistogram,2):'—';
  fields.vol.textContent=fresh&&Number.isFinite(e.volumeRatio)?number(e.volumeRatio,2)+'×':'—';
  fields.range.textContent=fresh?number(e.rangePct,3)+'%':'—';
  fields.support.textContent=fresh?price.format(e.support):'—';
  fields.resistance.textContent=fresh?price.format(e.resistance):'—';
  fields.sweep.textContent=fresh?(e.lowSweep&&e.highSweep?'Both sides':e.lowSweep?'Support swept':e.highSweep?'Resistance swept':'None'):'—';
 }
 window.addEventListener('banktrades:btc-analysis',({detail})=>renderAnalysis(detail));
 window.addEventListener('banktrades:paper-score',({detail:d})=>{
  if(!d){
   for(const key of ['wins','losses','rate','net'])scores[key].textContent='—';
   scores.status.textContent='Paper ledger unavailable';
   return;
  }
  scores.wins.textContent=d.wins;scores.losses.textContent=d.losses;
  scores.rate.textContent=d.closed?number(100*d.wins/d.closed)+'%':'—';
  scores.net.textContent=price.format(d.net);
  scores.status.textContent=d.closed?d.closed+' closed paper trades':'No closed paper trades';
 });
 let book;
 window.addEventListener('banktrades:premium-contracts',({detail})=>{book=detail;paint();});
 function paint(){
  const now=Date.now(),btc=book?.contracts.find(c=>c.asset==='BTC'&&c.close>now);
  const fresh=btc&&now-book.fetched>=0&&now-book.fetched<15000;
  scores.up.textContent=fresh?number(btc.yesAsk-btc.yesBid)+' pts':'—';
  scores.down.textContent=fresh?number(btc.noAsk-btc.noBid)+' pts':'—';
 }
 setInterval(()=>{if(!document.hidden){paint();renderAnalysis(window.__BANK_TRADES_BTC_EVIDENCE__);}},1000);
 renderAnalysis(window.__BANK_TRADES_BTC_EVIDENCE__);
}
function arrange(){
 const grid=document.querySelector('.bt-command-grid.bt-command-stacked');
 const middle=grid?.querySelector('.bt-command-middle');
 const signals=document.getElementById('liveTerminal');
 const radar=document.getElementById('btcLockDesk');
 if(!grid||!middle||!signals||!radar)return false;
 if(radar.previousElementSibling!==signals)radar.before(signals);
 const marketDesk=document.getElementById('btcMarketDesk');
 if(marketDesk)grid.after(marketDesk);
 const lower=document.getElementById('btLowerCommandRow');
 if(lower){const easy=document.getElementById('quickAssets')?.closest('.card');const desk=document.getElementById('signalDesk');if(easy&&easy.parentElement===lower)grid.querySelector('.bt-command-left')?.append(easy);if(desk&&desk.parentElement===lower)grid.querySelector('.bt-command-right')?.append(desk);lower.remove()}
 grid.classList.remove('bt-command-bottom-filled');
 grid.classList.add('bt-command-professional','bt-compact-live-signals');
 addResearchPanels(grid);
 return true;
}
if(!arrange()){
 const observer=new MutationObserver(()=>{if(arrange())observer.disconnect()});
 observer.observe(document.body,{subtree:true,childList:true});
 setTimeout(()=>observer.disconnect(),15000);
}
})();