(()=>{'use strict';
const anchor=document.getElementById('liveTerminal');if(!anchor)return;
const panel=document.createElement('section');panel.className='card';panel.id='spotTimeframePanel';
const heading=document.createElement('h2');heading.textContent='PRIMAL · MULTI-TIMEFRAME SPOT RADAR (RESEARCH)';
const caption=document.createElement('p');caption.textContent='1m / 5m / 15m / 30m / 1h completed Coinbase USD spot candles. These are not Kalshi contract prices, proven entry signals, or profit forecasts.';
const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Loading reference trends…';
const table=document.createElement('div');table.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:8px';
panel.append(heading,caption,status,table);anchor.after(panel);
let asset='BTC',last=0,request=0;
async function update(force=false){
 if(document.hidden||(!force&&Date.now()-last<60000))return;
 last=Date.now();const id=++request,selected=asset;status.textContent=selected+' · checking completed spot candles…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch('/.netlify/functions/spot-timeframes?asset='+encodeURIComponent(selected),{cache:'no-store',signal:controller.signal});
  const data=await response.json();if(id!==request)return;
  if(!response.ok||!data.fresh)throw Error(data.error||'Spot data stale or unavailable');
  status.textContent=selected+' · Coinbase USD spot · latest completed candle '+new Date(data.latestCandleAt).toLocaleTimeString()+' · RESEARCH ONLY';
  table.replaceChildren();
  for(const frame of data.timeframes||[]){
   const cell=document.createElement('div');cell.className='metric';
   const title=document.createElement('small');title.textContent=frame.minutes===60?'1 HOUR':frame.minutes+' MIN';
   const value=document.createElement('b');value.textContent=frame.valid?frame.trend+' '+frame.changePct.toFixed(2)+'%':'NO DATA';
   value.style.color=!frame.valid?'#9bb0ce':frame.trend==='UP'?'#50e6b4':frame.trend==='DOWN'?'#ff8091':'#ffd477';
   cell.append(title,value);table.append(cell);
  }
 }catch(e){if(id!==request)return;table.replaceChildren();status.textContent=selected+' · '+e.message+' · No timeframe conclusion'}finally{clearTimeout(timer)}
}
window.addEventListener('banktrades:select',e=>{if(typeof e.detail==='string'){asset=e.detail;last=0;update(true)}});
setInterval(()=>update(),15000);update(true);
})();