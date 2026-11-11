(()=>{'use strict';
const coins=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
const root=document.getElementById('paperTradeCoinStatus');
if(!root)return;
let seq=0;
function badge(coin,label,tone){
 const el=document.createElement('span');
 el.style.cssText='display:inline-block;padding:6px 9px;border-radius:8px;font-size:12px;font-weight:800;color:#fff;background:'+tone;
 el.textContent=coin+' · '+label;return el;
}
function show(message,kind){
 root.replaceChildren();
 const el=document.createElement('span');el.textContent=message;
 el.style.color=kind==='error'?'#fca5a5':'#fbbf24';root.append(el);
}
async function refresh(){
 const current=++seq;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),10000);
 try{
  const res=await fetch('/.netlify/functions/kaibot-state',{cache:'no-store',signal:controller.signal});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();if(current!==seq)return;
  const running=!!data?.state?.running,health=data?.runnerHealth||{},markets=data?.lastRun?.markets||{};
  const trades=Array.isArray(data?.ledger?.trades)?data.ledger.trades:[];
  const strip=document.createDocumentFragment();
  for(const coin of coins){
   const open=trades.find(t=>t?.asset===coin&&t?.status==='OPEN');
   const m=markets[coin];
   let label='MONITORING',color='#334155';
   if(!running){label='OFF';color='#475569'}
   else if(!health.fresh){label='RUNNER NOT VERIFIED';color='#92400e'}
   else if(open){label='HOLD '+String(open.side||'').toUpperCase()+' '+Number(open.ask||0).toFixed(0)+'%';color='#166534'}
   else if(m?.status==='ENTERED'){label='BUY '+String(m.side||'').toUpperCase()+' '+Number(m.ask||0).toFixed(0)+'%';color=m.side==='down'?'#991b1b':'#166534'}
   else if(m?.status==='ERROR'){label='ERROR';color='#991b1b'}
   else if(m?.status==='SKIPPED'){label='WAIT';color='#475569'}
   strip.append(badge(coin,label,color));
  }
  root.replaceChildren(strip);
  const status=document.getElementById('paperTradeSignalsStatus');
  if(status&&status.textContent.includes('Loading recorded paper trades'))status.textContent=running?'Paper bot ENABLED · '+(health.fresh?'runner active':'runner not verified'):'Paper bot STOPPED';
 }catch(e){if(current===seq)show('Paper status unavailable · '+e.message,'error')}
 finally{clearTimeout(timer)}
}
window.addEventListener('paper-bot-state-changed',refresh);
window.addEventListener('pageshow',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
refresh();setInterval(refresh,12000);
})();