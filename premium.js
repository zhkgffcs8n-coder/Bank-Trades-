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

// Lightweight comic-style signal effects; respect reduced-motion settings.
const signalVisualState=new Map();
const signalFxStyle=document.createElement('style');
signalFxStyle.textContent=`
@keyframes btComicPop{0%{transform:scale(.96);filter:brightness(1.6)}45%{transform:scale(1.035)}100%{transform:scale(1);filter:brightness(1)}}
@keyframes btComicGlow{0%,100%{box-shadow:0 0 0 1px currentColor,0 0 12px rgba(255,255,255,.08)}50%{box-shadow:0 0 0 3px currentColor,0 0 22px currentColor}}
#premiumRows tr.bt-buy-up td:nth-child(4){color:#4ade80!important;border-radius:12px;border:2px solid #22c55e!important;text-shadow:0 1px 4px #052e16}
#premiumRows tr.bt-buy-down td:nth-child(4){color:#fda4af!important;border-radius:12px;border:2px solid #fb7185!important;text-shadow:0 1px 4px #450a0a}
#premiumRows tr.bt-signal-new td:nth-child(4){animation:btComicPop .55s cubic-bezier(.18,1.5,.38,1),btComicGlow 1.4s ease-in-out 2}
@media(prefers-reduced-motion:reduce){#premiumRows tr.bt-signal-new td:nth-child(4){animation:none}}
@media(min-width:900px){
 #premiumRows tr td{padding-top:4px!important;padding-bottom:4px!important;vertical-align:middle!important}
 #premiumRows tr td:nth-child(4){line-height:1.18!important}
 #premiumRows tr td.bt-compact-signal[data-compact="true"] small{display:none!important}
 #premiumRows tr td.bt-compact-signal[data-compact="true"] small:nth-of-type(1){display:none!important}
 #premiumRows tr td.bt-compact-signal{cursor:pointer}
 #premiumRows tr td.bt-compact-signal[data-compact="false"] small{display:block!important}
}

`;
document.head.appendChild(signalFxStyle);
const roundSeen=new Map();
let latestPositionQuotes=[],latestPositionQuoteAt=0;
const manualPeaks=new Map();
const callKey='banktrades:signal-positions:v2';
let savedCalls={};try{savedCalls=JSON.parse(localStorage.getItem(callKey)||'{}')}catch{}
const simulatedCalls=new Map(Object.entries(savedCalls));
function saveCalls(){try{localStorage.setItem(callKey,JSON.stringify(Object.fromEntries(simulatedCalls)))}catch{}}
function positionAdvice(p,m,quoteAt,sig){
 const side=String(p.side).toLowerCase(),entry=Number(p.entry),qty=Number(p.qty)||1,fees=Number(p.fees)||0;
 if(!['up','down'].includes(side)||!Number.isFinite(entry)||entry<=0||entry>=100)return {action:'INVALID POSITION',reason:'Verify entry details.'};
 if(m?.ticker!==p.ticker||Date.now()>=expiry(m))return {action:side.toUpperCase()+' · CONTRACT ENDED / CHANGED',reason:'Verify settlement on Kalshi. No current exit valuation.'};
 const bid=price(m,side==='up'?'yes_bid':'no_bid'),ask=price(m,side==='up'?'yes_ask':'no_ask');
 if(!Number.isFinite(quoteAt)||Date.now()-quoteAt<0||Date.now()-quoteAt>15000||![bid,ask].every(Number.isFinite)||bid<0||ask>100||ask<bid)return {action:side.toUpperCase()+' · QUOTE UNAVAILABLE',reason:'Fresh matching bid required; no exit estimate.'};
 p.peak=Math.max(Number(p.peak)||entry,bid);
 const pnl=(bid-entry)*qty/100-fees,roi=(bid-entry)/entry,peakGain=(p.peak-entry)/entry;
 const trail=peakGain>=.30?.10:peakGain>=.15?.07:peakGain>=.05?.035:null;
 const reversal=sig?.ticker===p.ticker&&sig.action===(side==='up'?'BUY DOWN':'BUY UP');
 const trailing=trail!==null&&(p.peak-bid)/p.peak>=trail;
 const ending=expiry(m)-Date.now()<=30000;
 const exit=roi<=-.12||trailing||reversal||ending;
 const action=exit?(pnl>0?'CASH OUT':'SELL FAST'):'HOLD';
 const reason=roi<=-.12?'Loss threshold reached':trailing?'Profit pulled back from peak':reversal?'Opposite entry signal':ending?'Contract nearing expiry':'Monitoring profit and reversal';
 return {action:side.toUpperCase()+' · '+action,reason:reason+' · Entry '+entry.toFixed(1)+'% · Sell bid '+bid.toFixed(1)+'% · P/L '+(pnl>=0?'+':'−')+'$'+Math.abs(pnl).toFixed(2)+' · Gross return '+(roi*100).toFixed(1)+'% · '+qty+' contract(s) · fees included $'+fees.toFixed(2)+'. Estimated at bid; no order executed.',pnl,roi,bid,exit};
}
window.bankPositionAdvice=positionAdvice;
function rememberEntryCalls(signals){
 for(const sig of signals){
  if(!['BUY UP','BUY DOWN'].includes(sig?.action))continue;
  const m=latestPositionQuotes.find(x=>x.asset===sig.asset)?.market;
  if(!m?.ticker||sig.ticker!==m.ticker||Date.now()-latestPositionQuoteAt>10000||expiry(m)<=Date.now())continue;
  const side=sig.action==='BUY UP'?'up':'down',key=sig.asset+':'+side,prior=simulatedCalls.get(key);
  if(prior?.ticker===m.ticker)continue;
  const entry=price(m,side==='up'?'yes_ask':'no_ask');
  if(!Number.isFinite(entry)||entry<=0||entry>=100)continue;
  simulatedCalls.set(key,{ticker:m.ticker,side,entry,peak:entry,qty:1,fees:0,at:Date.now()});
 }
 saveCalls();
}
function hypotheticalAdvice(asset,sig){
 const m=latestPositionQuotes.find(x=>x.asset===asset)?.market;
 const advice=['up','down'].map(side=>simulatedCalls.get(asset+':'+side)).filter(p=>p?.ticker===m?.ticker).map(p=>positionAdvice(p,m,latestPositionQuoteAt,sig));
 saveCalls();
 if(!advice.length)return null;
 return {action:advice.map(x=>x.action).join(' | '),reason:advice.map(x=>x.action+' · '+x.reason).join(' | ')};
}
function manualPositionAdvice(asset){
 let p;try{p=JSON.parse(localStorage.getItem('banktrades:manual-positions:v1')||'{}')[asset]}catch{}
 if(!p)return null;
 const key=asset+':'+p.ticker+':'+p.at;p.peak=manualPeaks.get(key)||p.entry;
 const advice=positionAdvice(p,latestPositionQuotes.find(x=>x.asset===asset)?.market,latestPositionQuoteAt,engineSignals.find(x=>x.asset===asset));
 manualPeaks.set(key,p.peak);return advice;
}
// Large in-page visual alerts. Only works while the dashboard page is active.
let screenAlertsEnabled=false;
try{screenAlertsEnabled=localStorage.getItem('banktrades:screen-alerts-enabled')==='true';}catch{}
const seenScreenAlerts=new Set();
function showScreenAlert(asset,kind,label,ticker,isTest=false){
 if((!screenAlertsEnabled&&!isTest)||document.hidden)return;
 const key=[asset,kind,label,ticker].join('|');
 if(!isTest){if(seenScreenAlerts.has(key))return;seenScreenAlerts.add(key);if(seenScreenAlerts.size>150)seenScreenAlerts.clear();}
 let overlay=document.getElementById('bankScreenAlert');
 if(!overlay){
  const style=document.createElement('style');
  style.textContent='@keyframes bankAlertPulse{0%,100%{opacity:.10}50%{opacity:.28}}@media(prefers-reduced-motion:reduce){#bankScreenAlert .bank-flash{animation:none!important}}#bankScreenAlert{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;color:white;font-family:system-ui,sans-serif}#bankScreenAlert .bank-flash{position:absolute;inset:0;pointer-events:none;animation:bankAlertPulse 1.1s ease-in-out 2}#bankScreenAlert .bank-box{position:relative;max-width:680px;width:100%;border:4px solid white;border-radius:28px;padding:28px 20px;background:#111b27;box-shadow:0 0 36px currentColor,0 0 0 9999px rgba(0,0,0,.55)}#bankScreenAlert .bank-head{font-size:clamp(28px,7vw,64px);font-weight:900}#bankScreenAlert button{margin-top:24px;font-size:22px;font-weight:800;padding:14px 35px;border:0;border-radius:12px;cursor:pointer}';
  document.head.append(style);
  overlay=document.createElement('div');overlay.id='bankScreenAlert';overlay.setAttribute('role','alertdialog');overlay.setAttribute('aria-modal','true');
  overlay.innerHTML='<div class="bank-flash"></div><div class="bank-box"><div class="bank-head"></div><p class="bank-detail" style="font-size:clamp(18px,3vw,27px)"></p><p style="font-size:14px">Signal guidance only · no order placed · verify live Kalshi price</p><button type="button">DISMISS</button></div>';
  overlay.querySelector('button').addEventListener('click',()=>{clearTimeout(overlay._autoDismissTimer);overlay.remove();});
 }
 document.body.append(overlay);
 const color=kind==='sell'||kind==='down'?'#ed2929':kind==='up'?'#16a34a':kind==='hold'?'#a78bfa':'#eab308';
 overlay.querySelector('.bank-flash').style.background=color;
 overlay.querySelector('.bank-box').style.borderColor=color;
 overlay.querySelector('.bank-head').textContent=asset+' · 15-MIN KALSHI · '+(kind==='sell'?'🚨 SELL / EXIT':kind==='down'?'🔴 BUY DOWN':kind==='up'?'🟢 BUY UP':kind==='hold'?'🟣 HOLD TILL END · REVIEW':'🟡 DEMO / WAIT');
 overlay.querySelector('.bank-detail').textContent=(isTest?'DEMO ONLY · NO REAL TRADE · ':'')+label;
 clearTimeout(overlay._autoDismissTimer);
 overlay._autoDismissTimer=setTimeout(()=>{if(overlay.isConnected)overlay.remove();},2000);
 overlay.querySelector('button').focus();
}
const voicedMarketStatuses=new Set();
function evaluateLiveVoiceAlerts(){
 if(document.hidden||Date.now()-latestPositionQuoteAt>10000)return;
 for(const tr of document.querySelectorAll('#premiumRows tr')){
  const asset=tr.dataset.asset,ticker=roundSeen.get(asset)?.ticker;
  const label=tr.children[3]?.textContent||'';
  if(!ticker)continue;
  let action=null;
  if(/SELL FAST|CASH OUT|TAKE PROFITS|EXIT ALERT/.test(label))action=/CASH OUT|TAKE PROFITS/.test(label)?'CASH OUT':'SELL FAST';
  else if(/POSSIBLE FLIP/.test(label))action='POSSIBLE FLIP';
  else if(/BUY UP/.test(label))action='BUY UP';
  else if(/BUY DOWN/.test(label))action='BUY DOWN';
  if(!action)continue;
  const key=[asset,ticker,action].join('|');
  if(voicedMarketStatuses.has(key))continue;
  voicedMarketStatuses.add(key);if(voicedMarketStatuses.size>200)voicedMarketStatuses.clear();
  window.dispatchEvent(new CustomEvent('banktrades:live-voice-alert',{detail:{asset,ticker,action}}));
 }
}
function evaluateScreenAlerts(){
 if(!screenAlertsEnabled||document.hidden)return;
 for(const tr of document.querySelectorAll('#premiumRows tr')){
  const asset=tr.dataset.asset,label=tr.children[3]?.textContent||'';
  const ticker=roundSeen.get(asset)?.ticker;
  if(!ticker)continue;
  const signal=engineSignals.find(x=>x.asset===asset&&x.ticker===ticker);
  // Read the final qualified action, not explanatory text such as
  // "MOMENTUM CALLED BUY DOWN · BLOCKED" or non-actionable RESEARCH.
  const action=signal?.action;
  const manual=manualPositionAdvice(asset);
  const hypothetical=hypotheticalAdvice(asset,signal);
  const trackedExit=manual||hypothetical;
  const exitText=trackedExit?.action||'';
  const isExit=/SELL FAST|CASH OUT|TAKE PROFITS|SELL\b|EXIT ALERT/.test(exitText);
  const isHoldReview=/HOLD TILL END · REVIEW/.test(exitText);
  const kind=isExit?'sell':isHoldReview?'hold':action==='BUY UP'?'up':action==='BUY DOWN'?'down':action==='SELL FAST'?'sell':null;
  if(kind){
   const message=(isExit||isHoldReview)?exitText+' · '+(trackedExit.reason||'Tracked position review'):
    kind==='up'?'Qualified paper signal: BUY UP':kind==='down'?'Qualified paper signal: BUY DOWN':'Paper position SELL FAST';
   showScreenAlert(asset,kind,message,ticker);
  }
 }
}
document.addEventListener('DOMContentLoaded',()=>{
 const button=document.getElementById('enablePush');if(!button)return;
 const style=document.createElement('style');
 style.textContent='#enablePush[data-screen-alerts="on"]{background:#facc15!important;color:#171717!important;border:4px solid #fff176!important;box-shadow:0 0 0 3px #dca900,0 0 18px rgba(250,204,21,.55)!important;font-weight:900!important}';
 document.head.append(style);
 const testButton=document.createElement('button');
 testButton.type='button';testButton.id='bankTestScreenAlerts';
 testButton.textContent='🧪 TEST SCREEN ALERTS';
 testButton.style.cssText='margin-left:8px;padding:12px;border:2px solid #facc15;border-radius:10px;font-weight:800;cursor:pointer;background:#273449;color:#fff';
 button.insertAdjacentElement('afterend',testButton);
 const researchNotice=document.createElement('div');
 researchNotice.id='bankResearchSignalNotice';
 researchNotice.style.cssText='margin:8px 0;padding:9px 12px;border:2px solid #facc15;border-radius:9px;background:rgba(250,204,21,.18);color:#fde68a;font-size:13px;font-weight:900;line-height:1.4';
 researchNotice.textContent='⚠️ R: UP ↗ / R: DOWN ↘ ARE RESEARCH ONLY — NOT OFFICIAL BUY SIGNALS. Wait for a qualified BUY UP or BUY DOWN alert. Test screen alerts are demos; no trades are placed automatically.';
 testButton.insertAdjacentElement('afterend',researchNotice);
 let nextTest='buy';
 testButton.addEventListener('click',()=>{
  if(document.hidden)return;
  const kind=nextTest;nextTest=kind==='buy'?'sell':'buy';
  showScreenAlert('BTC',kind==='buy'?'up':'sell',kind==='buy'?'DEMO BUY UP — GREEN SCREEN TEST':'DEMO SELL FAST — RED SCREEN TEST','demo',true);
  testButton.textContent=kind==='buy'?'🧪 TEST RED EXIT NEXT':'🧪 TEST GREEN ENTRY NEXT';
 });
 const paint=()=>{
  button.dataset.screenAlerts=screenAlertsEnabled?'on':'off';
  button.setAttribute('aria-pressed',String(screenAlertsEnabled));
  button.textContent=screenAlertsEnabled?'🔔 SCREEN ALERTS ON':'🔔 ENABLE SCREEN ALERTS';
  button.title=screenAlertsEnabled?'Green entry / red exit screen alerts ON while dashboard is open. Background push not configured.':'Turn on green entry / red exit screen alerts while dashboard is open.';
 };
 button.addEventListener('click',()=>{
  screenAlertsEnabled=!screenAlertsEnabled;
  try{localStorage.setItem('banktrades:screen-alerts-enabled',String(screenAlertsEnabled));}catch{}
  if(!screenAlertsEnabled)document.getElementById('bankScreenAlert')?.remove();
  paint();
  if(screenAlertsEnabled)evaluateScreenAlerts();
 });
 paint();
});
if(!document.getElementById('btFlipPulseStyle')){const style=document.createElement('style');style.id='btFlipPulseStyle';style.textContent='@keyframes btFlipPulse{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.07);filter:brightness(1.9)}}';document.head.append(style);}
const flipWatchHistory=new Map();
function flipWatchFor(asset,sig,ticker){
 const call=sig?.roundCall;
 if(!ticker||call?.ticker!==ticker||!['UP','DOWN'].includes(call.direction)||
    !Number.isFinite(call.asOf)||Date.now()-call.asOf>90000)return null;
 const prev=flipWatchHistory.get(asset);
 const direction=call.direction;
 const changed=prev&&prev.ticker===ticker&&prev.direction!==direction&&call.basis==='observed same-round momentum'&&prev.observed;
 const flippedAt=changed?Date.now():prev?.ticker===ticker?prev.flippedAt:0;
 flipWatchHistory.set(asset,{ticker,direction,flippedAt,observed:call.basis==='observed same-round momentum'});
 return {direction,recentFlip:!!flippedAt&&Date.now()-flippedAt<60000,observed:call.basis==='observed same-round momentum'};
}
function syncSignals(){
 document.querySelectorAll('#premiumRows tr').forEach(tr=>{
  const sig=engineSignals.find(x=>x.asset===tr.dataset.asset),cell=tr.children[3];
  if(!cell)return;
  const advice=manualPositionAdvice(tr.dataset.asset);
  const hypothetical=hypotheticalAdvice(tr.dataset.asset,sig);
  const action=sig?.action||'WAIT';
  const assetKey=tr.dataset.asset;
  const priorVisual=signalVisualState.get(assetKey);
  const signalIdentity=(sig?.ticker||roundSeen.get(assetKey)?.ticker||'')+'|'+action;
  tr.classList.toggle('bt-buy-up',action==='BUY UP');
  tr.classList.toggle('bt-buy-down',action==='BUY DOWN');
  if((action==='BUY UP'||action==='BUY DOWN')&&priorVisual!==undefined&&priorVisual!==signalIdentity){
   tr.classList.remove('bt-signal-new');
   void tr.offsetWidth;
   tr.classList.add('bt-signal-new');
  }else if(action!=='BUY UP'&&action!=='BUY DOWN')tr.classList.remove('bt-signal-new');
  signalVisualState.set(assetKey,signalIdentity);

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
  const quoteIssue=/missing, stale, illiquid or invalid quotes/i.test(why);
  cell.textContent=action==='BUY UP'?'🟢 BUY UP · SIGNAL':action==='BUY DOWN'?'🔴 BUY DOWN · SIGNAL':action==='SELL FAST'?'🚨 SELL FAST · SIGNAL':action==='HOLD'?'🟡 HOLD · SIGNAL':unavailable?'⚠️ SIGNAL DATA ERROR':sampleIssue?'⏳ WAIT · COLLECTING DATA':quoteIssue?'⚠️ NO VALID ENTRY QUOTE':'⏳ WAIT · NO QUALIFIED ENTRY';
  // Display only fresh, matching Kalshi ask quotes as entry percentages.
  // A directional round call or flip watch is NOT an executable BUY signal.
  const liveMarket=latestPositionQuotes.find(x=>x.asset===assetKey)?.market;
  const quoteFresh=Number.isFinite(latestPositionQuoteAt)&&Date.now()-latestPositionQuoteAt>=0&&Date.now()-latestPositionQuoteAt<=10000;
  const sameContract=!!liveMarket?.ticker&&liveMarket.ticker===sig?.ticker&&expiry(liveMarket)>Date.now();
  const upAsk=price(liveMarket,'yes_ask'),downAsk=price(liveMarket,'no_ask');
  const upBid=price(liveMarket,'yes_bid'),downBid=price(liveMarket,'no_bid');
  const validSide=(ask,bid)=>Number.isFinite(ask)&&Number.isFinite(bid)&&ask>0&&ask<100&&bid>=0&&bid<=ask;
  const qualified=['BUY UP','BUY DOWN'].includes(action)&&quoteFresh&&sameContract;
  const selectedAsk=action==='BUY UP'?upAsk:downAsk;
  const selectedBid=action==='BUY UP'?upBid:downBid;
  if(['BUY UP','BUY DOWN'].includes(action)){
   if(qualified&&validSide(selectedAsk,selectedBid)){
    cell.textContent=(action==='BUY UP'?'🟢 ':'🔴 ')+action+' · LIVE ENTRY '+selectedAsk.toFixed(1)+'%';
    const note=document.createElement('small');note.style.cssText='display:block;font-size:11px;opacity:.85';
    note.textContent='Kalshi '+(action==='BUY UP'?'UP':'DOWN')+' ask · '+new Date(latestPositionQuoteAt).toLocaleTimeString()+' · indicative quote, not guaranteed fill';cell.append(note);
   }else cell.textContent='⚠️ WAIT · ENTRY QUOTE NOT VERIFIED';
  }else if(quoteFresh&&liveMarket?.ticker&&expiry(liveMarket)>Date.now()){
   const note=document.createElement('small');note.style.cssText='display:block;font-size:11px;opacity:.85';
   note.textContent='LIVE ASK · UP '+(validSide(upAsk,upBid)?upAsk.toFixed(1)+'%':'—')+' / DOWN '+(validSide(downAsk,downBid)?downAsk.toFixed(1)+'%':'—')+' · no qualified entry';cell.append(note);
  }
  for(const [label,tracked] of [['MY POSITION',advice],['AUTO CALL · SIMULATED',hypothetical]]){
   if(!tracked)continue;
   const box=document.createElement('div');box.className='bt-position-alert';
   box.style.cssText='display:block;padding:8px;margin:6px 0;border:1px solid #64748b;border-radius:8px;white-space:normal;font-size:12px';
   const heading=document.createElement('b');heading.textContent=label+' · '+tracked.action;
   const detail=document.createElement('div');detail.textContent=tracked.reason;box.append(heading,detail);cell.append(box);
  }
  if(unavailable){const warning=document.createElement('small');warning.style.display='block';warning.textContent='⚠️ '+why.slice(0,95);cell.append(warning);cell.style.whiteSpace='normal';cell.style.overflowWrap='anywhere';}else{cell.style.whiteSpace='';cell.style.overflowWrap='';}
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
  // Show the engine's actual directional BUY research call prominently while preserving the execution veto.
  // This is never an authorized order, and does not change sig.action or auto-trading.
  if(action==='WAIT'&&sig?.entryGate?.blockedByPerformance&&['BUY UP','BUY DOWN'].includes(sig.entryGate.rawAction)&&!unavailable){
   const researchBuy=sig.entryGate.rawAction;
   const label=cell.firstChild;
   if(label&&label.nodeType===3)label.textContent=(researchBuy==='BUY UP'?'🟢 ':'🔴 ')+researchBuy+' · RESEARCH ONLY';
   cell.style.borderLeft='4px solid '+(researchBuy==='BUY UP'?'#22c55e':'#ef4444');
   cell.style.background='rgba(234,179,8,.10)';
   cell.style.fontWeight='700';
   const caution=document.createElement('small');
   caution.style.display='block';caution.style.fontSize='11px';caution.style.marginTop='4px';
   caution.textContent='⛔ EXECUTION BLOCKED · NOT AN ORDER OR VERIFIED ENTRY';
   cell.append(caution);
  }
  if(sig?.entryGate?.blockedByPerformance){
   const gate=document.createElement('small');
   gate.style.display='block';gate.style.fontSize='10px';gate.style.marginTop='4px';
   gate.textContent='MOMENTUM CALLED '+sig.entryGate.rawAction+
    ' · BLOCKED BY PAPER PERFORMANCE: '+(sig.entryGate.validation||'unverified edge')+
    ' · no order signal';
   cell.append(gate);
  }else if(action==='WAIT'&&sig?.entryGate?.rawAction==='WAIT'&&sig?.reason){
   const gate=document.createElement('small');
   gate.style.display='block';gate.style.fontSize='10px';gate.style.marginTop='4px';
   gate.textContent='ENTRY ENGINE WAIT · '+sig.reason;
   cell.append(gate);
  }
  // High-contrast directional BUY callout; only for actual qualified engine actions.
  if(action==='BUY UP'||action==='BUY DOWN'){
   const label=cell.firstChild;
   if(label&&label.nodeType===3)label.textContent=(action==='BUY UP'?'🟢 BUY UP':'🔴 BUY DOWN')+' · QUALIFIED PAPER SIGNAL';
   cell.style.borderLeft='4px solid '+(action==='BUY UP'?'#22c55e':'#ef4444');
   cell.style.background=action==='BUY UP'?'rgba(34,197,94,.12)':'rgba(239,68,68,.12)';
   cell.style.fontWeight='700';
  }else{
   cell.style.borderLeft='';
   cell.style.background='';
   cell.style.fontWeight='';
  }
  // Surface the actual entry rejection instead of a generic WAIT.
  const diag=sig?.entryDiagnostics;
  if(action==='WAIT'&&diag?.filters){
   const failed=Object.entries(diag.filters).filter(([,passed])=>passed===false).map(([name])=>name);
   const detail=document.createElement('small');
   detail.style.display='block';detail.style.fontSize='10px';detail.style.marginTop='4px';detail.style.opacity='.95';
   detail.textContent='ENTRY CHECK · '+(diag.direction||'?')+' '+(Number.isFinite(diag.askCents)?diag.askCents+'¢':'')+
    ' · '+(failed.length?'BLOCKED: '+failed.join(', '):'review pending')+
    (Number.isFinite(diag.agreement)?' · agreement '+Math.round(diag.agreement*100)+'%':'')+
    (Number.isFinite(diag.reversals)?' · reversals '+diag.reversals:'');
   cell.append(detail);
  }
  // Price-window watch uses current Kalshi quotes, never a fabricated fill or model signal.
  const liveMarket=latestPositionQuotes.find(x=>x.asset===tr.dataset.asset)?.market;
  if(liveMarket?.ticker===ticker&&Date.now()-latestPositionQuoteAt<10000){
   const windows=[];
   for(const [side,askKey,bidKey] of [['UP','yes_ask','yes_bid'],['DOWN','no_ask','no_bid']]){
    const ask=price(liveMarket,askKey),bid=price(liveMarket,bidKey);
    if(Number.isFinite(ask)&&ask>=40&&ask<=60&&Number.isFinite(bid)&&bid>=0&&bid<=ask){
     windows.push(side+' '+ask.toFixed(0)+'¢ ask');
    }
   }
   if(windows.length){
    const watch=document.createElement('small');
    watch.style.display='block';watch.style.fontSize='10px';watch.style.marginTop='4px';watch.style.opacity='.9';
    watch.textContent='ENTRY CANDIDATE · '+windows.join(' / ')+' · watch only, not a qualified BUY';
    cell.append(watch);
   }
  }
  // Read-only per-market live quote tracker. Never infer fills or predictive certainty.
  const tracker=document.createElement('small');
  tracker.style.display='block';tracker.style.fontSize='10px';tracker.style.marginTop='4px';
  const age=Date.now()-latestPositionQuoteAt;
  if(liveMarket?.ticker===ticker&&Number.isFinite(age)&&age>=0&&age<15000){
   const yb=price(liveMarket,'yes_bid'),ya=price(liveMarket,'yes_ask');
   const nb=price(liveMarket,'no_bid'),na=price(liveMarket,'no_ask');
   const remaining=(expiry(liveMarket)-Date.now())/1000;
   const fmt=v=>Number.isFinite(v)?v.toFixed(0)+'¢':'—';
   tracker.textContent='LIVE TRACKER · UP '+fmt(yb)+'/'+fmt(ya)+
    ' · DOWN '+fmt(nb)+'/'+fmt(na)+
    ' (bid/ask) · spread '+(Number.isFinite(ya-yb)?(ya-yb).toFixed(1)+'¢':'—')+
    ' · '+(Number.isFinite(remaining)?Math.max(0,Math.ceil(remaining/60))+'m left':'expiry unknown')+
    ' · quote age '+Math.ceil(age/1000)+'s';
  }else{
   tracker.textContent='LIVE TRACKER · STALE / NO MATCHING CONTRACT · do not trade from this quote';
  }
  cell.append(tracker);
  // Big, instantly readable decision badge above all technical diagnostics.
  // Never color a blocked momentum observation as an approved BUY.
  const decision=action==='BUY UP'?'BUY UP':action==='BUY DOWN'?'BUY DOWN':action==='SELL FAST'?'SELL FAST':action==='HOLD'?'HOLD':'WAIT';
  const color=decision==='BUY UP'?'#22c55e':decision==='BUY DOWN'||decision==='SELL FAST'?'#ef4444':decision==='HOLD'?'#a78bfa':'#facc15';
  const badge=document.createElement('div');
  badge.style.cssText='display:inline-block;padding:4px 9px;margin:1px 0 3px;border:2px solid '+color+';border-radius:9px;background:'+color+'20;color:'+color+';font-size:clamp(12px,1.1vw,16px);font-weight:900;letter-spacing:.2px;box-shadow:0 0 8px '+color+'44';
  badge.textContent=(decision==='BUY UP'?'🟢 ':decision==='BUY DOWN'?'🔴 ':decision==='SELL FAST'?'🚨 ':decision==='HOLD'?'🟣 ':'🟡 ')+tr.dataset.asset+' · '+decision;
  cell.prepend(badge);
  // Display the per-round directional call next to WAIT; do not mislabel an
  // unqualified quote-based prediction as an approved trading entry.
  const roundCall=sig?.roundCall;
  if(decision==='WAIT'&&roundCall?.ticker===ticker&&
     Number.isFinite(roundCall.asOf)&&Date.now()-roundCall.asOf<90000&&
     ['UP','DOWN'].includes(roundCall.direction)){
   const chip=document.createElement('span');
   chip.style.cssText='display:inline-block;margin-left:7px;padding:4px 8px;border-radius:8px;border:1px solid #38bdf8;color:#7dd3fc;font-size:15px;font-weight:900;white-space:normal;box-shadow:0 0 12px #38bdf855';
   chip.textContent=(roundCall.direction==='UP'?'▲ BUY UP · ROUND PREDICTION':'▼ BUY DOWN · ROUND PREDICTION');
   chip.title='Direction call only, not a qualified BUY signal or order. '+roundCall.basis;
   badge.after(chip);
  }
  const flip=flipWatchFor(tr.dataset.asset,sig,ticker);
  if(flip){
   const icon=document.createElement('span');
   const hue=flip.direction==='UP'?'#4ade80':'#fb7185';
   icon.style.cssText='display:inline-block;margin-left:6px;padding:4px 7px;border-radius:8px;border:2px solid '+hue+';color:'+hue+';font-size:13px;font-weight:900;white-space:nowrap;box-shadow:0 0 9px '+hue+'66';
   icon.textContent=(flip.recentFlip?'⚡ FLIP DETECTED ':'👀 FLIP WATCH ')+(flip.direction==='UP'?'▲ UP':'▼ DOWN');
   if(flip.recentFlip){icon.style.animation='btFlipPulse .7s ease-in-out 3';icon.setAttribute('aria-live','polite');}
   icon.title=(flip.recentFlip?'Observed momentum reversed this round. ':'Current directional watch; not necessarily a reversal. ')+(flip.observed?'Observed price momentum.':'Quote-implied direction only.')+' Not a verified entry.';
   badge.after(icon);
  }
  // Arcade action tiles are visual labels only; they never place orders.
  const arcade=document.createElement('div');
  arcade.className='bt-arcade-actions';
  const makeTile=(label,type,description)=>{
   const tile=document.createElement('div');tile.className='bt-arcade-tile bt-arcade-'+type;
   const heading=document.createElement('strong');heading.textContent=label;
   const subtitle=document.createElement('small');subtitle.textContent=description;
   tile.append(heading,subtitle);arcade.append(tile);
   return tile;
  };
  const tracked=advice||hypothetical;
  const exitAction=String(tracked?.action||'').toUpperCase();
  if(flip)makeTile(flip.recentFlip?'⚡ FLIP '+flip.direction:'👀 FLIP WATCH '+flip.direction,'flip',flip.recentFlip?'Momentum reversal observed':'Direction watch · not an entry');
  if(tracked){
   if(/SELL FAST|SELL|EXIT/.test(exitAction))makeTile('🚨 SELL FAST','sell','Position exit guidance');
   else if(/CASH OUT|TAKE PROFITS/.test(exitAction))makeTile('💰 CASH OUT','profit','Position profit guidance');
   else if(/HOLD/.test(exitAction))makeTile('🛡️ HOLD','hold','Tracked position guidance');
  }
  if(arcade.children.length)cell.append(arcade);
  // Small research-direction chip stays visible beside WAIT in compact mode.
  // This is observed momentum research, NOT an approved buy signal.
  const researchChip=sig?.researchDirection;
  const researchFresh=researchChip?.mode==='SHADOW_ONLY'&&researchChip.roundTicker===ticker&&
    Number.isFinite(researchChip.asOf)&&Date.now()-researchChip.asOf>=0&&Date.now()-researchChip.asOf<90000;
  if(decision==='WAIT'&&researchFresh&&['UP','DOWN'].includes(researchChip.direction)){
   const direction=researchChip.direction;
   const chip=document.createElement('span');
   const hue=direction==='UP'?'#4ade80':'#fb7185';
   chip.style.cssText='display:inline-block;vertical-align:middle;margin-left:7px;padding:3px 7px;border-radius:8px;border:1px solid '+hue+';color:'+hue+';font-size:11px;font-weight:800;white-space:nowrap';
   chip.textContent=direction==='UP'?'↗ WATCH BUY UP':'↘ WATCH BUY DOWN';
   chip.title='Research watch candidate based on observed momentum. NOT a qualified BUY signal or automatic order.';
   badge.after(chip);
  }
  const original=Array.from(cell.childNodes).find(n=>n.nodeType===3&&n.textContent.trim());
  if(original)original.textContent='';
  // Compact desktop rows: show the action and one live tracker line by default.
  // Preserve every diagnostic in the hover tooltip and allow click-to-expand.
  cell.classList.add('bt-compact-signal');
  cell.dataset.compact='true';
  cell.onclick=()=>{cell.dataset.compact=cell.dataset.compact==='true'?'false':'true';};
  // Display separate research context without converting it into an actionable signal.
  const research=sig?.researchDirection;
  if(research?.mode==='SHADOW_ONLY'&&research.roundTicker===ticker&&
     Number.isFinite(research.asOf)&&Date.now()-research.asOf>=0&&Date.now()-research.asOf<90000&&
     ['UP','DOWN'].includes(research.direction)){
   const note=document.createElement('small');
   note.style.display='block';note.style.fontSize='10px';note.style.marginTop='4px';note.style.opacity='.8';
   note.textContent='RESEARCH '+research.direction+' · 40–60¢ ENTRY / 70–100¢ EXIT STUDY · not a trade alert';
   cell.append(note);
  }
  if(sig?.forecast&&sig.forecast.direction){
   const forecast=sig.forecast,side=forecast.direction,details=side==='UP'?forecast.up:forecast.down;
   if(details){
    cell.title=(sig.reason||'')+' | '+forecast.method+' | '+side+' ask '+details.askCents+' cents | Max payout gain $'+details.maxProfitPerContract.toFixed(2)+'; max stake loss $'+details.maxLossPerContract.toFixed(2)+' per contract before fees';
    if(action==='WAIT'){ const label=cell.firstChild; if(label&&label.nodeType===3)label.textContent='⏳ WAIT · NO QUALIFIED ENTRY'; }
   }
  }
 });
 evaluateScreenAlerts();
 evaluateLiveVoiceAlerts();
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
 const unavailable=d.results.filter(x=>x.available===false);if(unavailable.length===d.results.length)throw Error('All Kalshi upstream requests failed: '+unavailable.slice(0,2).map(x=>x.error||'unknown').join('; '));
 latestPositionQuotes=d.results;latestPositionQuoteAt=Date.parse(d.fetched_at);
 try { monitorPaperExits(d.results,age); } catch (error) { console.warn('Paper monitoring error',error); }
 $('premiumRows').replaceChildren();$('premiumStrip').replaceChildren();
 let open=0;
 for(const asset of assets){
  const row=d.results.find(x=>x.asset===asset),m=row?.market;
  const ya=price(m,'yes_ask'),na=price(m,'no_ask'),yb=price(m,'yes_bid'),nb=price(m,'no_bid');
  const valid=m&&[ya,na,yb,nb].every(Number.isFinite)&&ya>=yb&&na>=nb&&ya>0&&na>0;
  const until=expiry(m)-Date.now(),active=Number.isFinite(until)&&until>0,remaining=!Number.isFinite(until)?'UNKNOWN':until<=0?'ENDED':Math.ceil(until/60000)+'m';
  if(m?.ticker&&active){const previous=roundSeen.get(asset);if(!previous||previous.ticker!==m.ticker){roundSeen.set(asset,{ticker:m.ticker,firstSeen:Date.now()});}}
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
 failures=0;try { rememberEntryCalls(engineSignals); syncSignals(); } catch (error) { console.warn('Signal presentation error',error); } try { chart(); } catch (error) { console.warn('Chart presentation error',error); }const header=document.getElementById('health');if(header){header.textContent='● '+open+' MARKET QUOTES LOADED';header.className='pill green';}
 }catch(e){failures++;$('premiumHealth').textContent='● FEED UNAVAILABLE';$('premiumHealth').className='pill red';$('premiumAI').textContent='No signal: '+e.message;const tbody=$('premiumRows');if(tbody){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='Kalshi market request failed: '+String(e.message||e)+' · retrying';tr.append(td);tbody.replaceChildren(tr)}const strip=$('premiumStrip');if(strip)strip.textContent='Kalshi feed unavailable: '+String(e.message||e)}
 finally{fetching=false}
}
let signalFetchBusy=false,signalLastFetch=0;
async function refreshSharedSignalTable(){
 if(signalFetchBusy||document.hidden||Date.now()-signalLastFetch<1000)return;
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
update();refreshSharedSignalTable();refreshPaperPositions();
// Recheck immediately on return from background or after connectivity is restored.
function resumeLiveMonitoring(){if(document.hidden)return;lastFetch=0;signalLastFetch=0;update();refreshSharedSignalTable();refreshPaperPositions();reconcileHealth()}
document.addEventListener('visibilitychange',resumeLiveMonitoring);
window.addEventListener('online',resumeLiveMonitoring);
setInterval(refreshPaperPositions,12000);setInterval(()=>{update();refreshSharedSignalTable();reconcileHealth()},1000);
})();
