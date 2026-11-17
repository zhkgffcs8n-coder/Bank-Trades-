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
 const chart=document.getElementById('btcSpotChart')?.closest('section');
 if(chart){chart.classList.add('bt-side-research','bt-radar-chart');left.append(chart);}
 addMarketContext(right);
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
function addMarketContext(column){
 const panel=document.createElement('section');
 panel.id='btRadarMarketContext';panel.className='card bt-side-research';
 const windows=['5m','15m','1h'];
 const tiles=(prefix,labels)=>'<dl class="radar-triple">'+labels.map((label,i)=>'<div><dt>'+label+'</dt><dd data-context="'+prefix+i+'">—</dd></div>').join('')+'</dl>';
 panel.innerHTML=`<h2>Market analysis</h2><h3>Overall lean · BTC spot</h3><meter min="-1" max="1" value="0" aria-label="Bullish versus bearish spot evidence"></meter>
 <p data-context="lean">Waiting for BTC indicators</p>
 <h3>Order flow · taker delta</h3>${tiles('flow',windows)}
 <h3>Order book · top 20 levels</h3><p data-context="book">Waiting for depth</p>
 <h3>Whale flow · fills ≥ $250K</h3>${tiles('whale',windows)}
 <small data-context="source">Full windows required for whale totals.</small>
 <h3>Derivatives</h3>${tiles('deriv',['Funding','Open interest','Long / short'])}
 <h3>Verified forecast scorecard</h3><table><thead><tr><th>Provider</th><th>Rounds</th><th>Brier ↓</th></tr></thead><tbody></tbody></table>
 <small data-context="score">Waiting for verified outcomes</small>
 <h3>OMEGA probability calibration</h3><table><thead><tr><th>Confidence</th><th>Readings</th><th>Actually right</th></tr></thead><tbody data-calibration></tbody></table>`;
 column.append(panel);
 const fields=Object.fromEntries([...panel.querySelectorAll('[data-context]')].map(el=>[el.dataset.context,el]));
 const meter=panel.querySelector('meter'),body=panel.querySelector('tbody'),calibration=panel.querySelector('[data-calibration]');
 const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2});
 const format=(n,digits=2,suffix='')=>Number.isFinite(n)?n.toFixed(digits)+suffix:'—';
 function lean(e){
  const fresh=e&&Date.now()-e.candleAt>=60000&&Date.now()-e.candleAt<180000;
  meter.value=fresh?(e.bull-e.bear)/8:0;
  fields.lean.textContent=fresh?(meter.value>0?'Bullish':meter.value<0?'Bearish':'Neutral')+' · '+meter.value.toFixed(2):'Waiting for BTC indicators';
 }
 window.addEventListener('banktrades:btc-analysis',({detail})=>lean(detail));
 let busy=false;
 async function refresh(){
  if(busy||document.hidden)return;
  busy=true;
  const read=async path=>{
   try{const result=await fetch('/.netlify/functions/'+path,{signal:AbortSignal.timeout(8000)});return result.ok?await result.json():null;}catch{return null;}
  };
  try{
   lean(window.__BANK_TRADES_BTC_EVIDENCE__);
   const [data,research]=await Promise.all([read('radar-market-context'),read('omega-leaderboard')]);
   windows.forEach((window,i)=>{
    const row=data?.slices?.find(r=>r.window===window);
    fields['flow'+i].textContent=format(row?.delta,1,'%');
    fields['whale'+i].textContent=row?.whales?money.format(row.whales.net)+' · '+row.whales.buys+'B / '+row.whales.sells+'S':'Insufficient coverage';
   });
   fields.source.textContent=(data?.source?data.source+' · ':'')+'Full windows required for whale totals.';
   const book=data?.book;
   fields.book.textContent=book?format(book.imbalance,1,'%')+' imbalance · '+format(book.spreadBps,2,' bps')+' spread · Bid wall '+money.format(book.bidWall.usd)+' @ '+book.bidWall.price+' · Ask wall '+money.format(book.askWall.usd)+' @ '+book.askWall.price:'Order book unavailable';
   fields.deriv0.textContent=format(data?.fundingPct,4,'%');
   fields.deriv1.textContent=Number.isFinite(data?.openInterest)?money.format(data.openInterest):'—';
   fields.deriv2.textContent=format(data?.longShort);
   const rows=Array.isArray(research?.scores)?research.scores.slice(0,6):[];
   body.replaceChildren(...rows.map(row=>{
    const tr=document.createElement('tr');
    for(const value of [row.provider,row.verifiedRounds,format(row.brier??row.meanBrier,3)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    return tr;
   }));
   const bins=Array.isArray(research?.calibration)?research.calibration:[];
   calibration.replaceChildren(...bins.map(bin=>{
    const row=document.createElement('tr');
    for(const value of [bin.low+'–'+bin.high+'%',bin.readings,bin.readings?format(bin.actualRate*100,1,'%'):'—']){
     const cell=document.createElement('td');cell.textContent=value;row.append(cell);
    }
    return row;
   }));
   fields.score.textContent=rows.length?(research.historyTruncated?'Partial archive · verified shadow rounds':'Verified shadow rounds · lower Brier is better'):'No verified scorecard available';
  }finally{busy=false;}
 }
 refresh();setInterval(refresh,60000);
}
function stabilizeMarketScroll(desk){
 const scroller=document.scrollingElement;
 if(!scroller||!window.ResizeObserver)return;
 scroller.classList.add('bt-market-scroll-stable');
 let anchor=null,lastInput=0;
 function capture(){
  const rect=desk.getBoundingClientRect();
  anchor=rect.bottom>0&&rect.top<scroller.clientHeight?rect.top:null;

 }
 function release(){
  lastInput=performance.now();
  anchor=null;

 }
 function preserve(){
  if(document.hidden||performance.now()-lastInput<220)return;
  if(anchor===null){capture();return;}
  const shift=desk.getBoundingClientRect().top-anchor;
  if(Math.abs(shift)<1)return;
  scroller.scrollTop+=shift;
  capture();
 }
 const observer=new ResizeObserver(preserve);
 observer.observe(scroller);
 observer.observe(document.body);
 observer.observe(desk);
 for(let node=desk;node&&node!==document.body;node=node.parentElement){
  if(node.parentElement)observer.observe(node.parentElement);
  for(let sibling=node.previousElementSibling;sibling;sibling=sibling.previousElementSibling)observer.observe(sibling);
 }
 let settle;
 window.addEventListener('scroll',()=>{
  clearTimeout(settle);
  settle=setTimeout(capture,240);
 },{passive:true});
 for(const type of ['wheel','touchstart','touchmove','pointerdown','hashchange','resize']){
  window.addEventListener(type,release,{passive:true});
 }
 window.addEventListener('keydown',event=>{
  if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))release();
 });
 window.addEventListener('resize',()=>requestAnimationFrame(capture));
 capture();
}
function arrange(){
 const grid=document.querySelector('.bt-command-grid.bt-command-stacked');
 const middle=grid?.querySelector('.bt-command-middle');
 const signals=document.getElementById('liveTerminal');
 const radar=document.getElementById('btcLockDesk');
 if(!grid||!middle||!signals||!radar)return false;
 if(radar.previousElementSibling!==signals)radar.before(signals);
 const marketDesk=document.getElementById('btcMarketDesk');
 if(marketDesk){grid.after(marketDesk);stabilizeMarketScroll(marketDesk);}
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