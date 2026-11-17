(()=>{'use strict';const anchor=document.getElementById('premiumChart');if(!anchor)return;
const section=document.createElement('section');section.className='card';section.innerHTML='<h2>BTCUSD · TECHNICAL CHART</h2><p class="premium-foot">Coinbase BTC-USD · completed candles · volatility cone shows recent price dispersion.</p><canvas class="premium-chart" id="btcSpotChart" style="width:100%;height:390px"></canvas><p class="premium-foot" id="btcSpotStatus">Loading BTC price candles…</p><div class="notice" id="btcSpotAnalysis">Collecting completed candles</div>';
anchor.parentElement.after(section);const canvas=section.querySelector('canvas'),status=section.querySelector('#btcSpotStatus'),analysis=section.querySelector('#btcSpotAnalysis');let candles=[];
function ema(values,n){let e=values[0];return values.map((v,i)=>e=i?e+(v-e)*2/(n+1):v)}
const controls=document.createElement('div');
controls.className='radar-chart-controls';
controls.innerHTML=`<div aria-label="Candle timeframe">${[1,3,5,15,60,240].map(n=>'<button type="button" data-frame="'+n+'" aria-pressed="'+(n===1)+'">'+(n<60?n+'m':n/60+'H')+'</button>').join('')}</div>
<div aria-label="Chart overlays">${['EMA','VOL','SIGNALS','S/R','VWAP','PATTERN','CONE'].map((name,i)=>'<button type="button" data-overlay="'+name+'" aria-pressed="'+(i<4||i===6)+'">'+name+'</button>').join('')}</div>`;
const readout=document.createElement('p');
readout.className='premium-foot radar-chart-ohlc';
canvas.before(controls,readout);
let frame=1,frameCandles=[],generation=0,signalMarkers=[],contract;
window.addEventListener('banktrades:premium-contracts',({detail})=>{
 contract=detail.contracts.find(c=>c.asset==='BTC');
});
const overlays=new Set(['EMA','VOL','SIGNALS','S/R','CONE']);
function aggregate(rows,minutes,base){
 if(minutes===base)return rows;
 const size=minutes*60,groups=new Map();
 for(const bar of rows){
  const t=Math.floor(bar.t/size)*size;
  const bucket=groups.get(t)||[];
  bucket.push(bar);groups.set(t,bucket);
 }
 return [...groups].filter(([t,b])=>b.length===minutes/base&&b.every((x,i)=>x.t===t+i*base*60))
  .map(([t,b])=>({t,open:b[0].open,high:Math.max(...b.map(x=>x.high)),low:Math.min(...b.map(x=>x.low)),close:b.at(-1).close,volume:b.reduce((n,x)=>n+(x.volume||0),0)}));
}
async function refreshFrame(){
 if(frame===1){render();return;}
 const current=frame,id=++generation,base=current===3?1:current===240?60:current;
 try{
  const rows=base===1?candles:await fetchSpotCandles('BTC',AbortSignal.timeout(8000),base*60);
  if(id!==generation||current!==frame)return;
  frameCandles=aggregate(rows,current,base);
 }catch{if(id!==generation)return;frameCandles=[];}
 render();
}
controls.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.frame){
  const next=Number(button.dataset.frame);if(next===frame)return;
  frame=next;generation++;frameCandles=[];
  controls.querySelectorAll('[data-frame]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
  render();refreshFrame();
 }else{
  const key=button.dataset.overlay;
  if(overlays.has(key))overlays.delete(key);else overlays.add(key);
  button.setAttribute('aria-pressed',String(overlays.has(key)));render();
 }
});
window.addEventListener('banktrades:shared-signals',({detail})=>{
 const signal=detail.find(row=>row.asset==='BTC'&&!row.displayEntryBlock&&/^BUY (UP|DOWN|YES|NO)$/.test(row.action));
 if(signal&&!signalMarkers.some(m=>m.ticker===signal.ticker&&m.action===signal.action)){
  signalMarkers.push({ticker:signal.ticker,action:signal.action,t:Date.now()/1000,up:/UP|YES/.test(signal.action)});
  signalMarkers=signalMarkers.slice(-80);render();
 }
});
function render(){
 const w=Math.max(240,canvas.clientWidth),h=390,dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=w*dpr;canvas.height=h*dpr;
 const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
 const history=frame===1?candles:frameCandles,p=history.slice(-60),last=p.at(-1);
 if(!last){readout.textContent='Waiting for completed '+(frame<60?frame+'m':frame/60+'H')+' candles';return;}
 const prices=history.map(x=>x.close),lines=[9,21,50].map(n=>ema(prices,n).slice(-p.length));
 const prior=p.slice(-21,-1),support=Math.min(...prior.map(z=>z.low)),resistance=Math.max(...prior.map(z=>z.high));
 const moves=p.slice(1).map((q,i)=>q.close-p[i].close);
 const cone=moves.length>=10&&overlays.has('CONE')?Math.sqrt(moves.reduce((n,v)=>n+v*v,0)/moves.length)*Math.sqrt(3):0;
 const strike=contract?.close>Date.now()&&contract.strike>0?contract.strike:null;
 const levels=[last.close-cone,last.close+cone,...p.flatMap(q=>[q.low,q.high])];
 const min=Math.min(...levels),max=Math.max(...levels),pad=Math.max(1,(max-min)*.1);
 const left=7,right=w-60,edge=cone?right-30:right,bottom=222;
 const x=i=>left+i*(edge-left)/Math.max(1,p.length-1),y=v=>bottom-(v-min+pad)/(max-min+2*pad)*205;
 const line=(x1,y1,x2,y2,color)=>{ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
 const label=(text,x,y,color)=>{ctx.fillStyle=color;ctx.fillText(text,x,y);};
 const path=(values,color,map)=>{ctx.strokeStyle=color;ctx.beginPath();values.forEach((value,i)=>i?ctx.lineTo(x(i),map(value)):ctx.moveTo(x(i),map(value)));ctx.stroke();};
 ctx.font='10px system-ui';
 for(let i=0;i<5;i++){const value=min+(max-min)*i/4;line(left,y(value),right,y(value),'#28364a');label(value.toFixed(0),right+4,y(value),'#a1b6d1');}
 if(cone){
  ctx.fillStyle='#756aff40';ctx.beginPath();ctx.moveTo(edge,y(last.close));ctx.lineTo(right,y(last.close+cone));ctx.lineTo(right,y(last.close-cone));ctx.closePath();ctx.fill();ctx.strokeStyle='#888eff';ctx.stroke();
 }
 if(strike!==null&&strike>=min-pad&&strike<=max+pad){
  ctx.setLineDash([4,3]);line(left,y(strike),right,y(strike),'#f6be61');ctx.setLineDash([]);
  label('KALSHI STRIKE',left,y(strike)-3,'#f6be61');
 }
 if(overlays.has('S/R')&&prior.length){
  for(const [value,name,color] of [[support,'SUPPORT','#35dda0'],[resistance,'RESISTANCE','#ff6b7f']]){line(left,y(value),right,y(value),color);label(name,left,y(value)-3,color);}
 }
 const peak=Math.max(1,...p.map(q=>q.volume||0));
 p.forEach((q,i)=>{
  const color=q.close>=q.open?'#35dda0':'#ff6b7f';
  line(x(i),y(q.high),x(i),y(q.low),color);ctx.fillStyle=color;
  ctx.fillRect(x(i)-1.5,Math.min(y(q.open),y(q.close)),3,Math.max(1,Math.abs(y(q.open)-y(q.close))));
  if(overlays.has('VOL'))ctx.fillRect(x(i)-1,267-25*(q.volume||0)/peak,2,25*(q.volume||0)/peak);
 });
 if(overlays.has('EMA'))lines.forEach((values,i)=>path(values,['#f6be61','#64b2ff','#c38aff'][i],y));
 if(overlays.has('VWAP')){
  let sum=0,volume=0;
  path(p.map(q=>{volume+=q.volume||0;sum+=((q.high+q.low+q.close)/3)*(q.volume||0);return volume?sum/volume:q.close;}),'#e5eaf5',y);
 }
 if(overlays.has('SIGNALS')){
  for(const mark of signalMarkers){
   const i=p.findIndex(q=>mark.t>=q.t&&mark.t<q.t+frame*60);
   if(i>=0)label(mark.up?'▲':'▼',x(i),y(mark.up?p[i].low:p[i].high)+(mark.up?12:-6),mark.up?'#35dda0':'#ff6b7f');
  }
 }
 const rsi=p.map((_,i)=>{
  const end=history.length-p.length+i,delta=prices.slice(Math.max(0,end-14),end+1);
  let up=0,down=0;
  for(let j=1;j<delta.length;j++){const n=delta[j]-delta[j-1];up+=Math.max(n,0);down+=Math.max(-n,0);}
  return down?100-100/(1+up/down):up?100:50;
 });
 const ema26=ema(prices,26);
 const diff=ema(prices,12).map((value,i)=>value-ema26[i]);
 function drawMomentum(){
  const hist=ema(diff,9).map((value,i)=>diff[i]-value).slice(-p.length),peak=Math.max(.01,...hist.map(Math.abs));
  label('MACD momentum',left,345,'#a1b6d1');
  hist.forEach((value,i)=>{ctx.fillStyle=value>=0?'#35dda0':'#ff6b7f';ctx.fillRect(x(i)-1,value>=0?370-17*value/peak:370,2,17*Math.abs(value)/peak);});
 }
 const rsiY=value=>328-value*.42;
 if(overlays.has('VOL'))label('Volume',left,239,'#a1b6d1');
 label('RSI 14',left,281,'#a1b6d1');
 for(const level of [30,70]){line(left,rsiY(level),right,rsiY(level),'#28364a');label(String(level),right+4,rsiY(level),'#a1b6d1');}
 path(rsi,'#f6be61',rsiY);drawMomentum();
 const doji=last.high>last.low&&Math.abs(last.close-last.open)/(last.high-last.low)<=.1;
 if(overlays.has('PATTERN')&&doji)label('DOJI',Math.max(left,edge-25),y(last.high)-7,'#a2eddb');
 readout.textContent=['O','H','L','C'].map((key,i)=>key+' '+[last.open,last.high,last.low,last.close][i].toFixed(2)).join(' · ')+(overlays.has('PATTERN')?(doji?' · Closed doji':' · No closed doji'):'');
}
function spotAnalysis(candles,asset){if(candles.length<65)return null;const q=candles.slice(-100),cl=q.map(z=>z.close),v=q.map(z=>z.volume),last=q[q.length-1];const fast=ema(cl,9),mid=ema(cl,21),slow=ema(cl,50),e12=ema(cl,12),e26=ema(cl,26),macd=e12.map((x,i)=>x-e26[i]),signal=ema(macd,9),hist=macd.map((x,i)=>x-signal[i]);let gain=0,loss=0;for(let i=cl.length-14;i<cl.length;i++){const d=cl[i]-cl[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d)}const rsi=loss===0?(gain===0?50:100):100-100/(1+gain/loss);const avgv=v.slice(-21,-1).reduce((a,b)=>a+b,0)/20,volRatio=avgv>0?last.volume/avgv:null;const recent=q.slice(-11,-1),low=Math.min(...recent.map(z=>z.low)),high=Math.max(...recent.map(z=>z.high)),lowSweep=last.low<low&&last.close>low,highSweep=last.high>high&&last.close<high;const up=fast.at(-1)>mid.at(-1)&&mid.at(-1)>slow.at(-1),down=fast.at(-1)<mid.at(-1)&&mid.at(-1)<slow.at(-1);const bull=(up?2:0)+(rsi>=55?1:0)+(hist.at(-1)>0?1:0)+(hist.at(-1)>hist.at(-2)?1:0)+(lowSweep?2:0)+(volRatio>1.25&&last.close>last.open?1:0);const bear=(down?2:0)+(rsi<=45?1:0)+(hist.at(-1)<0?1:0)+(hist.at(-1)<hist.at(-2)?1:0)+(highSweep?2:0)+(volRatio>1.25&&last.close<last.open?1:0);const candles15=q.filter(z=>Math.floor(z.t/900)===Math.floor(last.t/900));const bucket=Math.floor(last.t/900),prev=q.filter(z=>Math.floor(z.t/900)===bucket-1);const prev15=prev.length>=14?prev.at(-1).close-prev[0].open:null;const consensus=bull>=5&&bull>=bear+2?'BULLISH EVIDENCE':bear>=5&&bear>=bull+2?'BEARISH EVIDENCE':'MIXED EVIDENCE';const evidence={at:Date.now(),candleAt:last.t*1000,close:last.close,bull,bear,direction:consensus==='BULLISH EVIDENCE'?'up':consensus==='BEARISH EVIDENCE'?'down':'mixed',rsi,ema9:fast.at(-1),ema21:mid.at(-1),ema50:slow.at(-1),support:low,resistance:high,rangePct:(last.high-last.low)/last.close*100,macdHistogram:hist.at(-1),volumeRatio:volRatio,lowSweep,highSweep,source:'Coinbase '+asset+'-USD completed 1m candles'};return {evidence,summary:asset+' 15m research · '+consensus+' · Bull '+bull+'/8 vs Bear '+bear+'/8 · RSI(14) '+rsi.toFixed(1)+' · MACD hist '+hist.at(-1).toFixed(2)+' · Volume '+(volRatio===null?'N/A':volRatio.toFixed(2)+'x')+' · Prior 15m change '+(prev15===null?'not ready':(prev15>=0?'+':'')+prev15.toFixed(2))+' USD · '+(lowSweep?'LOW SWEEP':highSweep?'HIGH SWEEP':'No sweep')+' · Indicators are descriptive, not calibrated odds or guaranteed flips.'}}
async function fetchSpotCandles(asset,signal,granularity=60){
 const r=await fetch('/api/data?mode=asset-candles&asset='+encodeURIComponent(asset)+'&granularity='+granularity,{cache:'no-store',signal});
 if(!r.ok)throw Error(asset+' candle feed HTTP '+r.status);
 const d=await r.json();
 if(d.asset!==asset)throw Error('Unexpected spot asset');
 if(!Number.isFinite(Date.parse(d.fetched_at))||Math.abs(Date.now()-Date.parse(d.fetched_at))>30000||!Array.isArray(d.candles))throw Error('Stale or invalid candles');
 return d.candles.filter(p=>[p.t,p.open,p.high,p.low,p.close].every(Number.isFinite)&&p.low>0&&p.high>=p.low&&p.open>=p.low&&p.open<=p.high&&p.close>=p.low&&p.close<=p.high&&(p.t+granularity)*1000<=Date.now()).sort((a,b)=>a.t-b.t);
}
window.bankTradesSpotEvidence=async(asset,signal)=>spotAnalysis(await fetchSpotCandles(asset,signal),asset)?.evidence;
let busy=false;async function update(){if(busy||document.hidden)return;busy=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{candles=await fetchSpotCandles('BTC',controller.signal);if(!candles.length)throw Error('No completed candles');status.textContent=candles.length+' completed BTCUSD 1m candles · last '+new Date(candles[candles.length-1].t*1000).toLocaleTimeString()+' · updated '+new Date().toLocaleTimeString();render();if(frame!==1)refreshFrame();const result=spotAnalysis(candles,'BTC');window.__BANK_TRADES_BTC_EVIDENCE__=result?.evidence;window.dispatchEvent(new CustomEvent('banktrades:btc-analysis',{detail:result?.evidence}));analysis.textContent=result?.summary||'Insufficient completed candles for multi-indicator analysis'}catch(e){status.textContent='BTC spot chart unavailable: '+e.message;window.__BANK_TRADES_BTC_EVIDENCE__=null;window.dispatchEvent(new CustomEvent('banktrades:btc-analysis',{detail:null}));analysis.textContent='No current independent BTC confirmation available'}finally{clearTimeout(timer);busy=false}}
window.addEventListener('resize',render);update();setInterval(update,30000)})();
