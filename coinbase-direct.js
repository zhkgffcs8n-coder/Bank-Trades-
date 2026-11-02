(()=>{'use strict';
const products=['BTC-USD','ETH-USD','SOL-USD','XRP-USD','DOGE-USD','LTC-USD','BCH-USD','ETC-USD','ZEC-USD'];
const host=document.getElementById('coinbaseDirect');if(!host)return;
host.innerHTML='<h2>COINBASE DIRECT · PRIMAL MARKET CONTEXT</h2><p id="cbStatus">Connecting to Coinbase WebSocket…</p><div class="toolbar"><label>Market <select id="cbAsset"></select></label><label>Timeframe <select id="cbFrame"></select></label></div><div id="cbStats" class="metrics"></div><p id="cbInsight" class="premium-foot">Spot indicators are context only, not calibrated Kalshi trade signals.</p><canvas id="cbCanvas" width="900" height="250" aria-label="Coinbase live price chart"></canvas><p class="premium-foot">Coinbase spot stream is not a Kalshi contract quote. Live feed status and timestamps shown above. Hourly Coinbase history is used only for 1h/4h context. Shorter timeframes use live ticks gathered while this tab is open; no 45-day history or verified trading edge is claimed.</p>';
const asset=document.getElementById('cbAsset'),frame=document.getElementById('cbFrame'),status=document.getElementById('cbStatus'),stats=document.getElementById('cbStats'),insight=document.getElementById('cbInsight'),canvas=document.getElementById('cbCanvas');
products.forEach(p=>asset.add(new Option(p,p)));[1,3,5,15,30,60,240].forEach(n=>frame.add(new Option(n<60?n+'m':n/60+'h',String(n))));
const series=new Map(products.map(p=>[p,[]])),hourlyHistory=new Map(products.map(p=>[p,[]]));let ws=null,last=0,retry=1000,reconnect=null;
const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:6});
function ema(values,n){if(values.length<n)return NaN;const k=2/(n+1);return values.reduce((a,v,i)=>i?a+(v-a)*k:v,0)}
function rsi(values){if(values.length<15)return NaN;let up=0,down=0;for(let i=values.length-14;i<values.length;i++){const d=values[i]-values[i-1];up+=Math.max(0,d);down+=Math.max(0,-d)}return down===0?100:100-100/(1+up/down)}
function draw(){const minute=Number(frame.value),live=series.get(asset.value)||[],points=minute>=60?[...(hourlyHistory.get(asset.value)||[]),...live].sort((a,b)=>a.t-b.t):live,bucket=minute*60000,group=[];
for(const p of points){const t=Math.floor(p.t/bucket)*bucket,prev=group[group.length-1],close=p.close??p.price,open=p.open??p.price,high=p.high??p.price,low=p.low??p.price;if(prev&&prev.t===t){prev.close=close;prev.high=Math.max(prev.high,high);prev.low=Math.min(prev.low,low);prev.volume+=p.size}else group.push({t,open,high,low,close,volume:p.size})}
const values=group.map(p=>p.close),current=values.at(-1),e9=ema(values.slice(-50),9),e21=ema(values.slice(-80),21),e50=ema(values.slice(-150),50),strength=rsi(values);
const completed=group.slice(-21,-1),support=completed.length===20?Math.min(...completed.map(p=>p.low)):NaN,resistance=completed.length===20?Math.max(...completed.map(p=>p.high)):NaN;
stats.innerHTML=[['Spot',current],['EMA 9',e9],['EMA 21',e21],['EMA 50',e50],['RSI 14',strength],['Support (20)',support],['Resistance (20)',resistance]].map(([k,v])=>'<div class="metric"><small>'+k+'</small><b>'+(Number.isFinite(v)?fmt(v):'Collecting…')+'</b></div>').join('');
insight.textContent=values.length<50?'Collecting timeframe candles; indicators are provisional until sufficient history is available.':'EMA alignment '+(e9>e21&&e21>e50?'bullish':e9<e21&&e21<e50?'bearish':'mixed')+' · RSI '+strength.toFixed(1)+' · Context only; do not treat as an entry or exit recommendation.';
const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#071426';ctx.fillRect(0,0,w,h);const v=values.slice(-100);if(v.length<2)return;let lo=Math.min(...v),hi=Math.max(...v);if(hi===lo)hi=lo+1;ctx.strokeStyle='#50e6b4';ctx.lineWidth=2;ctx.beginPath();v.forEach((price,i)=>{const x=15+i*(w-30)/(v.length-1),y=h-18-(price-lo)/(hi-lo)*(h-36);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
}
function connect(){if(document.hidden)return;clearTimeout(reconnect);status.textContent='Connecting to Coinbase direct stream…';try{ws=new WebSocket('wss://advanced-trade-ws.coinbase.com');ws.onopen=()=>{retry=1000;ws.send(JSON.stringify({type:'subscribe',channel:'ticker',product_ids:products}));ws.send(JSON.stringify({type:'subscribe',channel:'heartbeats'}));status.textContent='● Coinbase connected · awaiting ticks';};ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}for(const event of m.events||[])for(const tick of event.tickers||[]){const arr=series.get(tick.product_id),price=Number(tick.price),size=Number(tick.last_size)||0;if(!arr||!Number.isFinite(price)||price<=0)continue;const t=Date.now();arr.push({t,price,size});if(arr.length>20000)arr.splice(0,arr.length-20000);last=t;if(tick.product_id===asset.value){status.textContent='● Coinbase live · '+tick.product_id+' · '+new Date(t).toLocaleTimeString();draw()}}};ws.onclose=()=>{status.textContent='● Coinbase disconnected · reconnecting';reconnect=setTimeout(connect,retry);retry=Math.min(retry*2,30000)};ws.onerror=()=>{status.textContent='● Coinbase connection error';ws.close()}}catch{status.textContent='Coinbase connection unavailable';reconnect=setTimeout(connect,retry)}}
asset.addEventListener('change',draw);
async function historical(){
 const product=asset.value;
 try{
  const response=await fetch('https://api.exchange.coinbase.com/products/'+encodeURIComponent(product)+'/candles?granularity=3600',{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const rows=await response.json();
  if(!Array.isArray(rows))throw Error('Invalid candles');
  const candles=rows.filter(x=>Array.isArray(x)&&x.length>=6).map(x=>({t:Number(x[0])*1000,low:Number(x[1]),high:Number(x[2]),open:Number(x[3]),close:Number(x[4]),size:Number(x[5])})).filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.low)&&Number.isFinite(x.high)&&Number.isFinite(x.open)&&Number.isFinite(x.close)&&Number.isFinite(x.size)&&x.low>0&&x.low<=Math.min(x.open,x.close)&&x.high>=Math.max(x.open,x.close)&&x.size>=0).sort((a,b)=>a.t-b.t);
  hourlyHistory.set(product,candles.slice(-300));
  if(asset.value===product){draw();status.textContent+=' · '+candles.length+' hourly candles'}
 }catch(e){if(asset.value===product)insight.textContent='Historical candles unavailable ('+e.message+'); live-only analysis. No inferred signals.'}
}
asset.addEventListener('change',historical);
historical();
frame.addEventListener('change',draw);document.addEventListener('visibilitychange',()=>{if(document.hidden){ws?.close();clearTimeout(reconnect)}else connect()});setInterval(()=>{if(last&&Date.now()-last>15000)status.textContent='● Coinbase stream stale · check connection'},5000);connect();
})();