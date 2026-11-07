(()=>{'use strict';
const chart=document.getElementById('btcSpotChart');if(!chart)return;
const box=document.createElement('section');box.className='card';box.id='btcLockDesk';box.innerHTML='<h2>🔐 BTC 15-MIN · LOCK & FLIP RADAR</h2><div id="btcLockState" class="notice" role="status" aria-live="polite">Collecting independent candle evidence…</div><p id="btcLockFacts" class="premium-foot">A lock candidate is not a confirmed win. Actual settlement determines the result.</p><p class="premium-foot">Uses completed Coinbase BTC-USD candles plus Kalshi quote agreement. No fixed 93% accuracy claim; not the TradingView proprietary script. Paper research only.</p>';chart.closest('section')?.append(box);
const scalper=document.createElement('section');
scalper.className='card';
scalper.id='btcProScalper';
scalper.style.cssText='box-sizing:border-box;margin:12px 0;padding:clamp(18px,2.5vw,32px);border:2px solid #60a5fa;border-radius:16px;background:#0b1728;color:#f8fafc;overflow-wrap:anywhere';
scalper.innerHTML='<h2 style="margin:0 0 18px;font-size:clamp(20px,2vw,30px)">⚡ BTC 15-MIN PRO SCALPER</h2><div role="status" aria-live="polite"><strong data-action style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid currentColor;border-radius:14px;font-size:clamp(20px,2.7vw,40px);line-height:1.12"><span data-icon aria-hidden="true" style="display:inline-block;flex:none"></span><span data-label></span></strong><p data-detail style="font-size:16px;line-height:1.55"></p></div><p class="premium-foot">Research signals only. Entry uses the ask and exit uses the bid. Quote changes exclude fees.</p>';
box.before(scalper);
const shadow=document.createElement('p');
shadow.style.cssText='margin:6px 0;padding:8px;border:1px solid #526aaf;border-radius:9px;font-size:13px;line-height:1.4';
shadow.textContent='V5 SHADOW · Waiting for BTC trades and executable depth';
const researchReadouts=document.createElement('div');
researchReadouts.append(shadow);
scalper.append(researchReadouts);
const journalKey='banktrades:btc-v5-shadow-v1';
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
    socket.onopen=()=>socket.send(JSON.stringify({type:'subscribe',channel:'market_trades',product_ids:['BTC-USD']}));
    socket.onmessage=({data})=>{
      let message;
      try{message=JSON.parse(data)}catch{return}
      if(message.channel!=='market_trades')return;
      const now=Date.now();
      for(const event of message.events||[]){
        if(event.type!=='update')continue;
        for(const trade of event.trades||[]){
          const time=Date.parse(trade.time),price=Number(trade.price),size=Number(trade.size);
          if(trade.product_id!=='BTC-USD'||time>now+2000||time<now-30000||
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
researchReadouts.append(challenger);
const titan=document.createElement('p');
titan.style.cssText=shadow.style.cssText;
titan.textContent='🤖 TITAN V7 · Waiting for server research';
researchReadouts.append(titan);
async function refreshTitan(){
  if(document.hidden)return;
  try{
    const response=await fetch('/.netlify/functions/omega-live-health',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Research report unavailable');
    const {titanShadow:report}=await response.json();
    if(!report){titan.textContent='🤖 TITAN V7 · Waiting for a fresh server report';return}
    const latest=report.latest;
    if(latest){
      window.dispatchEvent(new CustomEvent('banktrades:titan-observation',{detail:{
        ticker:latest.ticker,at:latest.at,decision:latest.decision,scored:report.scored,trades:report.trades
      }}));
    }
    titan.textContent='🤖 TITAN V7 SHADOW · '+(latest?latest.decision+' · '+latest.reason.replaceAll('_',' ').toLowerCase():'Collecting qualified BTC observations')+
      ' · '+report.scored+' officially scored rounds · '+report.trades+' simulated trades'+
      (report.scored?' · Titan / market Brier '+report.brier.toFixed(3)+' / '+report.marketBrier.toFixed(3):'')+
      (report.trades?' · Simulated net '+(report.simulatedNetPnl*100).toFixed(1)+'¢':'');
  }catch{titan.textContent='🤖 TITAN V7 · Server research unavailable'}
}
refreshTitan();
setInterval(refreshTitan,60000);

const v6Key='banktrades:btc-v6-forward-v1';
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
  const scale=Math.max(5,...rows.map(t=>Math.abs(t.price-(latest?.price??0))));
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
  const set=message=>{
    if(lastRound?.ticker===market?.ticker&&lastRound)lastRound.reason=message;
    const exits=journal.filter(row=>row.event==='EXIT'&&Number.isFinite(row.pnl));
    const net=exits.reduce((total,row)=>total+row.pnl,0);
    shadow.textContent='V5 SHADOW · '+message+' · Local simulated exits '+exits.length+
      ' · Est. total '+(net*100).toFixed(1)+'¢';
  };
  if(shadowPosition&&(shadowPosition.ticker!==market?.ticker||left<=0)){
    record({event:'UNRESOLVED',ticker:shadowPosition.ticker,reason:'No fresh executable exit before rollover'});
    shadowPosition=null;
  }
  if(!market||!(left>0&&left<=900)){set('Waiting for an open BTC round');return}
  const latest=trades.at(-1),recent=trades.filter(t=>t.time>=now-15000);
  const tapeReady=latest&&now-latest.time<=5000&&recent.length>=10&&latest.time-recent[0].time>=5000;
  if(!tapeReady&&!shadowPosition&&!v6Position){set('Waiting for fresh Coinbase trade flow');return}
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
    const spread=1-yes.price-no.price,latency=Math.round(performance.now()-start);
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
      set((exit||'HOLD '+position.side)+' · Bid '+cents(bid)+' · Est. net '+(pnl*100).toFixed(1)+'¢ · '+Math.ceil(remaining)+'s left');
      return;
    }
    if(evaluated.has(market.ticker)){set('Round logged · one shadow entry per round');return}
    const strike=Number(market.floor_strike);
    if(!tapeReady||current-latest.time>5000||!Number.isFinite(strike)||strike<=0){
      set('Waiting for fresh trade flow and a numeric Kalshi threshold');return;
    }
    const volume=recent.reduce((sum,t)=>sum+Math.abs(t.flow),0);
    const pressure=recent.reduce((sum,t)=>sum+t.flow,0)/volume;
    const momentum=latest.price-recent[0].price;
    const prices=recent.map(t=>t.price);
    const range=Math.max(...prices)-Math.min(...prices);
    const horizon=Math.max(8,range*Math.sqrt(remaining/15));
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
    set('EARLY BUY '+side+' · '+cents(ask)+' · Heuristic value '+Math.round(probability*100)+'% · Est. edge '+(edge*100).toFixed(1)+'¢ · '+Math.ceil(remaining)+'s left'+telemetry);
  }catch{set('Waiting for executable Kalshi depth')}
  finally{bookBusy=false}
}
setInterval(scanShadow,5000);

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
function mountScalper(){
  const feed=document.getElementById('btVerifiedAlertFeed');
  if(!feed)return false;
  const row=document.createElement('div');
  row.style.position='relative';
  feed.before(row);
  const backdrop=document.createElement('div');
  backdrop.setAttribute('aria-hidden','true');
  backdrop.style.cssText='position:absolute;right:1px;background:#101e30;border-radius:0 11px 11px 0;pointer-events:none';
  row.append(feed,backdrop,scalper);

  function layout(){
    const feedBounds=feed.getBoundingClientRect();
    const range=document.createRange();
    let textRight=feedBounds.left;
    for(const line of feed.children){
      range.selectNodeContents(line);
      textRight=Math.max(textRight,range.getBoundingClientRect().right);
    }
    const width=Math.min(560,Math.floor(feedBounds.width*0.48),Math.floor(feedBounds.right-textRight-36));
    const inline=width>=340;
    scalper.style.position=inline?'absolute':'';
    scalper.style.right=inline?'12px':'';
    scalper.style.top=inline?feed.offsetTop+'px':'';
    scalper.style.width=inline?width+'px':'';
    const panelHeight=inline?scalper.offsetHeight+24:0;
    row.style.minHeight=inline&&panelHeight>feed.offsetHeight?(feed.offsetTop+panelHeight)+'px':'';
    backdrop.hidden=!inline;
    if(inline){
      backdrop.style.top=(feed.offsetTop+1)+'px';
      backdrop.style.height=(Math.max(feed.offsetHeight,panelHeight)-2)+'px';
      backdrop.style.width=(width+23)+'px';
    }
  }

  const observer=new ResizeObserver(layout);
  observer.observe(feed);
  observer.observe(scalper);
  new MutationObserver(layout).observe(feed,{childList:true});
  layout();
  return true;
}
if(!mountScalper()){
  const observer=new MutationObserver(()=>{
    if(mountScalper())observer.disconnect();
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

let tracked=null,busy=false;
function showScalp(message){
  const separator=message.indexOf(' · ');
  const action=separator<0?message:message.slice(0,separator);
  const detail=separator<0?'':message.slice(separator+3);
  if(scalpLabel.textContent!==action){
    const kind=action.startsWith('BUY UP')?'up':action.startsWith('BUY DOWN')?'down'
      :action.startsWith('HOLD')?'hold':action==='TAKE PROFIT'?'profit':action==='SELL FAST'?'fast'
      :/^(TIME EXIT|EXIT)/.test(action)?'exit':'wait';
    const [icon,background,color,move]=actionLooks[kind];
    scalpAction.style.background=background;
    scalpAction.style.color=color;
    scalpAction.style.boxShadow='0 4px 0 '+background+', 0 0 18px '+color+'44';
    scalpLabel.textContent=action;
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
const e=window.__BANK_TRADES_BTC_EVIDENCE__;if(!e||Date.now()-e.at>90000||Date.now()-e.candleAt>180000){state.textContent='DATA WAIT · BTC spot candle evidence unavailable or stale';showScalp(state.textContent);return}
let market=null;try{const r=await fetch('/api/data?mode=markets',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(r.ok){const d=await r.json();if(Math.abs(Date.now()-Date.parse(d.fetched_at))<30000)market=(d.results||[]).find(x=>String(x.asset).toUpperCase()==='BTC')?.market}}catch{}
if(/^KXBTC15M-/.test(market?.ticker))shadowMarket=market;
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