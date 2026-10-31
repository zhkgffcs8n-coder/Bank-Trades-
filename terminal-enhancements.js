(()=>{
'use strict';
const $=id=>document.getElementById(id),canvas=$('premiumChart');
if(!canvas)return;canvas.dataset.candles='true';
let selected='BTC',quotes=[],quoteTime=0,candles=[],chartTicker='',chartTime=0,requestId=0,lastRequest=0;
const status=document.createElement('p');status.className='premium-foot';canvas.after(status);
const metrics=document.createElement('p');metrics.className='premium-foot';status.after(metrics);
const banner=document.createElement('div');banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');banner.className='notice';banner.textContent='ALERT DESK · Waiting for fresh quotes';$('liveTerminal').before(banner);
const heading=document.createElement('h2');heading.textContent='ON-SCREEN ALERTS';
const alertPanel=document.createElement('section');alertPanel.className='card';alertPanel.append(heading);$('liveTerminal').after(alertPanel);
const entries=document.createElement('div');alertPanel.append(entries);
const journalKey='banktrades.observations.v1.'+window.__BANK_TRADES_USER_ID__;
let journal=[];try{journal=JSON.parse(localStorage.getItem(journalKey)||'[]');if(!Array.isArray(journal))journal=[]}catch{}
const save=()=>{try{localStorage.setItem(journalKey,JSON.stringify(journal.slice(-200)))}catch{}};
const quote=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:m?.[k]!=null?Number(m[k]):NaN;
const label=a=>a.replace('BUY YES','BUY UP').replace('BUY NO','BUY DOWN');
function observations(){
 const out=$('observationJournal'),stats=$('observationStats');if(!out||!stats)return;
 const done=journal.filter(x=>Number.isFinite(x.delta));stats.textContent=journal.length+' logged alerts · '+done.length+' measured at 60s · Model untrained';
 out.replaceChildren();journal.slice(-10).reverse().forEach(x=>{const row=document.createElement('p');row.textContent=new Date(x.at).toLocaleTimeString()+' · '+x.asset+' '+label(x.action)+' · '+(Number.isFinite(x.delta)?'60s bid minus entry ask: '+x.delta.toFixed(1)+'¢ / contract':x.expired?'Observation unavailable':'Waiting for fresh 60s observation');out.append(row)});
}
function draw(){
 const rect=canvas.getBoundingClientRect(),w=Math.max(200,rect.width),h=Math.max(160,rect.height),dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=w*dpr;canvas.height=h*dpr;const c=canvas.getContext('2d');c.scale(dpr,dpr);c.clearRect(0,0,w,h);
 const points=candles.slice(-60),pad=38,bottom=h-30,plot=bottom-15;
 c.font='10px system-ui';c.fillStyle='#91a3bb';
 if(!points.length){c.fillText('No verified candle data available',15,25);metrics.textContent='EMA / RSI unavailable';return}
 const low=Math.max(0,Math.min(...points.map(x=>x.l))-2),high=Math.min(100,Math.max(...points.map(x=>x.h))+2),range=Math.max(1,high-low),y=v=>bottom-(v-low)/range*plot;
 c.strokeStyle='#1e2e40';for(let i=0;i<5;i++){const v=low+i*range/4;c.beginPath();c.moveTo(0,y(v));c.lineTo(w-pad,y(v));c.stroke();c.fillText(v.toFixed(0)+'¢',w-pad+3,y(v)+3)}
 const minTime=points[0].t-60,maxTime=points[points.length-1].t+60;
 const x=t=>10+(t-minTime)/(maxTime-minTime)*(w-pad-20),bar=Math.max(2,Math.min(14,(w-pad)/Math.max(points.length,15)*.6));
 points.forEach(p=>{c.strokeStyle=c.fillStyle=p.c>=p.o?'#32e4a0':'#ff5774';c.beginPath();c.moveTo(x(p.t),y(p.h));c.lineTo(x(p.t),y(p.l));c.stroke();c.fillRect(x(p.t)-bar/2,Math.min(y(p.o),y(p.c)),bar,Math.max(1,Math.abs(y(p.c)-y(p.o))))});
 let ema=points[0].c;c.strokeStyle='#f5c455';c.beginPath();points.forEach((p,i)=>{ema=i?p.c/3+ema*2/3:p.c;i?c.lineTo(x(p.t),y(ema)):c.moveTo(x(p.t),y(ema))});c.stroke();
 const tail=points.slice(-15);let rsi='—';if(tail.length===15){let gain=0,loss=0;tail.slice(1).forEach((p,i)=>{const diff=p.c-tail[i].c;gain+=Math.max(0,diff);loss+=Math.max(0,-diff)});rsi=(gain+loss===0?50:100*gain/(gain+loss)).toFixed(1)}
 const emaCalc=(length)=>{let v=points[0].c;return points.map((p,i)=>v=i?v+(p.c-v)*2/(length+1):p.c)};
 const e9=emaCalc(9),e21=emaCalc(21),e50=emaCalc(50);
 for(const [series,color] of [[e9,'#39d5e8'],[e21,'#f5aa35'],[e50,'#dc73e8']]){c.strokeStyle=color;c.lineWidth=1.7;c.beginPath();series.forEach((v,i)=>i?c.lineTo(x(points[i].t),y(v)):c.moveTo(x(points[i].t),y(v)));c.stroke();c.lineWidth=1}
 const highPivot=Math.max(...points.slice(-Math.min(points.length,15)).map(p=>p.h));
 const lowPivot=Math.min(...points.slice(-Math.min(points.length,15)).map(p=>p.l));
 for(const [price,color] of [[highPivot,'#ff8091'],[lowPivot,'#50e6b4']]){c.strokeStyle=color;c.setLineDash([5,5]);c.beginPath();c.moveTo(8,y(price));c.lineTo(w-pad,y(price));c.stroke();c.setLineDash([])}
 const last=points[points.length-1],prior=points.slice(-11,-1);
 if(prior.length>=5){const priorLow=Math.min(...prior.map(p=>p.l)),priorHigh=Math.max(...prior.map(p=>p.h));const sweepLow=last.l<priorLow&&last.c>priorLow,sweepHigh=last.h>priorHigh&&last.c<priorHigh;
  if(sweepLow||sweepHigh){c.fillStyle=sweepLow?'#50e6b4':'#ff8091';c.font='bold 11px system-ui';c.fillText(sweepLow?'LOW SWEEP':'HIGH SWEEP',Math.max(8,x(last.t)-75),Math.max(14,Math.min(h-38,y(last.c)+(sweepLow?18:-12))))}}
 metrics.textContent='EMA 5: '+(points.length>=5?ema.toFixed(1)+'¢':'warming up')+' · RSI 14 (simple): '+rsi+' · Descriptive indicators only';
 c.fillStyle='#91a3bb';c.fillText(new Date(points[0].t*1000).toLocaleTimeString(),8,h-8);
}
async function loadCandles(force=false){
 const row=quotes.find(x=>x.asset===selected),m=row?.market;
 if(!m||Date.now()-quoteTime>25000){status.textContent='Candle request paused: fresh active market required';return}
 if(!force&&Date.now()-lastRequest<60000&&chartTicker===m.ticker)return;lastRequest=Date.now();
 const id=++requestId,asset=selected,ticker=m.ticker;
 if(chartTicker!==ticker){candles=[];chartTicker=ticker;draw()}
 status.textContent='Loading one-minute YES bid candles…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
 const r=await fetch('/api/data?mode=candles&asset='+encodeURIComponent(asset)+'&ticker='+encodeURIComponent(ticker),{cache:'no-store',signal:controller.signal});
 if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();if(id!==requestId)return;
 if(d.ticker!==ticker||!Number.isFinite(Date.parse(d.fetched_at))||Math.abs(Date.now()-Date.parse(d.fetched_at))>30000)throw Error('Invalid candle response');
 candles=(d.candlesticks||[]).map(p=>{const b=p.yes_bid||{},n=k=>b[k+'_dollars']!=null?Number(b[k+'_dollars'])*100:b[k]!=null?Number(b[k]):NaN;return {t:Number(p.end_period_ts),o:n('open'),h:n('high'),l:n('low'),c:n('close')}}).filter(p=>[p.t,p.o,p.h,p.l,p.c].every(Number.isFinite)&&p.t*1000<=Date.now()&&p.l>=0&&p.h<=100&&p.l<=Math.min(p.o,p.c)&&p.h>=Math.max(p.o,p.c)).sort((a,b)=>a.t-b.t);
 chartTime=Date.now();$('premiumChartTitle').textContent=asset+' · '+ticker+' · 1m YES bid candles';
 status.textContent=candles.length?candles.length+' completed candles · refreshed '+new Date().toLocaleTimeString():'No completed candles yet';draw();
 }catch(e){if(id!==requestId)return;candles=[];draw();status.textContent='Candle feed unavailable: '+e.message}finally{clearTimeout(timer)}
}
const lastActions=new Map();
window.addEventListener('banktrades:quotes',e=>{
 quotes=e.detail.rows;quoteTime=e.detail.fetched;
 const now=Date.now();for(const j of journal){if(j.delta!=null||j.expired||now-j.at<60000)continue;const m=quotes.find(x=>x.market?.ticker===j.ticker)?.market;if(now-j.at>90000||!m){j.expired=true;continue}const bid=quote(m,j.action==='BUY YES'?'yes_bid':'no_bid');if(Number.isFinite(bid)&&now-quoteTime<25000){j.delta=bid-j.entry;j.measuredAt=now}}
 save();observations();loadCandles();
});
window.addEventListener('banktrades:signals',e=>{
 const signals=e.detail||[],sig=signals.find(x=>x.asset===selected);
 if(sig){banner.textContent=selected+' · '+label(sig.action)+' · '+sig.reason;banner.style.borderColor=sig.action==='WAIT'?'#80652c':sig.action==='BUY YES'?'#32e4a0':'#ff5774'}
 for(const s of signals){const key=s.asset+':'+s.ticker,prior=lastActions.get(key);lastActions.set(key,s.action);if(s.action==='WAIT'||prior===s.action)continue;
 const line=document.createElement('p');line.textContent=new Date().toLocaleTimeString()+' · '+s.asset+' · '+label(s.action)+' · EXPERIMENTAL';entries.prepend(line);while(entries.children.length>12)entries.lastChild.remove();
 if(!journal.some(j=>j.ticker===s.ticker&&j.action===s.action)&&Number.isFinite(s.ask)){journal.push({asset:s.asset,ticker:s.ticker,action:s.action,entry:s.ask*100,at:Date.now()});journal=journal.slice(-200);save();observations()}
 }
});
window.addEventListener('banktrades:select',e=>{selected=e.detail;loadCandles(true)});
window.addEventListener('resize',draw);
setInterval(()=>{if(!document.hidden){loadCandles();if(chartTime&&Date.now()-chartTime>75000)status.textContent='Candle display stale · waiting for refresh'}},1000);
observations();draw();
})();