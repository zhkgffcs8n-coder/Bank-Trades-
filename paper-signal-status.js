(()=>{'use strict';
const coins=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
const root=document.getElementById('paperTradeCoinStatus'),rows=document.getElementById('paperTradeSignalsRows'),status=document.getElementById('paperTradeSignalsStatus');
if(!root||!rows||!status)return;
let busy=false,lastSeen=new Map(),initialized=false;
const pct=v=>v==null||v===''||!Number.isFinite(Number(v))?'—':Number(v).toFixed(1)+'%';
const date=v=>Number(v)>0?new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true,timeZoneName:'short'}).format(new Date(Number(v))):'unknown';
const dollars=v=>Number.isFinite(Number(v))?'$'+Math.abs(Number(v)).toFixed(2):'—';
const pnlLabel=v=>(Number(v)>=0?'+':'−')+dollars(v);
const ago=ms=>{const d=Date.now()-Number(ms);if(!Number.isFinite(d)||d<0)return 'unknown age';const m=Math.floor(d/60000);return m<1?'under 1 min ago':m<60?m+' min ago':Math.floor(m/60)+'h '+m%60+'m ago'};
function badge(coin,label,color){const x=document.createElement('span');x.style.cssText='padding:5px 8px;border-radius:7px;color:#fff;background:'+color+';font-size:11px;font-weight:800';x.textContent=coin+' · '+label;return x}
function announce(t,kind){
 const el=document.createElement('div');el.setAttribute('role','alert');
 el.style.cssText='position:fixed;z-index:99999;top:12px;left:10px;right:10px;margin:auto;max-width:550px;padding:16px;border:2px solid #fff;border-radius:12px;color:#fff;font-weight:900;font-size:18px;text-align:center;background:'+(kind==='exit'?'#155e75':t.side==='down'?'#991b1b':'#166534')+';box-shadow:0 10px 35px #0009';
 el.textContent='PAPER '+(kind==='exit'?'EXIT':'BUY '+String(t.side).toUpperCase())+' · '+(t.asset||t.ticker||'MARKET')+' · '+pct(kind==='exit'?t.exitBid:t.ask)+' · SIMULATED';
 document.body.append(el);setTimeout(()=>el.remove(),7500);
}
function paint(data){
 const running=!!data?.state?.running,health=data?.runnerHealth||{},markets=data?.lastRun?.markets||{};
 const trades=Array.isArray(data?.ledger?.trades)?data.ledger.trades:[];
 const paused=!!(data?.entriesPaused||data?.riskAudit?.entryPaused);
 const heading=document.getElementById('paperTradeSignalsTitle');
 const oldScore=document.getElementById('paperTradeVerifiedScore');if(oldScore)oldScore.remove();
 const mode=['lock','balanced','extreme'].includes(data?.state?.mode)?data.state.mode:'balanced';
 for(const button of document.querySelectorAll('[data-paper-entry-mode]')){
  const selected=button.dataset.paperEntryMode===mode;
  button.setAttribute('aria-pressed',String(selected));
  button.style.outline=selected?'2px solid #67e8f9':'none';
 }
 const active=running&&health.fresh&&!paused;
 const latest=trades.filter(t=>Number.isFinite(Number(t?.at))&&Number(t.at)>0).sort((a,b)=>Number(b.at)-Number(a.at))[0];
 const lastEntry=latest?' · LAST ENTRY '+(latest.asset||latest.ticker||'market')+' '+date(latest.at)+' ('+ago(latest.at)+')':' · NO RECORDED ENTRIES';
 const staleEntry=latest&&Date.now()-Number(latest.at)>60*60000;
 const marketStatuses=Object.entries(markets).map(([coin,m])=>coin+': '+(m?.reason||m?.status||'no status')).slice(0,8);
 const runnerNote=!running?'BOT STOPPED':!health.fresh?'RUNNER STALE — NOT ACTIVELY VERIFIED':paused?'ENTRIES PAUSED':staleEntry?'NO ENTRY IN OVER 1 HOUR — CHECK REJECTION REASONS':'MONITORING QUALIFIED SIGNALS';
 status.textContent='PAPER BOT '+(running?'ENABLED':'STOPPED')+' · '+runnerNote+' · Runner '+(health.fresh?'checked '+health.ageSeconds+'s ago':'NOT VERIFIED')+lastEntry+' · '+trades.length+' recorded trades · '+(staleEntry?'Latest market checks: '+marketStatuses.join(' | ')+' · ':'')+'Display refresh 3s / runner scheduled 60s';
 status.style.color=active&&!staleEntry?'#86efac':'#fbbf24';
 const fragment=document.createDocumentFragment();
 for(const coin of coins){
  const open=trades.find(t=>t?.asset===coin&&t?.status==='OPEN');
  const m=markets[coin];let label='MONITORING',color='#334155';
  if(!running){label='OFF';color='#475569'}
  else if(paused){label='ENTRIES PAUSED';color='#92400e'}
  else if(!health.fresh){label='RUNNER STALE';color='#92400e'}
  else if(open){label='HOLD '+String(open.side).toUpperCase()+' '+pct(open.ask);color='#166534'}
  else if(m?.status==='ENTERED'){label='BUY '+String(m.side).toUpperCase()+' '+pct(m.ask);color=m.side==='down'?'#991b1b':'#166534'}
  else if(m?.status==='ERROR'){label='ERROR';color='#991b1b'}
  else if(m?.status==='SKIPPED'){label='WAIT';color='#475569'}
  else if(m?.status==='PAPER_ENTRIES_PAUSED'){label='PAUSED';color='#92400e'}
  const chip=badge(coin,label,color);
  if(m?.reason){chip.title=String(m.reason);if(m.status==='SKIPPED'){chip.textContent=coin+' · '+label+' · '+String(m.reason).slice(0,72);chip.style.maxWidth='100%';chip.style.whiteSpace='normal';}}
  fragment.append(chip);
 }
 root.replaceChildren(fragment);
 const sorted=trades.filter(t=>t&&['OPEN','CLOSED','SETTLED'].includes(t.status)).sort((a,b)=>Number(b.exitAt||b.exitedAt||b.settledAt||b.at||0)-Number(a.exitAt||a.exitedAt||a.settledAt||a.at||0)).slice(0,20);
 rows.replaceChildren();
 if(!sorted.length){const p=document.createElement('p');p.textContent='No paper positions recorded yet. Watching for the next qualified signal; no trade is being claimed.';rows.append(p)}
 for(const t of sorted){
  const side=String(t.side||'').toUpperCase(),up=side==='UP',closed=t.status!=='OPEN';
  const card=document.createElement('div');card.style.cssText='border-left:5px solid '+(closed?'#22d3ee':up?'#22c55e':'#ef4444')+';background:#101e30;padding:9px;margin:4px 0;border-radius:7px;color:#fff';
  const title=document.createElement('strong');title.textContent=(t.asset||t.ticker||'Market')+' · PAPER BUY '+side+' · '+pct(t.ask);
  title.style.color=up?'#86efac':'#fca5a5';
  const stake=Number(t.cost),pnl=Number(t.pnl),realized=closed&&t.pnl!=null&&Number.isFinite(pnl);
  const marked=!closed&&t.lastObservedUnrealizedPnl!=null&&Number.isFinite(Number(t.lastObservedUnrealizedPnl))&&Number(t.lastObservedExitAt)>0;
  const money=document.createElement('div');money.textContent='PAPER BET '+(Number.isFinite(stake)?dollars(stake):'—')+' · '+(realized?'REALIZED '+pnlLabel(pnl):marked?'EST. OPEN '+pnlLabel(t.lastObservedUnrealizedPnl)+' · BID '+pct(t.lastObservedExitBid)+' ('+ago(t.lastObservedExitAt)+')':'OPEN P&L PENDING BID');
  money.style.cssText='font-weight:900;font-size:14px;margin:4px 0;color:'+(realized?(pnl>=0?'#86efac':'#fca5a5'):marked?(Number(t.lastObservedUnrealizedPnl)>=0?'#86efac':'#fca5a5'):'#facc15');
  const detail=document.createElement('div');detail.textContent=closed?'PAPER '+(t.status==='SETTLED'?'SETTLED':'EXIT')+' · '+(t.exitBid!=null?'Exit '+pct(t.exitBid):'No executable exit price recorded'):'HOLD '+side+' · OPEN PAPER POSITION';
  const when=document.createElement('small');when.textContent='Entry '+date(t.at)+(closed?' · Exit '+date(t.exitedAt||t.exitAt||t.settledAt):'')+' · Recorded, not an executable live quote';
  card.append(title,money,detail,when);rows.append(card);
 }
 const completed=trades.filter(t=>['CLOSED','SETTLED'].includes(t.status)&&t.pnl!=null&&Number.isFinite(Number(t.pnl)));
 const realizedNet=completed.reduce((sum,t)=>sum+Number(t.pnl),0);
 const markedOpen=trades.filter(t=>t.status==='OPEN'&&t.lastObservedUnrealizedPnl!=null&&Number.isFinite(Number(t.lastObservedUnrealizedPnl))&&Number(t.lastObservedExitAt)>0);
 const openNet=markedOpen.reduce((sum,t)=>sum+Number(t.lastObservedUnrealizedPnl),0);
 let totals=document.getElementById('paperTradeLivePnl');if(!totals){totals=document.createElement('div');totals.id='paperTradeLivePnl';status.insertAdjacentElement('afterend',totals)}
 totals.textContent='PAPER P&L · REALIZED '+pnlLabel(realizedNet)+' ('+completed.length+' closed) · EST. OPEN '+(markedOpen.length?pnlLabel(openNet):'PENDING')+' ('+markedOpen.length+' marked)';
 totals.style.cssText='font-weight:900;font-size:14px;margin:7px 0;color:'+(realizedNet>=0?'#86efac':'#fca5a5');
 const next=new Map();
 for(const t of trades){
  if(!t?.id)continue;
  const state=String(t.status)+'/'+String(t.exitBid??'');
  next.set(t.id,state);
  if(initialized&&lastSeen.get(t.id)!==state){
   if(!lastSeen.has(t.id)&&t.status==='OPEN')announce(t,'entry');
   else if(t.status!=='OPEN'&&lastSeen.get(t.id)?.startsWith('OPEN/'))announce(t,'exit');
  }
 }
 lastSeen=next;initialized=true;
}
async function refresh(){
 if(busy||document.hidden)return;busy=true;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 try{
  const res=await fetch('/.netlify/functions/kaibot-state',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
  if(!res.ok)throw Error('HTTP '+res.status+(res.status===401||res.status===403?' · sign in to view paper status':''));
  paint(await res.json());
 }catch(e){status.textContent='PAPER DATA NOT VERIFIED · '+e.message;status.style.color='#fca5a5';root.replaceChildren(badge('STATUS','UNAVAILABLE','#991b1b'))}
 finally{clearTimeout(timer);busy=false}
}
window.addEventListener('paper-bot-state-changed',refresh);
window.addEventListener('pageshow',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
refresh();setInterval(refresh,3000);
})();