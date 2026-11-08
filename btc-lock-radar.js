(()=>{'use strict';
const box=document.createElement('section');box.className='card';box.id='btcLockDesk';box.innerHTML='<h2>🔐 BTC 15-MIN · LOCK & FLIP RADAR</h2><div id="btcLockState" class="notice" role="status" aria-live="polite">Collecting independent candle evidence…</div><p id="btcLockFacts" class="premium-foot">A lock candidate is not a confirmed win. Actual settlement determines the result.</p><p class="premium-foot">Uses completed Coinbase spot candles plus Kalshi quote agreement. No fixed 93% accuracy claim; not the TradingView proprietary script. Paper research only.</p>';
const scalper=document.createElement('section');
scalper.className='card';
scalper.id='btcProScalper';
scalper.style.cssText='box-sizing:border-box;margin:12px 0;padding:clamp(18px,2.5vw,32px);border:2px solid #60a5fa;border-radius:16px;background:#0b1728;color:#f8fafc;overflow-wrap:anywhere';
scalper.innerHTML='<h2 style="margin:0 0 18px;font-size:clamp(20px,2vw,30px)">⚡ BTC 15-MIN PRO SCALPER</h2><div role="status" aria-live="polite"><strong data-action style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid currentColor;border-radius:14px;font-size:clamp(20px,2.7vw,40px);line-height:1.12"><span data-icon aria-hidden="true" style="display:inline-block;flex:none"></span><span data-label></span></strong><p data-detail style="font-size:16px;line-height:1.55"></p></div><p class="premium-foot">Research signals only. Entry uses the ask and exit uses the bid. Quote changes exclude fees.</p>';
const researchReadouts=document.createElement('div');
const v8Readouts=document.createElement('div');
const v8Radar=document.createElement('p');
v8Radar.className='premium-foot';
box.append(v8Radar);
const v8Scoreboard=document.createElement('p');
v8Scoreboard.className='premium-foot';
v8Scoreboard.textContent='V8 server scoreboard · Loading';
const legacyResearch=document.createElement('details');
legacyResearch.className='bt-command-research';
const legacyTitle=document.createElement('summary');
legacyTitle.textContent='V5–V7 research details';
legacyResearch.append(legacyTitle,researchReadouts);
const predatorSlot=document.createElement('div');
scalper.append(v8Readouts,predatorSlot,v8Scoreboard,legacyResearch);
const superTracker=document.createElement('details');
superTracker.className='bt-command-research';
const trackerTitle=document.createElement('summary');
const trackerBody=document.createElement('div');
superTracker.append(trackerTitle,trackerBody);
v8Scoreboard.before(superTracker);
let trackerRequest=null, trackerAudit=null;
const trackerPrice=price=>Number.isFinite(price)?(price*100).toFixed(1)+'%':'—';
const trackerNet=net=>Number.isFinite(net)?(net*100).toFixed(1)+'¢':'—';
function paintSuperTracker(){
 const coin=selectedCoin;
 const ticker=sharedV8.find(row=>row.asset===coin)?.ticker;
 trackerTitle.textContent=coin+' · V15 SUPER TRACKER';
 trackerBody.replaceChildren();
 if(!ticker||trackerAudit?.ticker!==ticker){
  trackerBody.textContent=ticker?'Waiting for this round’s research audit':'Waiting for a matching 15-minute contract';
  return;
 }
 const audit=trackerAudit;
 for(const [name,engine] of Object.entries(audit.engines)){
  for(const [side,row] of Object.entries(engine.sides)){
   const fill=engine.fill?.side===side?engine.fill:null;
   const line=document.createElement('p');
   const signal=row.firstSignal;
   const best=row.bestExecutable??row.firstExecutable;
   const move=row.firstFivePointMoveAt;
   const bid=fill&&!fill.closedAt?currentScalpBid(coin,fill,Date.now()):null;
   line.className='premium-foot';
   line.textContent=name+' '+side+' · First signal '+trackerPrice(signal?.ask)+
    ' · Best executable ask '+trackerPrice(best?.ask)+' · Paper fill '+trackerPrice(fill?.ask)+
    ' · Live exit bid '+trackerPrice(bid)+' · Observed max net '+trackerNet(row.maximumObserved?.net)+
    ' · Realized '+trackerNet(fill?.closedAt?fill.net:null)+
    (signal&&move?' · Alert to +5pt bid '+((move-signal.at)/1000).toFixed(1)+'s':'')+
    (!fill&&row.latestReasons?.length?' · No fill: '+[...new Set(row.latestReasons)].join(', ').replaceAll('_',' ').toLowerCase():'');
   trackerBody.append(line);
  }
 }
}
async function refreshSuperTracker(){
 if(document.hidden)return;
 const coin=selectedCoin;
 const ticker=sharedV8.find(row=>row.asset===coin)?.ticker;
 if(!ticker||trackerRequest?.ticker===ticker)return;
 const request={ticker};
 trackerRequest=request;
 try{
  const response=await fetch('/.netlify/functions/scalp-hunter-report?ticker='+encodeURIComponent(ticker),
   {cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw Error('Tracker unavailable');
  const {audit}=await response.json();
  if(trackerRequest===request&&selectedCoin===coin&&audit?.ticker===ticker){
   trackerAudit=audit;
   paintSuperTracker();
  }
 }catch{
  if(trackerRequest===request&&selectedCoin===coin&&trackerAudit?.ticker!==ticker)
   trackerBody.textContent='Waiting for the selected round’s tracker feed';
 }finally{
  if(trackerRequest===request)trackerRequest=null;
 }
}
const predatorServerStatus=document.createElement('p');
predatorServerStatus.className='premium-foot';
predatorServerStatus.textContent='OMEGA PREDATOR · Waiting for server research';
v8Scoreboard.after(predatorServerStatus);
let predatorReportBusy=false;
async function refreshPredatorReport(){
 if(predatorReportBusy||document.hidden||selectedCoin!=='BTC')return;
 predatorReportBusy=true;
 try{
  const response=await fetch('/.netlify/functions/predator-report?mode=worker',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Predator report unavailable');
  const report=await response.json();
  predatorServerStatus.textContent='BTC PREDATOR · Waiting for a V15 worker heartbeat';
  const worker=report.worker;
  if(worker?.version===15){
   const stats=worker.voltV15;
   const position=worker.latest?.position;
   const watch=worker.latest?.watch;
   predatorServerStatus.textContent='V15 BTC PREDATOR ULTRA · VOLT B · '+
    (worker.fresh?'Worker heartbeat current':'Worker heartbeat stale');
   if(worker.fresh&&position){
    const age=Date.now()-worker.latest.decisionAt;
    const action=position.closedAt?(position.reason==='TAKE PROFIT'?'TAKE PROFIT ':'SELL FAST '):
     worker.latest.decisionAt-position.at<15000?'BUY ':'HOLD ';
    predatorServerStatus.textContent+=' · '+action+position.side+' · PAPER · Entry '+
     (position.ask*100).toFixed(1)+'%';
    if(Number.isFinite(position.bid)&&Number.isFinite(position.net)&&
       (position.closedAt||age<=20000&&worker.latest.quoteFresh)){
     predatorServerStatus.textContent+=' · '+(position.closedAt?'Exit ':'Last executable bid ')+
      (position.bid*100).toFixed(1)+'% · modeled net '+(position.net*100).toFixed(1)+'¢';
    }else predatorServerStatus.textContent+=' · Waiting for fresh exit bid';
    if(Number.isFinite(position.warningMs))predatorServerStatus.textContent+=' · Watch lead '+
     (position.warningMs/1000).toFixed(2)+'s';
   }else if(worker.fresh&&watch&&Date.now()-watch.at<=10000){
    predatorServerStatus.textContent+=' · WATCH '+watch.side;
   }
   if(stats)predatorServerStatus.textContent+=' · '+stats.wins+'W/'+stats.losses+'L · modeled net $'+stats.net.toFixed(2);
  }
 }catch{predatorServerStatus.textContent='OMEGA PREDATOR · Server report unavailable'}
 finally{predatorReportBusy=false}
}
let v8ReportBusy=false;
async function refreshV8Scoreboard(){
 if(v8ReportBusy||document.hidden)return;
 v8ReportBusy=true;
 try{
  const response=await fetch('/.netlify/functions/scalper-v8-report',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('V8 report unavailable');
  const report=await response.json();
  v8Scoreboard.textContent='V8 settlement shadow · '+['A','B','C'].map(name=>{
   const row=report.engines[name];
   return name+' '+row.wins+'W/'+row.losses+'L ('+row.sampleSize+' scored)';
  }).join(' · ')+(report.scope==='COMPLETE'?'':' · Partial archive');
 }catch{
  v8Scoreboard.textContent='V8 server scoreboard · Unavailable';
 }finally{
  v8ReportBusy=false;
 }
}
let sharedV8=[];
const engineBadges=new Map();
const shadowRounds=new Map();
const scalperBooks=new Map();
const hunterPositions=new Map();
const modeledScalpCost=price=>Math.ceil(7*price*(1-price))/100+.01;
function currentScalpBid(coin,position,now){
 const book=scalperBooks.get(coin);
 if(book?.ticker!==position.ticker||book.at<=position.at||now<book.at||now-book.at>5000||
    book.at>=position.expiresAt)return null;
 const level=position.side==='UP'?book.yes:book.no;
 return level?.size>=1&&level.price>0&&level.price<1?level.price:null;
}
const scalpNet=(position,bid)=>bid-position.ask-(position.entryCost??modeledScalpCost(position.ask))-modeledScalpCost(bid);
function trackShadowEngine(coin,ticker,name,engine,snapshot,now){
 let round=shadowRounds.get(coin);
 if(!ticker)return round?.positions[name];
 if(round?.ticker!==ticker){
  round={ticker,positions:{}};
  shadowRounds.set(coin,round);
 }
 let position=round.positions[name];
 if(!position&&['UP','DOWN'].includes(engine?.decision)&&engine.ask>0&&engine.ask<1&&now<snapshot.expiresAt){
  const book=scalperBooks.get(coin);
  const opposite=engine.decision==='UP'?book?.no:book?.yes;
  const ask=1-opposite?.price;
  if(book?.ticker===ticker&&book.at>=snapshot.at&&book.at<=now&&now-book.at<=5000&&
     opposite.size>=1&&1-book.yes.price-book.no.price<=.050001&&ask-engine.ask<=.020001){
   position={ticker,side:engine.decision,ask,referenceAsk:engine.ask,at:book.at,expiresAt:snapshot.expiresAt,peak:0};
   round.positions[name]=position;
  }
 }
 if(!position||position.closedAt||now>=position.expiresAt)return position;
 const bid=currentScalpBid(coin,position,now);
 if(bid===null)return position;
 const net=scalpNet(position,bid);
 position.bid=bid;position.net=net;
 position.peak=Math.max(position.peak,net);
 const reason=net>=.08?'TAKE_PROFIT':net<=-.07?'STOP_LOSS':
  position.peak>=.05&&position.peak-net>=.04?'TRAIL_EXIT':
  position.expiresAt-now<=30000?'TIME_EXIT':null;
 if(reason){position.reason=reason;position.closedAt=now;}
 return position;
}
function paintV8(){
 const shared=sharedV8.find(row=>row.asset===selectedCoin);
 const snapshot=shared?.v8;
 const hunter=shared?.scalpHunter;
 const age=snapshot?Date.now()-snapshot.at:Infinity;
 const fresh=age>=0&&age<=30000&&Date.now()<snapshot.expiresAt;
 box.dataset.radar=fresh?snapshot.radar:'WAIT';
 v8Radar.classList.add('bt-v9-radar-status');
 v8Radar.textContent=fresh?'V8 SHADOW · '+snapshot.radar+' · '+snapshot.regime+
  ' · '+Math.floor(age/1000)+'s since observation':'V8 SHADOW · Waiting for a fresh matching observation';
 v8Readouts.replaceChildren(...['A','B','C'].map(name=>{
  const line=document.createElement('p');
  line.className='bt-v9-engine';
  line.dataset.engine=name;
  const identity=document.createElement('strong');
  identity.className='bt-v9-identity';
  identity.textContent={A:'A · NOVA',B:'B · VOLT',C:'C · KITSUNE'}[name];
  const detail=document.createElement('span');
  const engine=fresh?snapshot.engines[name]:null;
  line.dataset.direction=engine?.decision||'SKIP';
  detail.textContent=(engine?engine.decision+(Number.isFinite(engine.ask)?' reference '+(engine.ask*100).toFixed(1)+'%':'')+' · modeled edge '+
   (engine.edge*100).toFixed(1)+'¢ · SHADOW':'Waiting for evidence');
  const freshHunter=hunter&&Date.now()-hunter.at<=30000?hunter:null;
  const idea=freshHunter?.ideas?.[name]||freshHunter?.experimental?.[name];
  if(idea){
   detail.textContent+=' · '+(idea.mode==='EXPERIMENTAL_SHADOW'?'EXPERIMENTAL · ':'')+idea.side+' scalp watch '+(idea.ask*100).toFixed(1)+'% → '+
    (idea.target*100).toFixed(1)+'% · '+idea.horizonSeconds+'s · historical hit rate '+
    Math.round(idea.observedHitRate*100)+'% ('+idea.sampleSize+' rounds) · modeled net '+
    (idea.estimatedNet*100).toFixed(1)+'¢ per contract'+
    (name==='B'&&Number.isFinite(idea.downside)?' · modeled downside '+trackerNet(idea.downside):'');
  }
  const now=Date.now();
  const paperKey=selectedCoin+'/'+name;
  const reported=hunter?.positions?.[name];
  if(reported?.ticker===shared?.ticker&&['UP','DOWN'].includes(reported?.side)&&hunter.at<=now){
   const saved=hunterPositions.get(paperKey);
   if(saved?.ticker!==reported.ticker||!saved.closedAt||reported.closedAt>=saved.closedAt)
    hunterPositions.set(paperKey,reported);
  }
  const paperPosition=hunterPositions.get(paperKey);
  const paperValid=paperPosition&&now<paperPosition.expiresAt;
  const position=paperValid?paperPosition:trackShadowEngine(selectedCoin,shared?.ticker,name,name==='B'?null:engine,snapshot,now);
  const validPosition=position&&now<position.expiresAt;
  const positionMode=paperValid?'PAPER':'SHADOW';
  const closed=validPosition&&position.closedAt;
  const recentExit=closed&&now>=position.closedAt&&now-position.closedAt<=75000;
   const audit=trackerAudit&&trackerAudit.ticker===shared?.ticker?trackerAudit.engines[name]:null;
  const watch=['UP','DOWN'].find(side=>audit?.sides[side]?.firstSignal?.early&&
   now>=audit.sides[side].firstSignal.at&&now-audit.sides[side].firstSignal.at<=75000&&fresh);
  let action=watch?'EARLY SCALP WATCH '+watch:['UP','DOWN'].includes(engine?.decision)?'WATCH '+engine.decision:'SKIP',
   tone=watch?'hold':'skip',icon=watch?'◈':'—',mode='';
  if(recentExit){
   action=(position.reason==='TAKE_PROFIT'?'TAKE PROFIT ':['STOP_LOSS','TRAIL_EXIT','TRAILING_EXIT'].includes(position.reason)?'SELL FAST ':'SELL ')+position.side;
   tone=position.reason==='TAKE_PROFIT'?'profit':'sell';
   icon=tone==='profit'?'◆':'✕';mode=positionMode;
  }else if(validPosition&&!closed){
   const entry=now-position.at<(paperValid?30000:3500);
   action=(entry?'BUY ':'HOLD ')+position.side;
   tone=entry?position.side.toLowerCase():'hold';
   icon=entry?(position.side==='UP'?'▲':'▼'):'Ⅱ';mode=positionMode;
  }
  if(validPosition){
   detail.textContent='Entry '+(position.ask*100).toFixed(1)+'%';
   const liveBid=closed?null:currentScalpBid(selectedCoin,position,now);
   if(closed){
    if(Number.isFinite(position.bid))detail.textContent+=' · exit '+(position.bid*100).toFixed(1)+'%';
    if(Number.isFinite(position.net))detail.textContent+=' · realized modeled net '+(position.net*100).toFixed(1)+'¢';
   }else if(liveBid!==null){
    detail.textContent+=' · bid '+(liveBid*100).toFixed(1)+'% · modeled net '+(scalpNet(position,liveBid)*100).toFixed(1)+'¢';
   }else detail.textContent+=' · waiting for fresh exit bid';
   if(paperValid&&now>=position.at)detail.textContent+=' · fill age '+((now-position.at)/1000).toFixed(1)+'s';
   if(!closed&&Number.isFinite(position.peakNet??position.peak))
    detail.textContent+=' · peak net '+trackerNet(position.peakNet??position.peak);
  }
  const label=icon+' '+action+(mode?' · '+mode:'');
  const badgeKey=[selectedCoin,shared?.ticker,label].join('/');
  let badge=engineBadges.get(name);
  if(badge?.dataset.key!==badgeKey){
   badge=document.createElement('strong');
   badge.className='bt-engine-action';
   badge.dataset.key=badgeKey;
   badge.dataset.tone=tone;
   badge.textContent=label;
   engineBadges.set(name,badge);
   if(tone!=='skip'&&!reducedMotion.matches&&!document.body.classList.contains('bt-arcade-muted')){
    requestAnimationFrame(()=>badge.animate?.([
     {opacity:1},{opacity:.66},{opacity:1}
    ],{duration:name==='B'?550:420,iterations:name==='B'?2:1}));
   }
  }
  line.append(identity,badge,detail);
  return line;
 }));
}
window.addEventListener('banktrades:shared-signals',event=>{
 sharedV8=Array.isArray(event.detail)?event.detail:[];
 paintV8();
});
const researchRowStyle='margin:6px 0;padding:8px;border:1px solid #526aaf;border-radius:9px;font-size:13px;line-height:1.4';
function createScalperBots(coin){
const shadow=document.createElement('p');
shadow.style.cssText=researchRowStyle;
const shadowSignal=document.createElement('strong');
shadowSignal.style.cssText='display:inline-block;margin:0 6px 4px 0;padding:3px 8px;border:1px solid currentColor;border-radius:6px';
shadowSignal.hidden=true;
shadowSignal.style.display='none';
const shadowDetail=document.createElement('span');
shadowDetail.textContent='V5 SHADOW · Waiting for '+coin+' trades and executable depth';
shadow.append(shadowSignal,shadowDetail);
const readouts=document.createElement('div');
readouts.append(shadow);

const journalKey='banktrades:'+coin.toLowerCase()+'-v5-shadow-v1';
let journal=[],shadowPosition=null,shadowMarket=null,bookBusy=false,lastRound=null;
try{
  const saved=JSON.parse(localStorage.getItem(journalKey)||'[]');
  if(Array.isArray(saved))journal=saved.slice(-400);
}catch{}
// An open simulation interrupted by navigation has no verified exit.
const lastRecord=journal.at(-1);
if(lastRecord?.event==='ENTRY')record({event:'INTERRUPTED',ticker:lastRecord.ticker});
const evaluated=new Set(journal.filter(x=>x.event==='ENTRY').map(x=>x.ticker));
const trades=[];
const recentTradeIds=new Map();
let socket,reconnectAt=0;
function record(entry){
  journal.push({at:Date.now(),...entry});
  journal=journal.slice(-400);
  try{localStorage.setItem(journalKey,JSON.stringify(journal))}catch{}
}
function connectTrades(){
  if(document.hidden||Date.now()<reconnectAt||socket?.readyState<=1)return;
  reconnectAt=Date.now()+5000;
  try{
    socket=new WebSocket('wss://advanced-trade-ws.coinbase.com');
    socket.onopen=()=>socket.send(JSON.stringify({type:'subscribe',channel:'market_trades',product_ids:[coin+'-USD']}));
    socket.onmessage=({data})=>{
      let message;
      try{message=JSON.parse(data)}catch{return}
      if(message.channel!=='market_trades')return;
      const now=Date.now();
      for(const event of message.events||[]){
        if(event.type!=='update')continue;
        for(const trade of event.trades||[]){
          const time=Date.parse(trade.time),price=Number(trade.price),size=Number(trade.size);
          if(trade.product_id!==coin+'-USD'||time>now+2000||time<now-30000||
             !Number.isFinite(time)||!Number.isFinite(price)||price<=0||!Number.isFinite(size)||size<=0||
             !['BUY','SELL'].includes(trade.side)||!trade.trade_id||recentTradeIds.has(trade.trade_id)||
             (trades.length&&time<trades.at(-1).time))continue;
          recentTradeIds.set(trade.trade_id,time);
          // Coinbase publishes the maker side. Aggressor direction is the opposite.
          trades.push({time,price,flow:trade.side==='SELL'?size:-size});
        }
      }
      for(const [id,time] of recentTradeIds){
        if(time>=now-30000&&recentTradeIds.size<=5000)break;
        recentTradeIds.delete(id);
      }
      while(trades.length&&(trades[0].time<now-30000||trades.length>5000))trades.shift();
    };
  }catch{}
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)socket?.close();
});
let predator, predatorWatch=null, predatorResults=[];
const predatorPanel=document.createElement('p');
if(coin==='BTC'){
 predatorPanel.className='bt-v9-engine';
 predatorPanel.textContent='BTC PREDATOR · Starting forward research';
 readouts.prepend(predatorPanel);
 try{predatorResults=JSON.parse(localStorage.getItem('bt:predator:v10')||'[]')}catch{}
 if(!Array.isArray(predatorResults))predatorResults=[];
 import('/btc-predator.js?v=10').then(module=>{predator=module}).catch(()=>{
  predatorPanel.textContent='BTC PREDATOR · Research module unavailable';
 });
}
function updatePredator(input){
 if(!predator)return;
 const observation=predator.predatorObservation({...input,trades});
 if(!observation){predatorPanel.textContent='BTC PREDATOR · Waiting for fresh BTC tape and depth';return;}
 if(predatorWatch&&predatorWatch.ticker!==observation.ticker)predatorWatch=null;
 if(predatorWatch){
  predatorWatch=predator.advancePredatorWatch(predatorWatch,observation);
  if(predatorWatch.closedAt){
   predatorResults=[...predatorResults,predatorWatch].slice(-160);
   try{localStorage.setItem('bt:predator:v10',JSON.stringify(predatorResults))}catch{}
   predatorPanel.dataset.direction=predatorWatch.side;
   predatorPanel.textContent='BTC PREDATOR · '+predatorWatch.reason+' · SHADOW'+
    (predatorWatch.reason==='UNSCORED_GAP'?'':' · modeled net '+(predatorWatch.net*100).toFixed(1)+'¢')+
    (predatorWatch.leadMs===null||predatorWatch.leadMs===undefined?'':' · momentum lead '+(predatorWatch.leadMs/1000).toFixed(1)+'s');
   predatorWatch=null;
   return;
  }
  predatorPanel.textContent='BTC PREDATOR · HOLD · SHADOW · bid '+(predatorWatch.bid*100).toFixed(1)+
   '% · modeled net '+(predatorWatch.net*100).toFixed(1)+'¢';
  return;
 }
 if(!predatorResults.some(row=>row.ticker===observation.ticker))predatorWatch=predator.openPredatorWatch(observation);
 if(!predatorWatch){
  predatorPanel.dataset.direction='SKIP';
  predatorPanel.textContent='BTC PREDATOR · WAIT · No early setup · '+predatorResults.length+' local research records';
  return;
 }
 predatorPanel.dataset.direction=predatorWatch.side;
 predatorPanel.textContent='BTC PREDATOR — EARLY OPPORTUNITY DETECTED · SHADOW '+predatorWatch.side+
  ' · ask '+(predatorWatch.ask*100).toFixed(1)+'% ('+predatorWatch.quantity+' shown) · research target '+
  (predatorWatch.target*100).toFixed(1)+'% · modeled target net '+(predatorWatch.estimatedNet*100).toFixed(1)+
  '¢ · 30s trial · uncalibrated · Coinbase event-to-display '+(Date.now()-predatorWatch.sourceEventAt)+'ms';
}
function bestBid(book,side){
  const dollars=book?.[side+'_dollars'];
  const levels=dollars??book?.[side];
  let best=null;
  for(const level of Array.isArray(levels)?levels:[]){
    const price=Number(level?.[0])/(dollars?1:100),size=Number(level?.[1]);
    if(!Number.isFinite(price)||price<=0||price>=1||!Number.isFinite(size)||size<1)continue;
    if(!best||price>best.price)best={price,size};
  }
  return best;
}
// One-contract research estimate. Reserve a cent per leg for slippage.
function estimatedCost(price){return Math.ceil(7*price*(1-price))/100+.01}
const cents=value=>Math.round(value*100)+'¢ / '+Math.round(value*100)+'%';
// V6 consumes the same timestamped book and trade tape as V5.
const challenger=document.createElement('p');
challenger.style.cssText=shadow.style.cssText;
challenger.textContent='V6 SHADOW · Waiting for a shared market snapshot';
readouts.append(challenger);
const v6Key='banktrades:'+coin.toLowerCase()+'-v6-forward-v1';
const horizons=[5,15,30,60,180];
let v6Log=[],pending=[],priorBook=null,v6Position=null,lastForecast=0;
try{
  const saved=JSON.parse(localStorage.getItem(v6Key)||'[]');
  if(Array.isArray(saved))v6Log=saved.filter(row=>row&&typeof row==='object').slice(-1200);
}catch{}
const finishedForecasts=new Set(v6Log.filter(row=>['OUTCOME','MISSED_OUTCOME'].includes(row.event)).map(row=>row.id));
pending=v6Log.filter(row=>row.event==='FORECAST'&&typeof row.id==='string'&&!finishedForecasts.has(row.id)&&
  horizons.includes(row.horizon)&&Number.isFinite(row.due)&&Number.isFinite(row.spot)&&
  Number.isFinite(row.probability)&&row.probability>0&&row.probability<1);
lastForecast=v6Log.reduce((latest,row)=>row.event==='FORECAST'&&Number.isFinite(row.at)&&row.at<=Date.now()?Math.max(latest,row.at):latest,0);
const v6Entries=new Set(v6Log.filter(row=>row.event==='ENTRY').map(row=>row.ticker));
const v6Finished=new Set(v6Log.filter(row=>['EXIT','UNRESOLVED'].includes(row.event)).map(row=>row.ticker));
function saveV6(rows){
  if(!rows.length)return;
  v6Log=v6Log.concat(rows).slice(-1200);
  try{localStorage.setItem(v6Key,JSON.stringify(v6Log))}catch{}
}
saveV6(v6Log.filter(row=>row.event==='ENTRY'&&!v6Finished.has(row.ticker))
  .map(row=>({event:'UNRESOLVED',ticker:row.ticker,at:Date.now(),reason:'Browser session interrupted'})));
const bounded=value=>Math.max(-1,Math.min(1,value));
function tapeStats(rows){
  const volume=rows.reduce((sum,t)=>sum+Math.abs(t.flow),0);
  return {
    flow:volume?rows.reduce((sum,t)=>sum+t.flow,0)/volume:0,
    move:rows.length>1?rows.at(-1).price-rows[0].price:0
  };
}
function scoreOutcomes(now){
  const settled=[];
  pending=pending.filter(forecast=>{
    const trade=trades.find(row=>row.time>=forecast.due);
    if(trade&&trade.time<=forecast.due+2000){
      const outcome=trade.price>forecast.spot?1:trade.price<forecast.spot?0:null;
      settled.push({event:'OUTCOME',id:forecast.id,at:now,horizon:forecast.horizon,outcome,
        observedAt:trade.time,price:trade.price,probability:forecast.probability});
      return false;
    }
    if(now>forecast.due+2000){
      settled.push({event:'MISSED_OUTCOME',id:forecast.id,at:now,horizon:forecast.horizon});
      return false;
    }
    return true;
  });
  saveV6(settled);
}
function updateV6({market,yes,no,spread,current,remaining,latency}){
  const ticker=market.ticker,latest=trades.at(-1);
  const rows=trades.filter(t=>t.time>=current-15000);
  const ready=rows.length>=10&&latest.time-rows[0].time>=5000&&current-latest.time<=5000;
  const slow=tapeStats(rows),fast=tapeStats(rows.filter(t=>t.time>=current-5000));
  const depth=(yes.size-no.size)/(yes.size+no.size);
  const previous=priorBook?.ticker===ticker&&current-priorBook.at<=12000?priorBook:null;
  const implied=(yes.price+1-no.price)/2;
  const drift=previous?implied-previous.implied:0;
  const thinning=previous&&(yes.size+no.size)<previous.size*.5;
  const widening=previous&&spread>previous.spread+.015;
  priorBook={ticker,at:current,implied,size:yes.size+no.size,spread};
  const scale=Math.max(coin==='BTC'?5:(latest?.price??1)*.00006,...rows.map(t=>Math.abs(t.price-(latest?.price??0))));
  const momentum=bounded(slow.move/scale);
  const acceleration=bounded(fast.flow-slow.flow);
  const tapeScore=bounded(.55*slow.flow+.25*momentum+.20*acceleration);
  const bookScore=bounded(.55*depth+.45*bounded(drift/.025));
  const signal=.75*tapeScore+.25*bookScore;
  const reversal=Math.abs(slow.flow)>=.25&&fast.flow*slow.flow<-.10;
  if(ready&&current-lastForecast>=30000){
    lastForecast=current;
    const forecasts=horizons.map(horizon=>({
      event:'FORECAST',id:ticker+'|'+current+'|'+horizon,ticker,at:current,horizon,
      due:current+horizon*1000,observedAt:latest.time,spot:latest.price,probability:.5+.38*signal/Math.sqrt(1+horizon/30)
    }));
    pending.push(...forecasts);
    saveV6(forecasts);
  }
  const exits=v6Log.filter(row=>row.event==='EXIT'&&Number.isFinite(row.pnl));
  const v5Exits=new Map(journal.filter(row=>row.event==='EXIT'&&Number.isFinite(row.pnl)).map(row=>[row.ticker,row.pnl]));
  const matched=exits.filter(row=>v5Exits.has(row.ticker));
  const pairedV5=matched.map(row=>v5Exits.get(row.ticker));
  const pairedV6=matched.map(row=>row.pnl);
  const summarizeNet=values=>{
    const wins=values.filter(value=>value>0).length;
    const losses=values.filter(value=>value<0).length;
    const net=values.reduce((sum,value)=>sum+value,0);
    return wins+'W/'+losses+'L · '+(net*100).toFixed(1)+'¢ net';
  };
  const outcomes=v6Log.filter(row=>row.event==='OUTCOME'&&row.outcome!==null);
  const correct=outcomes.filter(row=>(row.probability>=.5?1:0)===row.outcome).length;
  const brier=outcomes.length?outcomes.reduce((sum,row)=>sum+(row.probability-row.outcome)**2,0)/outcomes.length:null;
  const suffix=' · Flow '+Math.round(slow.flow*100)+'% · Depth imbalance '+Math.round(depth*100)+'% · Book request '+latency+'ms'+
    (reversal?' · Reversal warning':'')+' · Matched closed trades '+matched.length+
    (matched.length?' · V5 '+summarizeNet(pairedV5)+' · V6 '+summarizeNet(pairedV6):'')+
    (brier===null?'':' · Spot direction '+correct+'/'+outcomes.length+' · Brier '+brier.toFixed(3));
  const show=text=>{challenger.textContent='V6 SHADOW · '+text+suffix};
  if(v6Position&&v6Position.ticker!==ticker)closeV6Unresolved(current);
  if(v6Position){
    const position=v6Position;
    const bid=position.side==='UP'?yes.price:no.price;
    const pnl=bid-position.ask-position.cost-estimatedCost(bid);
    position.peak=Math.max(position.peak,pnl);
    const adverse=position.side==='UP'?signal<-.35:signal>.35;
    const reason=remaining<=30?'TIME EXIT':bid-position.entryBid<=-.049999||(ready&&adverse&&reversal)?'SELL FAST':
      pnl>=.08?'TAKE PROFIT':position.peak>=.04&&position.peak-pnl>=.025?'TRAIL PROFIT':'';
    if(reason){
      saveV6([{event:'EXIT',ticker,at:current,side:position.side,bid,pnl,reason}]);
      v6Position=null;
    }
    show((reason||'HOLD '+position.side)+' · '+cents(bid)+' · Est. net '+(pnl*100).toFixed(1)+'¢');
    return;
  }
  if(v6Entries.has(ticker)){show('ROUND LOGGED');return}
  const strike=Number(market.floor_strike);
  if(!ready||!Number.isFinite(strike)||strike<=0){show('WAIT · Fresh tape or threshold unavailable');return}
  if(remaining<75){show('SKIP ROUND · Closing window');return}
  if(!previous||widening||thinning||spread>.03001||reversal){
    show('WAIT · Book or reversal risk');return;
  }
  const side=signal>.28?'UP':signal<-.28?'DOWN':null;
  const thresholdScore=bounded((latest.price-strike)/Math.max(10,scale*Math.sqrt(remaining/15)));
  const upValue=Math.max(.04,Math.min(.96,.5+.32*thresholdScore+.14*signal));
  const ask=1-(side==='UP'?no.price:yes.price),cost=estimatedCost(ask);
  const edge=(side==='UP'?upValue:1-upValue)-ask-cost-.025;
  if(!side||edge<.05||ask<.10||ask>.88){show('WAIT FOR BETTER PRICE · No qualifying edge');return}
  v6Position={ticker,side,ask,cost,entryBid:side==='UP'?yes.price:no.price,peak:-Infinity};
  v6Entries.add(ticker);
  saveV6([{event:'ENTRY',at:current,ticker,side,ask,cost,edge,signal,depth,spread,latency}]);
  show('ENTER NOW '+side+' · '+cents(ask)+' · Est. settlement edge '+(edge*100).toFixed(1)+'¢');
}
function closeV6Unresolved(at){
  if(!v6Position)return;
  saveV6([{event:'UNRESOLVED',ticker:v6Position.ticker,at,reason:'No fresh exit before rollover'}]);
  v6Position=null;
}

async function scanShadow(){
  if(document.hidden||bookBusy)return;
  connectTrades();
  const market=shadowMarket,now=Date.now();
  const left=(Date.parse(market?.close_time)-now)/1000;
  scoreOutcomes(now);
  if(v6Position&&(v6Position.ticker!==market?.ticker||left<=0))closeV6Unresolved(now);
  challenger.textContent='V6 SHADOW · Waiting for a fresh shared snapshot';
  if(lastRound&&Date.parse(lastRound.close)<=now){
    if(!evaluated.has(lastRound.ticker))record({event:'SKIP',ticker:lastRound.ticker,reason:lastRound.reason});
    lastRound=null;
  }
  if(market&&left>0&&lastRound?.ticker!==market.ticker){
    lastRound={ticker:market.ticker,close:market.close_time,reason:'No completed scan'};
  }
  const set=(message,action,side)=>{
    if(lastRound?.ticker===market?.ticker&&lastRound)lastRound.reason=message;
    const exits=journal.filter(row=>row.event==='EXIT'&&Number.isFinite(row.pnl));
    const net=exits.reduce((total,row)=>total+row.pnl,0);
    const label=action&&side?action+' '+side:'';
    const color=action==='BUY'||action==='TAKE PROFIT'?'#a7f3d0':action==='HOLD'?'#fef08a':'#fecaca';
    const background=action==='BUY'||action==='TAKE PROFIT'?'#064e3b':action==='HOLD'?'#713f12':'#7f1d1d';
    shadowSignal.hidden=!label;
    shadowSignal.style.display=label?'inline-block':'none';
    shadowSignal.style.color=color;
    shadowSignal.style.background=background;
    if(shadowSignal.textContent!==label)shadowSignal.textContent=label;
    shadowDetail.textContent='V5 SHADOW · '+message+' · Local simulated exits '+exits.length+
      ' · Est. total '+(net*100).toFixed(1)+'¢';
  };
  if(shadowPosition&&(shadowPosition.ticker!==market?.ticker||left<=0)){
    record({event:'UNRESOLVED',ticker:shadowPosition.ticker,reason:'No fresh executable exit before rollover'});
    shadowPosition=null;
  }
  if(!market||!(left>0&&left<=900)){set('Waiting for an open '+coin+' round');return}
  const latest=trades.at(-1),recent=trades.filter(t=>t.time>=now-15000);
  const tapeReady=latest&&now-latest.time<=5000&&recent.length>=10&&latest.time-recent[0].time>=5000;
  const needsScalpBook=sharedV8.some(row=>row.asset===coin&&row.ticker===market.ticker&&
   (Object.values(row.v8?.engines||{}).some(engine=>engine.decision!=='SKIP')||
    Object.values(row.scalpHunter?.positions||{}).some(position=>!position.closedAt)));
  if(!needsScalpBook&&!tapeReady&&!shadowPosition&&!v6Position&&!predatorWatch&&!Object.values(shadowRounds.get(coin)?.positions||{}).some(position=>position.ticker===market.ticker&&!position.closedAt)){set('Waiting for fresh Coinbase trade flow');return}
  bookBusy=true;
  try{
    const start=performance.now();
    const response=await fetch('/api/data?mode=orderbook&ticker='+encodeURIComponent(market.ticker),
      {cache:'no-store',signal:AbortSignal.timeout(4000)});
    const data=response.ok?await response.json():null;
    const current=Date.now(),remaining=(Date.parse(market.close_time)-current)/1000;
    if(!data||Math.abs(current-Date.parse(data.fetched_at))>5000||!Number.isFinite(Date.parse(data.fetched_at))||
       shadowMarket?.ticker!==market.ticker||remaining<=0){set('Waiting for fresh Kalshi depth');return}
    const book=data.orderbook?.orderbook_fp??data.orderbook;
    const yes=bestBid(book,'yes'),no=bestBid(book,'no');
    if(!yes||!no||yes.price+no.price>=1){set('Waiting for a valid two-sided book');return}
    scalperBooks.set(coin,{ticker:market.ticker,at:Date.parse(data.fetched_at),yes,no});
    if(coin===selectedCoin){paintV8();if(superTracker.open)paintSuperTracker();}
    const spread=1-yes.price-no.price,latency=Math.round(performance.now()-start);
    if(coin==='BTC')updatePredator({ticker:market.ticker,now:current,bookAt:Date.parse(data.fetched_at),remaining,yes,no});
    try{updateV6({market,yes,no,spread,current,remaining,latency})}
    catch{challenger.textContent='V6 SHADOW · Snapshot evaluation failed'}
    const position=shadowPosition;
    if(position){
      const bid=position.side==='UP'?yes.price:no.price;
      const pnl=bid-position.ask-position.cost-estimatedCost(bid);
      position.peak=Math.max(position.peak,pnl);
      const exit=remaining<=30?'TIME EXIT':bid-position.entryBid<=-.049999?'SELL FAST':pnl>=.08?'TAKE PROFIT':
        position.peak>=.04&&position.peak-pnl>=.03?'TRAILING EXIT':'';
      if(exit){
        record({event:'EXIT',ticker:market.ticker,side:position.side,bid,pnl,estimatedCosts:position.cost+estimatedCost(bid),reason:exit});
        shadowPosition=null;
      }
      set('Bid '+cents(bid)+' · Est. net '+(pnl*100).toFixed(1)+'¢ · '+Math.ceil(remaining)+'s left',exit||'HOLD',position.side);
      return;
    }
    if(evaluated.has(market.ticker)){
      const closed=journal.findLast(row=>row.ticker===market.ticker&&row.event==='EXIT');
      if(closed)set('Exit logged · Bid '+cents(closed.bid)+' · Est. net '+(closed.pnl*100).toFixed(1)+'¢',closed.reason,closed.side);
      else set('Round logged · one shadow entry per round');
      return;
    }
    const strike=Number(market.floor_strike);
    if(!tapeReady||current-latest.time>5000||!Number.isFinite(strike)||strike<=0){
      set('Waiting for fresh trade flow and a numeric Kalshi threshold');return;
    }
    const volume=recent.reduce((sum,t)=>sum+Math.abs(t.flow),0);
    const pressure=recent.reduce((sum,t)=>sum+t.flow,0)/volume;
    const momentum=latest.price-recent[0].price;
    const prices=recent.map(t=>t.price);
    const range=Math.max(...prices)-Math.min(...prices);
    const horizon=Math.max(coin==='BTC'?8:latest.price*.0001,range*Math.sqrt(remaining/15));
    // Heuristic fair value for research. This score is intentionally uncalibrated.
    const up=1/(1+Math.exp(-1.6*(latest.price-strike+momentum*.5)/horizon));
    const side=pressure>.2&&momentum>0?'UP':pressure<-.2&&momentum<0?'DOWN':null;
    const probability=side==='UP'?up:1-up;
    const ask=1-(side==='UP'?no.price:yes.price);
    const cost=estimatedCost(ask);
    const edge=probability-ask-cost-.015;
    const telemetry=' · spread '+(spread*100).toFixed(1)+'¢ · flow '+Math.round(pressure*100)+'% · depth '+latency+'ms';
    if(!side||spread>.03001||remaining<75||edge<.04||ask<.10||ask>.88){
      set('NO ENTRY · '+(!side?'Flow and momentum disagree':spread>.03001?'Wide spread':remaining<75?'Too close to expiry':'Price or estimated edge gate')+telemetry);
      return;
    }
    shadowPosition={ticker:market.ticker,side,ask,cost,entryBid:side==='UP'?yes.price:no.price,peak:-Infinity};
    evaluated.add(market.ticker);
    record({event:'ENTRY',ticker:market.ticker,side,ask,cost,edge,probability,pressure,spread,latency,remaining,spot:latest.price,strike});
    set('Entry '+cents(ask)+' · Heuristic value '+Math.round(probability*100)+'% · Est. edge '+(edge*100).toFixed(1)+'¢ · '+Math.ceil(remaining)+'s left'+telemetry,'BUY',side);
  }catch{set('Waiting for executable Kalshi depth')}
  finally{bookBusy=false}
}
setInterval(()=>{
  if(coin==='BTC'||coin===selectedCoin||shadowPosition||v6Position||
    ['A','B','C'].some(name=>{
     const position=hunterPositions.get(coin+'/'+name)??shadowRounds.get(coin)?.positions[name];
     return position&&!position.closedAt&&Date.now()<position.expiresAt;
    }))scanShadow();
  else socket?.close();
},5000);
return {readouts,predatorPanel:coin==='BTC'?predatorPanel:null,setMarket:market=>{shadowMarket=market}};


}
const bots=new Map();
function botsFor(coin){
  if(!bots.has(coin))bots.set(coin,createScalperBots(coin));
  return bots.get(coin);
}
const titan=document.createElement('p');
titan.style.cssText=researchRowStyle;
titan.textContent='🤖 TITAN V7 · Waiting for server research';
researchReadouts.append(titan);
let titanRequest=0;
async function refreshTitan(){
  if(document.hidden)return;
  const coin=selectedCoin,request=++titanRequest;
  try{
    const response=await fetch('/.netlify/functions/omega-live-health',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Research report unavailable');
    const health=await response.json();
    if(request!==titanRequest)return;
    const report=coin==='BTC'?health.titanShadow:health.titanShadows?.[coin];
    if(!report){titan.textContent='🤖 TITAN V7 · Waiting for a fresh server report';return}
    const latest=report.latest;
    if(latest&&coin==='BTC'){
      window.dispatchEvent(new CustomEvent('banktrades:titan-observation',{detail:{
        ticker:latest.ticker,at:latest.at,decision:latest.decision,scored:report.scored,trades:report.trades
      }}));
    }
    titan.textContent='🤖 TITAN V7 SHADOW · '+(latest?latest.decision+' · '+latest.reason.replaceAll('_',' ').toLowerCase():'Collecting qualified '+coin+' observations')+
      ' · '+report.scored+' officially scored rounds · '+report.trades+' simulated trades'+
      (report.scored?' · Titan / market Brier '+report.brier.toFixed(3)+' / '+report.marketBrier.toFixed(3):'')+
      (report.trades?' · Simulated net '+(report.simulatedNetPnl*100).toFixed(1)+'¢':'');
  }catch{if(request===titanRequest)titan.textContent='🤖 TITAN V7 · Server research unavailable'}
}


const scalpAction=scalper.querySelector('[data-action]');
const scalpIcon=scalper.querySelector('[data-icon]');
const scalpLabel=scalper.querySelector('[data-label]');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const actionLooks={
  up:['🚀','#064e3b','#a7f3d0','translateY(-8px) rotate(-12deg)'],
  down:['☄️','#7f1d1d','#fecaca','translateY(8px) rotate(12deg)'],
  hold:['🛡️','#713f12','#fef08a','scale(1.24)'],
  profit:['💰','#064e3b','#a7f3d0','translateY(-7px) rotate(14deg)'],
  fast:['🚨','#7f1d1d','#fecaca','translateX(-8px) rotate(-16deg)'],
  exit:['🏁','#7f1d1d','#fecaca','rotate(18deg)'],
  wait:['🔎','#1e3a5f','#dbeafe',null]
};
let scalpMotion;
const scalpDetail=scalper.querySelector('[data-detail]');
const easyCoinButtons=[...document.querySelectorAll('#quickAssets button[data-quick-asset]')];
const coins=easyCoinButtons.map(button=>button.dataset.quickAsset);
const savedCoin=localStorage.getItem('btProCoin')||localStorage.getItem('btEasyAsset');
let selectedCoin=coins.includes(savedCoin)?savedCoin:'BTC';
let selectionVersion=0;
const picker=document.createElement('div');
picker.setAttribute('role','group');
picker.setAttribute('aria-label','Coin for Pro Scalper and Lock & Flip Radar');
picker.style.cssText='grid-column:1 / -1;display:grid;grid-template-columns:repeat(auto-fit,minmax(76px,1fr));gap:8px;margin:8px 0 0';
const buttons=easyCoinButtons.map(source=>{
  const coin=source.dataset.quickAsset;
  const button=document.createElement('button');
  button.type='button';
  button.dataset.coin=coin;
  button.textContent=source.textContent;
  button.style.cssText='min-height:44px;white-space:nowrap;padding:4px;font-weight:800';
  button.addEventListener('click',()=>selectCoin(coin));
  picker.append(button);
  return button;
});
function paintCoin(){
  box.querySelector('h2').lastChild.textContent=' '+selectedCoin+' 15-MIN · LOCK & FLIP RADAR';
  scalper.querySelector('h2').textContent='⚡ '+selectedCoin+' 15-MIN PRO SCALPER';
  const bot=botsFor(selectedCoin);
  researchReadouts.replaceChildren(bot.readouts,titan);
  predatorSlot.replaceChildren(...(bot.predatorPanel?[bot.predatorPanel]:[]));
  paintV8();
  paintSuperTracker();
  refreshSuperTracker();
  for(const button of buttons){
    const active=button.dataset.coin===selectedCoin;
    button.setAttribute('aria-pressed',String(active));
    button.style.background=active?'#8a7300':'transparent';
    button.style.border=active?'4px solid #ffd400':'1px solid rgba(255,255,255,.35)';
    button.style.color=active?'#fff7a8':'#f8fafc';
  }
}
function selectCoin(coin){
  if(coin===selectedCoin)return;
  selectedCoin=coin;
  localStorage.setItem('btProCoin',coin);
  selectionVersion++;
  paintCoin();
  titan.textContent='🤖 TITAN V7 · Checking '+coin+' research';
  refreshTitan();
  waitForData('Checking '+coin+' market and spot feed');
  evaluate();
}
function mountScalper(){
  const feed=document.getElementById('btVerifiedAlertFeed');
  if(!feed)return false;
  const row=document.createElement('div');
  row.className='bt-command-grid';
  picker.className='bt-command-picker';
  feed.before(row);
  const title=box.querySelector('h2');
  title.style.cssText='margin:0 0 18px;font-size:clamp(20px,2vw,30px)';
  const icon=document.createElement('span');
  icon.setAttribute('aria-hidden','true');
  icon.textContent='📡';
  icon.style.display='inline-block';
  title.replaceChildren(icon,' BTC 15-MIN · LOCK & FLIP RADAR');
  const radarStatus=box.querySelector('#btcLockState');
  radarStatus.style.cssText='padding:12px;border:2px solid #67e8f9;border-radius:14px;background:#123354;color:#ecfeff;font-size:clamp(16px,1.6vw,24px);font-weight:800';
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    icon.animate?.([
      {transform:'rotate(-12deg) scale(1)'},
      {transform:'rotate(12deg) scale(1.16)'},
      {transform:'rotate(-12deg) scale(1)'}
    ],{duration:1800,iterations:Infinity,easing:'ease-in-out'});
  }
  const signalNotice=feed.nextElementSibling;
  if(signalNotice?.classList.contains('notice')&&signalNotice.nextElementSibling?.id==='liveTerminal')row.before(signalNotice);
  const terminal=document.getElementById('liveTerminal');
  const contract=document.getElementById('premiumChart')?.closest('.premium-panel');
  const spot=document.getElementById('btcSpotChart')?.closest('section');
  if(terminal&&contract&&spot){
    const column=(name,...panels)=>{
      const group=document.createElement('div');
      group.className='bt-command-column bt-command-'+name;
      group.append(...panels);
      return group;
    };
    row.classList.add('bt-command-stacked');
    const tools=document.createElement('div');
    tools.className='bt-command-tools';
    tools.append(picker,column('middle',box,contract),column('right',scalper,spot));
    row.append(column('left',feed,terminal),tools);
  }else{
    row.append(feed,picker,box,scalper);
  }
  paintCoin();
  return true;
}
if(!mountScalper()){
  const observer=new MutationObserver(()=>{
    if(mountScalper())observer.disconnect();
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

const positions=new Map();
function showScalp(message,exitSide){
  const separator=message.indexOf(' · ');
  const action=separator<0?message:message.slice(0,separator);
  const detail=separator<0?'':message.slice(separator+3);
  const label=exitSide?action+' '+exitSide.toUpperCase():action;
  if(scalpLabel.textContent!==label){
    const kind=action.startsWith('BUY UP')?'up':action.startsWith('BUY DOWN')?'down'
      :action.startsWith('HOLD')?'hold':action==='TAKE PROFIT'?'profit':action==='SELL FAST'?'fast'
      :/^(TIME EXIT|EXIT)/.test(action)?'exit':'wait';
    const [icon,background,color,move]=actionLooks[kind];
    scalpAction.style.background=background;
    scalpAction.style.color=color;
    scalpAction.style.boxShadow='0 4px 0 '+background+', 0 0 18px '+color+'44';
    scalpLabel.textContent=label;
    scalpIcon.textContent=icon;
    scalpMotion?.cancel();
    if(move&&!document.hidden&&!reducedMotion.matches&&!document.body.classList.contains('bt-arcade-muted')){
      scalpMotion=scalpIcon.animate?.([{transform:'none'},{transform:move},{transform:'none'}],
        {duration:kind==='fast'?300:550,iterations:kind==='fast'?3:2,easing:'ease-in-out'});
    }
  }
  if(scalpDetail.textContent!==detail)scalpDetail.textContent=detail;
}
function scalp(market,left,side,strong,quotes){
  const ticker=market.ticker;
  let entered=false;
  let tracked=positions.get(selectedCoin);
  if(tracked?.ticker!==ticker)tracked=null;
  if(!tracked){
    if(!strong||left<180||!['up','down'].includes(side)){
      showScalp('NO ENTRY · Waiting for aligned '+selectedCoin+' momentum and a tight spread');
      return;
    }
    tracked={ticker,side,entry:quotes[side].ask,exit:null};
    positions.set(selectedCoin,tracked);
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
  showScalp(action+' · '+ticker+' · '+Math.ceil(left)+'s left · Entry reference '+tracked.entry.toFixed(1)+'% · '+(tracked.exit?'Exit bid ':'Bid ')+displayedBid.toFixed(1)+'% · Move '+(displayedMove>=0?'+':'')+displayedMove.toFixed(1)+' pts',tracked.exit?tracked.side:null);
}
const state=box.querySelector('#btcLockState'),facts=box.querySelector('#btcLockFacts');
const directions=new Map();
let pendingVersion;
const price=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:Number(m?.[k]);
function waitForData(message){
  facts.textContent='';
  state.textContent='DATA WAIT · '+message;
  showScalp(state.textContent);
}
async function evaluate(){
  const version=selectionVersion,coin=selectedCoin;
  if(pendingVersion===version)return;
  pendingVersion=version;
  try{
    const [markets,e]=await Promise.all([
      fetch('/api/data?mode=markets',{cache:'no-store',signal:AbortSignal.timeout(15000)})
        .then(r=>r.ok?r.json():null)
        .then(d=>Math.abs(Date.now()-Date.parse(d?.fetched_at))<30000
          ? d.results??[]:[]).catch(()=>[]),
      coin==='BTC'?window.__BANK_TRADES_BTC_EVIDENCE__
        :window.bankTradesSpotEvidence?.(coin,AbortSignal.timeout(10000)).catch(()=>null)
    ]);
    if(version!==selectionVersion)return;
    const marketFor=asset=>markets.find(x=>x.asset===asset)?.market;
    const btcMarket=marketFor('BTC');
    for(const [asset,bot] of bots){
      const market=marketFor(asset);
      bot.setMarket(market?.ticker?.startsWith('KX'+asset+'15M-')?market:null);
    }
    if(coin!=='BTC')assess('BTC',btcMarket,window.__BANK_TRADES_BTC_EVIDENCE__,false);
    assess(coin,marketFor(coin),e,true);
  }finally{
    if(pendingVersion===version)pendingVersion=undefined;
  }
}
function assess(coin,market,e,visible){
  const unavailable=message=>{if(visible)waitForData(message)};
  if(!market?.ticker?.startsWith('KX'+coin+'15M-'))return unavailable('Kalshi '+coin+' 15-minute contract unavailable');
  if(!e||!Number.isFinite(e.at)||!Number.isFinite(e.candleAt)||Date.now()-e.at>90000||Date.now()-e.candleAt>180000||e.at>Date.now()||e.candleAt>e.at)return unavailable(coin+' spot candle evidence unavailable or stale');
  const expiry=Date.parse(market.expires_at),left=(expiry-Date.now())/1000,ya=price(market,'yes_ask'),yb=price(market,'yes_bid'),na=price(market,'no_ask'),nb=price(market,'no_bid');
  if(!Number.isFinite(left)||left<=0||left>900||![ya,yb,na,nb].every(Number.isFinite)||ya<yb||na<nb)return unavailable('Invalid '+coin+' market or quotes');
  const diff=e.bull-e.bear,side=diff>=3?'up':diff<=-3?'down':'mixed',ask=side==='up'?ya:na,bid=side==='up'?yb:nb,spread=Math.max(ya-yb,na-nb);
  const strong=side!=='mixed'&&e.direction===side&&Math.abs(diff)>=4&&spread<=3&&ask>=35&&ask<=80&&left>=180;
  const closeLeft=(Date.parse(market.close_time)-Date.now())/1000;
  if(visible){
    if(closeLeft>0&&closeLeft<=900&&
    [ya,yb,na,nb].every(value=>value>0&&value<100)){
      scalp(market,closeLeft,side,strong,{up:{ask:ya,bid:yb},down:{ask:na,bid:nb}});
    }else{
      showScalp('DATA WAIT · No open '+coin+' 15-minute contract with valid quotes');
    }
  }
  const quality=Math.max(0,Math.min(100,Math.round(35+Math.min(30,Math.abs(diff)*6)+Math.max(0,3-spread)*6+(left>=360?10:0))));
  const previous=directions.get(coin);
  const sameRound=previous?.ticker===market.ticker;
  const lastDirection=sameRound?previous.side:'mixed';
  const newCandle=!sameRound||e.candleAt>previous.candleAt;
  const confirmed=!strong?0:side!==lastDirection?1:previous.confirmed+Number(newCandle);
  const flipped=newCandle&&strong&&lastDirection!=='mixed'&&side!==lastDirection;
  directions.set(coin,{ticker:market.ticker,side,confirmed,candleAt:sameRound?Math.max(previous.candleAt,e.candleAt):e.candleAt});
  const label=flipped?'⚡ POSSIBLE FLIP '+side.toUpperCase():strong&&confirmed>=2?'🔐 '+side.toUpperCase()+' LOCK CANDIDATE':side!=='mixed'?'EARLY LEAN '+side.toUpperCase():'MIXED · NO LOCK';
  if(visible){
    state.textContent=label+' · '+Math.ceil(left/60)+' min remaining · '+(strong?'Spot/Kalshi evidence aligned':'Not enough independent agreement');
    facts.textContent='Evidence quality '+quality+'/100 · Bull '+e.bull+'/8 · Bear '+e.bear+'/8 · RSI '+Number(e.rsi).toFixed(1)+' · '+(side==='mixed'?'No direction':'Contract ask '+ask.toFixed(1)+'¢ / bid '+bid.toFixed(1)+'¢')+' · spread '+spread.toFixed(1)+'¢ · '+confirmed+' distinct confirming candles. Quality is a rule score, not win probability. Lock candidate ≠ settled win.';
  }
  if(coin==='BTC'){
    window.__BANK_TRADES_BTC_LOCK__={at:Date.now(),direction:side,lockCandidate:strong&&confirmed>=2,flipCandidate:flipped,secondsLeft:left,spread,ask,bid,quality,source:'BTC spot indicators and Kalshi quotes'};
    if(flipped){window.dispatchEvent(new CustomEvent('banktrades:btc-flip',{detail:window.__BANK_TRADES_BTC_LOCK__}))}
  }
}
waitForData('Checking '+selectedCoin+' market and spot feed');
botsFor('BTC');
refreshTitan();setInterval(refreshTitan,60000);
refreshV8Scoreboard();setInterval(refreshV8Scoreboard,60000);
refreshPredatorReport();setInterval(refreshPredatorReport,2000);
setInterval(()=>{if(!document.hidden){paintV8();paintSuperTracker();refreshSuperTracker();}},5000);
evaluate();setInterval(()=>{if(!document.hidden)evaluate()},30000);
})();