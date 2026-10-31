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
function syncSignals(){
 document.querySelectorAll('#premiumRows tr').forEach(tr=>{
  const sig=engineSignals.find(x=>x.asset===tr.dataset.asset),cell=tr.children[3];
  if(!cell)return;
  const action=sig?.action||'WAIT';
  const ticker=roundSeen.get(tr.dataset.asset)?.ticker;
  const position=paperPositions.find(t=>t.asset===tr.dataset.asset&&t.ticker===ticker);
  // Live signals remain independent recommendations; paper executions are contextual only.
  if(position){
   const side=String(position.side||'').toUpperCase(),status=String(position.status||'').toUpperCase();
   const paper=status==='OPEN'?'📋 PAPER HOLD '+side:status==='CLOSED'?'📋 PAPER EXIT '+side:status==='SETTLED'?'📋 PAPER SETTLED '+side:'📋 PAPER '+status;
   tr.title=paper+' · '+ticker+' · entry '+position.ask+'¢'+(Number.isFinite(Number(position.pnl))?' · P/L $'+Number(position.pnl).toFixed(2):'')+' · Not a real-money order';
  }
  const round=roundSeen.get(tr.dataset.asset);
  if(round&&sig?.roundAssessment?.ticker===round.ticker)tr.title='Round '+round.ticker+' evaluated '+new Date(sig.roundAssessment.evaluatedAt).toLocaleTimeString();

  cell.textContent=action==='BUY UP'?'🟢 BUY UP · SIGNAL':action==='BUY DOWN'?'🔴 BUY DOWN · SIGNAL':action==='SELL FAST'?'🚨 SELL FAST · SIGNAL':action==='HOLD'?'🟡 HOLD · SIGNAL':'⏳ WAIT · NO VERIFIED EDGE';
  cell.title=sig?.reason||'Waiting for shared signal engine';
  cell.className='premium-action'+(action==='BUY UP'?' up':action==='BUY DOWN'?' down':action==='SELL FAST'?' sell':action==='HOLD'?' hold':'');
  if(sig?.forecast&&sig.forecast.direction){
   const forecast=sig.forecast,side=forecast.direction,details=side==='UP'?forecast.up:forecast.down;
   if(details){
    cell.title=(sig.reason||'')+' | '+forecast.method+' | '+side+' ask '+details.askCents+' cents | Max payout gain $'+details.maxProfitPerContract.toFixed(2)+'; max stake loss $'+details.maxLossPerContract.toFixed(2)+' per contract before fees';
    if(action==='WAIT')cell.textContent='⏳ WAIT · '+side+' WATCH';
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
let fetching=false,lastFetch=0,failures=0;
async function update(){
 if(fetching||document.hidden||Date.now()-lastFetch<(failures?15000:3000))return;fetching=true;lastFetch=Date.now();
 try{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),11000);
 let r;try{r=await fetch('/api/data?mode=markets',{cache:'no-store',signal:controller.signal})}finally{clearTimeout(timeout)}
 if(!r.ok)throw Error('Feed HTTP '+r.status);
 const d=await r.json(),age=Date.now()-Date.parse(d.fetched_at);
 if(!Array.isArray(d.results)||!Number.isFinite(age)||age>90000||age< -15000)throw Error('Stale or invalid feed');
 $('premiumRows').replaceChildren();$('premiumStrip').replaceChildren();
 let open=0;
 for(const asset of assets){
  const row=d.results.find(x=>x.asset===asset),m=row?.market;
  const ya=price(m,'yes_ask'),na=price(m,'no_ask'),yb=price(m,'yes_bid'),nb=price(m,'no_bid');
  const valid=m&&[ya,na,yb,nb].every(Number.isFinite)&&ya>=yb&&na>=nb&&ya>0&&na>0;
  const until=expiry(m)-Date.now(),active=Number.isFinite(until)&&until>0,remaining=!Number.isFinite(until)?'UNKNOWN':until<=0?'ENDED':Math.ceil(until/60000)+'m';
  if(m?.ticker&&active){const previous=roundSeen.get(asset);if(!previous||previous.ticker!==m.ticker)roundSeen.set(asset,{ticker:m.ticker,firstSeen:Date.now()});}
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
update();refreshPaperPositions();setInterval(refreshPaperPositions,12000);setInterval(()=>{update();reconcileHealth()},1000);
})();
