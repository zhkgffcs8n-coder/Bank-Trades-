(() => {
'use strict';
const $=id=>document.getElementById(id),assets=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
const history=new Map();let selected="BTC";let engineSignals=[];
let paperPositions=[];let paperBotRunning=false;let paperStatusError='';
async function refreshPaperPositions(){
 try{
  const response=await fetch('/.netlify/functions/kaibot-state',{cache:'no-store'});
  if(!response.ok){paperStatusError='Paper ledger HTTP '+response.status;syncSignals();return;}
  const data=await response.json();
  paperPositions=Array.isArray(data?.ledger?.trades)?data.ledger.trades:[];
  paperBotRunning=!!data?.state?.running;paperStatusError='';
  syncSignals();
 }catch(e){paperStatusError='Paper positions unavailable';syncSignals();}
}

const roundSeen=new Map();
let latestPositionQuotes=[],latestPositionQuoteAt=0;
const manualPeaks=new Map();
const simulatedCalls=new Map();
function rememberEntryCalls(signals){
 for(const sig of signals){
  if(!['BUY UP','BUY DOWN'].includes(sig?.action))continue;
  const asset=sig.asset,ticker=roundSeen.get(asset)?.ticker;
  const market=latestPositionQuotes.find(x=>x.asset===asset)?.market;
  if(!ticker||market?.ticker!==ticker||Date.now()-latestPositionQuoteAt>10000)continue;
  const side=sig.action==='BUY UP'?'up':'down',entry=price(market,side==='up'?'yes_ask':'no_ask');
  if(!Number.isFinite(entry)||entry<=0||entry>=100)continue;
  const prior=simulatedCalls.get(asset);
  if(prior?.ticker===ticker&&prior.status==='OPEN')continue;
  if(prior?.ticker===ticker&&prior.status==='EXIT')continue;
  simulatedCalls.set(asset,{ticker,side,entry,peak:entry,status:'OPEN',at:Date.now()});
 }
}
function hypotheticalAdvice(asset,sig){
 const p=simulatedCalls.get(asset);if(!p)return null;
 const m=latestPositionQuotes.find(x=>x.asset===asset)?.market;
 if(m?.ticker!==p.ticker||Date.now()-latestPositionQuoteAt>10000)return {action:'⚠️ TRACKED CALL · QUOTE UNAVAILABLE',reason:'Simulated signal only; no verified current exit bid'};
 if(p.status==='EXIT')return {action:'📋 EXIT ALERT ISSUED · AWAIT NEXT ROUND',reason:'Hypothetical exit signal; no Kalshi order was placed'};
 const bid=price(m,p.side==='up'?'yes_bid':'no_bid'),ask=price(m,p.side==='up'?'yes_ask':'no_ask');
 if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid)return {action:'⚠️ HOLD · BID UNAVAILABLE',reason:'Cannot evaluate a reliable sell price'};
 p.peak=Math.max(p.peak,bid);
 const roi=(bid-p.entry)/p.entry,peakGain=(p.peak-p.entry)/p.entry,drawdown=(bid-p.peak)/p.peak;
 const trail=peakGain>=.30?.10:peakGain>=.15?.07:peakGain>=.05?.035:null;
 const stop=roi<=-.12,exit=stop||(trail!==null&&drawdown<=-trail);
 const remaining=(expiry(m)-Date.now())/1000;
 const opposite=sig?.action===(p.side==='up'?'BUY DOWN':'BUY UP');
 const oppositeAsk=price(m,p.side==='up'?'no_ask':'yes_ask');
 if(exit){
  p.status='EXIT';
  return {action:roi>0?'💰 TAKE PROFITS · EXIT ALERT':'🚨 SELL FAST · EXIT ALERT',reason:'Hypothetical '+p.side.toUpperCase()+' · sell bid '+bid.toFixed(1)+'¢ · ROI '+(roi*100).toFixed(1)+'% before fees. No order executed.'};
 }
 if(opposite&&Number.isFinite(oppositeAsk)&&oppositeAsk>0&&oppositeAsk<100)return {action:'🔄 POSSIBLE FLIP · REVIEW',reason:'Opposite BUY signal appeared; compare fees, spread and executable prices. No automatic reversal.'};
 if(remaining>0&&remaining<=90&&bid>=90&&roi>=.10)return {action:'🟢 HOLD TILL END · REVIEW',reason:'Strong current bid but settlement can still reverse; simulated position only.'};
 return {action:'🟢 HOLD · MONITOR',reason:'Hypothetical '+p.side.toUpperCase()+' · entry '+p.entry.toFixed(1)+'¢ · sell bid '+bid.toFixed(1)+'¢ · ROI '+(roi*100).toFixed(1)+'% before fees'};
}
function manualPositionAdvice(asset){
 let p;try{p=JSON.parse(localStorage.getItem('banktrades:manual-positions:v1')||'{}')?.[asset]}catch{return null}
 if(!p)return null;
 const m=latestPositionQuotes.find(x=>x.asset===asset)?.market;
 if(!m||m.ticker!==p.ticker||Date.now()-latestPositionQuoteAt>10000)return {action:'⚠️ POSITION · QUOTE UNAVAILABLE',reason:'Tracked position exists; contract mismatch or stale sell quote. Check Kalshi directly.'};
 const side=String(p.side).toLowerCase(),bid=price(m,side==='up'?'yes_bid':'no_bid'),ask=price(m,side==='up'?'yes_ask':'no_ask'),entry=Number(p.entry);
 if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||bid>ask||ask-bid>5||!Number.isFinite(entry)||entry<=0)return {action:'⚠️ POSITION · NO SELL BID',reason:'Cannot estimate a reliable exit from this quote.'};
 const key=asset+':'+p.ticker+':'+p.at,previous=manualPeaks.get(key)||entry,peak=Math.max(previous,bid);manualPeaks.set(key,peak);
 const roi=(bid-entry)/entry,peakGain=(peak-entry)/entry,drawdown=(bid-peak)/peak;
 const trail=peakGain>=.30?.10:peakGain>=.15?.07:peakGain>=.05?.035:null;
 const expires=expiry(m),secondsLeft=(expires-Date.now())/1000;
 const fees=Number(p.fees)||0,qty=Number(p.qty)||1,net=(bid-entry)*qty/100-fees;
 const sell=roi<=-.12||trail!==null&&drawdown<=-trail;
 const action=sell?(net>0?'💰 TAKE PROFITS / SELL':'🚨 SELL FAST / LOSS REVIEW'):secondsLeft>0&&secondsLeft<=90?'🟡 HOLD / END REVIEW':'🟢 HOLD · MONITOR';
 return {action,reason:'Tracked position; see current bid and position details.'};
}
function syncSignals(){
 document.querySelectorAll('#premiumRows tr').forEach(tr=>{
  const sig=engineSignals.find(x=>x.asset===tr.dataset.asset),cell=tr.children[3];
  if(!cell)return;
  const advice=manualPositionAdvice(tr.dataset.asset);
  const hypothetical=hypotheticalAdvice(tr.dataset.asset,sig);
  const action=sig?.action||'WAIT';
  const ticker=roundSeen.get(tr.dataset.asset)?.ticker;
  const position=paperPositions.find(t=>t.asset===tr.dataset.asset&&t.ticker===ticker);
  // Live signals remain independent recommendations; paper executions are contextual only.
  if(position){
   const side=String(position.side||'').toUpperCase(),status=String(position.status||'').toUpperCase();
   const paper=status==='OPEN'?'📋 PAPER HOLD '+side:status==='CLOSED'?'📋 PAPER EXIT '+side:status==='SETTLED'?'📋 PAPER SETTLED '+side:'📋 PAPER '+status;
   tr.title=paper+' · '+ticker+' · entry '+position.ask+'¢'+(Number.isFinite(Number(position.pnl))?' · P/L $'+Number(position.pnl).toFixed(2):'')+' · Not a real-money order';
  }
  const currentTrades=paperPositions.filter(t=>t.asset===tr.dataset.asset&&t.ticker===ticker);
  const entryCount=currentTrades.length;
  if(entryCount){tr.title=(tr.title||'')+' · '+entryCount+' paper entr'+(entryCount===1?'y':'ies')+' this round';}
  const round=roundSeen.get(tr.dataset.asset);
  if(round&&sig?.roundAssessment?.ticker===round.ticker)tr.title='Round '+round.ticker+' evaluated '+new Date(sig.roundAssessment.evaluatedAt).toLocaleTimeString();

  const why=String(sig?.reason||window.__BANK_TRADES_SHARED_ERROR__||'Signal endpoint has not returned a result');
  const unavailable=!sig||/unavailable|timeout|failed|stale|no verified active contract/i.test(why);
  const sampleIssue=/collecting scheduled samples/i.test(why);
  cell.textContent=action==='BUY UP'?'🟢 BUY UP · SIGNAL':action==='BUY DOWN'?'🔴 BUY DOWN · SIGNAL':action==='SELL FAST'?'🚨 SELL FAST · SIGNAL':action==='HOLD'?'🟡 HOLD · SIGNAL':unavailable?'⚠️ SIGNAL DATA ERROR':sampleIssue?'⏳ WAIT · COLLECTING DATA':'⏳ WAIT · NO QUALIFIED ENTRY';
  if(advice){cell.textContent=advice.action;cell.title=advice.reason;cell.style.whiteSpace='normal';cell.style.overflowWrap='anywhere';cell.className='premium-action'+(/SELL|PROFITS/.test(advice.action)?' sell':' hold');return;}
  if(!advice&&hypothetical){cell.textContent=hypothetical.action;cell.title=hypothetical.reason;cell.style.whiteSpace='normal';cell.className='premium-action hold';return;}
  if(unavailable){cell.textContent='⚠️ '+why.slice(0,95);cell.style.whiteSpace='normal';cell.style.overflowWrap='anywhere';}else{cell.style.whiteSpace='';cell.style.overflowWrap='';}
  // Independent BTC spot evidence is research context, never a trade authorization.
  if(tr.dataset.asset==='BTC'){
   const evidence=window.__BANK_TRADES_BTC_EVIDENCE__;
   const fresh=evidence&&Number.isFinite(evidence.at)&&Date.now()-evidence.at<90000&&Number.isFinite(evidence.candleAt)&&Date.now()-evidence.candleAt<180000;
   const dir=fresh?evidence.direction:'unavailable';
   const context=dir==='up'?'📈 BTC CHART: BULLISH':dir==='down'?'📉 BTC CHART: BEARISH':dir==='mixed'?'↔ BTC CHART: MIXED':'⚠️ BTC CHART: STALE';
   const detail=document.createElement('small');detail.style.display='block';detail.style.fontSize='10px';detail.style.marginTop='4px';detail.style.opacity='.8';
   detail.textContent=context+' · research only';cell.append(detail);
   if(fresh&&['up','down'].includes(dir)&&action==='WAIT'){
    const watch=document.createElement('small');watch.style.display='block';watch.style.fontSize='10px';watch.style.opacity='.8';
    watch.textContent='SPOT '+dir.toUpperCase()+' WATCH · no validated Kalshi entry';cell.append(watch);
   }
   if(fresh&&['up','down'].includes(dir)&&['BUY UP','BUY DOWN'].includes(action)&&dir!==(action==='BUY UP'?'up':'down')){
    cell.firstChild.textContent='⚠️ '+action+' · BTC CHART DISAGREES';
   }
  }
  cell.title=(sig?.reason||'Waiting for shared signal engine')+(ticker?' | Contract '+ticker:'')+' | Paper entries this round: '+entryCount+' | Multiple entries require a new qualified signal and an exited prior position';
  cell.className='premium-action'+(action==='BUY UP'?' up':action==='BUY DOWN'?' down':action==='SELL FAST'?' sell':action==='HOLD'?' hold':'');
  if(sig?.forecast&&sig.forecast.direction){
   const forecast=sig.forecast,side=forecast.direction,details=side==='UP'?forecast.up:forecast.down;
   if(details){
    cell.title=(sig.reason||'')+' | '+forecast.method+' | '+side+' ask '+details.askCents+' cents | Max payout gain $'+details.maxProfitPerContract.toFixed(2)+'; max stake loss $'+details.maxLossPerContract.toFixed(2)+' per contract before fees';
    if(action==='WAIT')cell.textContent='⏳ WAIT · NO QUALIFIED ENTRY';
   }
  }
 });
}
window.addEventListener('banktrades:shared-signals',event=>{engineSignals=Array.isArray(event.detail)?event.detail:[];syncSignals();const s=engineSignals.find(x=>x.asset===selected);if(s)$('premiumAI').textContent=selected+' · '+s.action+' · '+s.reason;});
window.addEventListener('banktrades:signals',event=>{const incoming=Array.isArray(event.detail)?event.detail:[];if(incoming.some(x=>x?.roundAssessment||x?.forecast||x?.position))engineSignals=incoming;else if(!engineSignals.length)engineSignals=incoming;syncSignals();const panel=$('premiumAI');if(!panel)return;const sig=engineSignals.find(s=>s.asset===selected);if(!sig){panel.textContent=selected+' · Waiting for a verified signal evaluation.';return}const action=(sig.action||'WAIT').replace('BUY YES','BUY UP').replace('BUY NO','BUY DOWN');panel.textContent=selected+' · '+action+' · '+(sig.reason||'No reason provided')+(sig.action==='WAIT'?'':' · EXPERIMENTAL — not a calibrated win probability');});
function price(m,k){if(!m)return NaN;return m[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:m[k]!=null?Number(m[k]):NaN}
function expiry(m){for(const k of ['expires_at','expected_expiration_time','expiration_time','close_time']){const t=Date.parse(m?.[k]||'');if(Number.isFinite(t))return t}return NaN}
function cell(tr,v){const td=document.createElement('td');td.textContent=v;tr.append(td);return td}
function chart(){
 const c=$('premiumChart');if(!c||c.dataset.candles==='true')return;
 const rect=c.getBoundingClientRect(),w=Math.max(200,rect.width),h=Math.max(160,rect.height),dpr=Math.min(devicePixelRatio||1,2);
 c.width=w*dpr;c.height=h*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
 ctx.strokeStyle='#283748';ctx.lineWidth=1;
 for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(0,h*i/5);ctx.lineTo(w,h*i/5);ctx.stroke()}
 const pts=history.get(selected)||[];if(pts.length<2){ctx.fillStyle='#9fa9b7';ctx.font='12px system-ui';ctx.fillText('Waiting for fresh '+selected+' samples…',14,24);return}
 const values=pts.map(x=>x.v),lo=Math.min(...values)-0.5,hi=Math.max(...values)+0.5;
 ctx.strokeStyle='#37e1a3';ctx.lineWidth=2.4;ctx.beginPath();
 pts.forEach((p,i)=>{const x=i*w/(pts.length-1),y=h-12-(p.v-lo)/(hi-lo)*(h-25);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
 ctx.fillStyle='#f5c455';ctx.font='bold 12px system-ui';ctx.fillText(pts[pts.length-1].v.toFixed(2)+'¢',12,20);
}
// Foreground-only fast paper exit alerts; does not mutate the server ledger or place orders.
const exitAlerted=new Map();
const paperExitState=new Map();
function monitorPaperExits(results,age){
 if(!paperBotRunning||!Number.isFinite(age)||age<0||age>10000)return;
 const now=Date.now();
 for(const t of paperPositions.filter(x=>x.status==='OPEN')){
  const m=results.find(x=>x.asset===t.asset)?.market;
  if(!m||m.ticker!==t.ticker)continue;
  const bid=price(m,t.side==='up'?'yes_bid':'no_bid');
  const ask=price(m,t.side==='up'?'yes_ask':'no_ask');
  const entry=Number(t.ask);
  if(!Number.isFinite(bid)||!Number.isFinite(ask)||!Number.isFinite(entry)||entry<=0||bid<=0||ask<bid||ask-bid>5)continue;
  const roi=(bid-entry)/entry;
  const prior=paperExitState.get(t.id)||{peak:bid};
  const peak=Math.max(prior.peak,bid);
  paperExitState.set(t.id,{peak,at:now});
  const drawdown=peak>0?(bid-peak)/peak:0;
  // Adaptive paper-only trail: protect smaller observed gains while giving stronger moves room.
  const peakGain=(peak-entry)/entry;
  const trail=peakGain>=.30?.10:peakGain>=.15?.07:peakGain>=.05?.035:null;
  const reason=roi<=-.12?'STOP LOSS':trail!==null&&drawdown<=-trail?'TRAILING EXIT':null;
  if(!reason)continue;
  const key=t.id+':'+reason;
  if(now-(exitAlerted.get(key)||0)<60000)continue;
  exitAlerted.set(key,now);
  const message='PAPER EXIT ALERT · '+t.asset+' '+String(t.side).toUpperCase()+' · '+reason+' · bid '+bid.toFixed(1)+'¢ · estimated '+(roi*100).toFixed(1)+'% before fees. NOT EXECUTED.';
  const panel=$('premiumAI');if(panel)panel.textContent=message;
  window.dispatchEvent(new CustomEvent('banktrades:paper-exit-alert',{detail:{id:t.id,asset:t.asset,ticker:t.ticker,reason,bid,roi,at:now,executed:false}}));
 }
 if(exitAlerted.size>500)exitAlerted.clear();
 if(paperExitState.size>500)paperExitState.clear();
}
let fetching=false,lastFetch=0,failures=0;
async function update(){
 if(fetching||document.hidden||Date.now()-lastFetch<(failures?15000:3000))return;fetching=true;lastFetch=Date.now();
 try{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),11000);
 let r;try{r=await fetch('/api/data?mode=markets',{cache:'no-store',signal:controller.signal})}finally{clearTimeout(timeout)}
 if(!r.ok)throw Error('Feed HTTP '+r.status);
 const d=await r.json(),age=Date.now()-Date.parse(d.fetched_at);
 if(!Array.isArray(d.results)||!Number.isFinite(age)||age>90000||age< -15000)throw Error('Stale or invalid feed');
 latestPositionQuotes=d.results;latestPositionQuoteAt=Date.now();
 monitorPaperExits(d.results,age);
 $('premiumRows').replaceChildren();$('premiumStrip').replaceChildren();
 let open=0;
 for(const asset of assets){
  const row=d.results.find(x=>x.asset===asset),m=row?.market;
  const ya=price(m,'yes_ask'),na=price(m,'no_ask'),yb=price(m,'yes_bid'),nb=price(m,'no_bid');
  const valid=m&&[ya,na,yb,nb].every(Number.isFinite)&&ya>=yb&&na>=nb&&ya>0&&na>0;
  const until=expiry(m)-Date.now(),active=Number.isFinite(until)&&until>0,remaining=!Number.isFinite(until)?'UNKNOWN':until<=0?'ENDED':Math.ceil(until/60000)+'m';
  if(m?.ticker&&active){const previous=roundSeen.get(asset);if(!previous||previous.ticker!==m.ticker){roundSeen.set(asset,{ticker:m.ticker,firstSeen:Date.now()});simulatedCalls.delete(asset);}}
  const tr=document.createElement('tr');tr.dataset.asset=asset;tr.classList.toggle('selected-market',asset===selected);tr.tabIndex=0;tr.setAttribute('aria-label','Show '+asset+' quote chart');const select=()=>{selected=asset;window.dispatchEvent(new CustomEvent('banktrades:select',{detail:asset}));document.querySelectorAll('#premiumRows tr').forEach(x=>x.classList.toggle('selected-market',x===tr));$('premiumChartTitle').textContent=asset+' contract mid-price · browser session';const sig=engineSignals.find(x=>x.asset===asset);$('premiumAI').textContent=sig?asset+' · '+(sig.action||'WAIT').replace('BUY YES','BUY UP').replace('BUY NO','BUY DOWN')+' · '+(sig.reason||'No reason provided'):asset+' · Waiting for signal evaluation.';chart()};tr.addEventListener('click',select);tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}});cell(tr,asset);cell(tr,valid?ya.toFixed(1)+'¢':'—');cell(tr,valid?na.toFixed(1)+'¢':'—');
  const state=cell(tr,valid&&active?(ya<=na?'↑ UP WATCH':'↓ DOWN WATCH'):valid?'CHECK ROUND':'NO QUOTE');state.className='premium-action';state.title='Directional quote watch, not a filled order or guaranteed profit';
  cell(tr,m?remaining:'—');$('premiumRows').append(tr);
  if(valid&&active){open++;const series=history.get(asset)||[];if(series.length&&series[series.length-1].ticker!==m.ticker)series.length=0;series.push({v:(ya+yb)/2,ticker:m.ticker});if(series.length>100)series.shift();history.set(asset,series)}
  if(assets.includes(asset)){
   const tile=document.createElement('div');tile.className='premium-tile';
   const label=document.createElement('small');label.textContent=asset+' · 15M KALSHI';
   const value=document.createElement('b');value.textContent=valid?'UP '+ya.toFixed(1)+'%':'—';
   const meta=document.createElement('small');meta.textContent=valid?remaining:'Market unavailable';
   const down=document.createElement('small');down.textContent=valid?'DOWN '+na.toFixed(1)+'% · UP bid '+yb.toFixed(1)+'%':'Waiting for Kalshi quotes';
   tile.append(label,value,down,meta);$('premiumStrip').append(tile);
  }
 }
 $('premiumHealth').textContent='● '+open+' VERIFIED FEEDS';$('premiumHealth').className='pill green';
 if(!engineSignals.length)$('premiumAI').textContent='Quotes refreshed '+new Date().toLocaleTimeString()+' · Waiting for signal evaluation.';
 failures=0;syncSignals();chart();const header=document.getElementById('health');if(header){header.textContent='● '+open+' MARKET QUOTES LOADED';header.className='pill green';}
 }catch(e){failures++;$('premiumHealth').textContent='● FEED UNAVAILABLE';$('premiumHealth').className='pill red';$('premiumAI').textContent='No signal: '+e.message}
 finally{fetching=false}
}
let signalFetchBusy=false,signalLastFetch=0;
async function refreshSharedSignalTable(){
 if(signalFetchBusy||document.hidden||Date.now()-signalLastFetch<5000)return;
 signalFetchBusy=true;signalLastFetch=Date.now();
 try{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  let response;try{response=await fetch('/.netlify/functions/shared-signals',{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timeout)}
  if(!response.ok)throw Error('Shared signals HTTP '+response.status);
  const payload=await response.json(),ts=Date.parse(payload.fetched_at);
  if(!Array.isArray(payload.results)||!Number.isFinite(ts)||Math.abs(Date.now()-ts)>90000)throw Error('Shared signals response invalid or stale');
  engineSignals=assets.map(asset=>payload.results.find(x=>x.asset===asset)||{asset,action:'WAIT',reason:'No signal returned for '+asset});
  rememberEntryCalls(engineSignals);
  // Notify Learning Lab from the actual server response, not the unrelated quote UI event.
  window.dispatchEvent(new CustomEvent('banktrades:shared-signals',{detail:engineSignals}));
  window.__BANK_TRADES_SHARED_ERROR__=null;
  syncSignals();
  const chosen=engineSignals.find(x=>x.asset===selected),panel=$('premiumAI');
  if(panel&&chosen)panel.textContent=selected+' · '+chosen.action+' · '+(chosen.reason||'No explanation provided');
 }catch(error){
  window.__BANK_TRADES_SHARED_ERROR__=String(error.message||error);
  engineSignals=assets.map(asset=>({asset,action:'WAIT',reason:'Shared signals fetch failed: '+window.__BANK_TRADES_SHARED_ERROR__}));
  syncSignals();
  const panel=$('premiumAI');if(panel)panel.textContent='Signal service error: '+window.__BANK_TRADES_SHARED_ERROR__;
 }finally{signalFetchBusy=false}
}
window.addEventListener('resize',chart);
// Health badge must reflect actual displayed, recently fetched quotes, not an initialization placeholder.
function reconcileHealth(){
 const badge=$('premiumHealth'),rows=$('premiumRows');
 if(!badge||!rows)return;
 const count=[...rows.querySelectorAll('tr')].filter(tr=>tr.children.length===5&&tr.children[1]?.textContent!=='—'&&tr.children[2]?.textContent!=='—'&&tr.children[4]?.textContent!=='ENDED').length;
 const age=Date.now()-lastFetch;
 if(count>0&&failures===0&&age<30000){badge.textContent='● '+count+' QUOTE FEEDS';badge.className='pill green';}
 else if(failures>0){badge.textContent='● FEED ERROR · RETRYING';badge.className='pill red';}
 else if(age>30000){badge.textContent='● QUOTES STALE';badge.className='pill red';}
 else{badge.textContent='● LOADING QUOTES';badge.className='pill';}
}
update();refreshSharedSignalTable();refreshPaperPositions();setInterval(refreshPaperPositions,12000);setInterval(()=>{update();refreshSharedSignalTable();reconcileHealth()},1000);
})();
