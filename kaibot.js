(()=>{'use strict';
const el=id=>document.getElementById(id);
const start=el('kaiStart'),stop=el('kaiStop'),status=el('kaiState'),logBox=el('kaiLog');
if(!start||!stop||!status)return;
let busy=false;start.disabled=true;stop.disabled=true;
const log=msg=>{if(!logBox)return;const d=document.createElement('div');d.className='rank';d.textContent=new Date().toLocaleTimeString()+' · '+msg;logBox.prepend(d);while(logBox.children.length>15)logBox.lastChild.remove()};
async function request(url,options){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),10000);
 try{const r=await fetch(url,{cache:'no-store',...options,signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}
}
function render(d){
 const state=d?.state||{},ledger=d?.ledger||{},trades=Array.isArray(ledger.trades)?ledger.trades:[];
 const open=trades.filter(t=>t.status==='OPEN'||t.status==='PENDING');
 const stats=d?.performance,overall=stats?.overall,cash=Number(ledger.cash);
 const hasNumber=v=>(typeof v==='number'||(typeof v==='string'&&v.trim()!==''))&&Number.isFinite(Number(v));
 const committed=open.reduce((n,t)=>{const explicit=Number(t.cost??t.spend??t.stake);if(Number.isFinite(explicit)&&explicit>=0)return n+explicit;const qty=Number(t.qty??t.quantity),ask=Number(t.ask??t.price);return n+(Number.isFinite(qty)&&Number.isFinite(ask)?qty*ask/(ask>1?100:1):0)},0);
 const health=d?.runnerHealth,heartbeat=!health?.lastRunAt?'NO RUNNER HEARTBEAT':health.fresh?'RUNNER HEARTBEAT FRESH':'RUNNER HEARTBEAT OVERDUE';
 status.textContent=(state.running?'SERVER PAPER MONITOR ON':'SERVER PAPER MONITOR OFF')+' · '+heartbeat+(d?.entriesPaused?' · NEW PAPER ENTRIES PAUSED FOR SAFETY':'')+' · Virtual cash '+(Number.isFinite(cash)?'
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=hasNumber(t.pnl)?Number(t.pnl):null;const resolved=n!==null&&((t.status==='SETTLED'&&['WIN','LOSS'].includes(t.settlement)&&['yes','no'].includes(t.marketResult))||(t.status==='CLOSED'&&t.paperExitOnly===true&&hasNumber(t.exitBid)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();+cash.toFixed(2):'unavailable')+' / $1,000';
 const results=el('kaiResults');
 if(results){
  if(!overall||!Number.isFinite(overall.trades)){results.textContent='Verified server paper statistics unavailable · Open '+open.length+' · Estimated committed 
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=Number(t.pnl)||0;const resolved=t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2):String(t.status||'OPEN')+' · Awaiting verified result');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();+committed.toFixed(2)+' · Do not infer wins or losses from incomplete ledger records.'}
  else{
   const rate=typeof overall.winRate==='number'&&Number.isFinite(overall.winRate)?(overall.winRate*100).toFixed(1)+'%':'—';
   const pnl=typeof overall.netPnl==='number'&&Number.isFinite(overall.netPnl)?(overall.netPnl>=0?'+':'-')+'
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=Number(t.pnl)||0;const resolved=t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2):String(t.status||'OPEN')+' · Awaiting verified result');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();+Math.abs(overall.netPnl).toFixed(2):'unavailable';
   results.textContent='Eligible resolved PAPER results · Wins '+overall.wins+' · Losses '+overall.losses+' · Ties '+overall.ties+' · Count '+overall.trades+' · Win rate '+rate+' · Open '+open.length+' · Estimated committed 
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=Number(t.pnl)||0;const resolved=t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2):String(t.status||'OPEN')+' · Awaiting verified result');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();+committed.toFixed(2)+' · Simulated P&L '+pnl+' · Excluded records '+(stats.excluded??'unknown')+' · Official settlements and simulated bid exits; no actual fills or guaranteed accuracy.';
  }
 }
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=Number(t.pnl)||0;const resolved=t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2):String(t.status||'OPEN')+' · Awaiting verified result');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();+Math.abs(n).toFixed(2)+(t.status==='CLOSED'?' · SIMULATED EXIT':' · OFFICIAL OUTCOME'):String(t.status||'OPEN')+' · Not included in resolved results');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();+cash.toFixed(2):'unavailable')+' / $1,000';
 const results=el('kaiResults');
 if(results){
  if(!overall||!Number.isFinite(overall.trades)){results.textContent='Verified server paper statistics unavailable · Open '+open.length+' · Estimated committed 
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=Number(t.pnl)||0;const resolved=t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2):String(t.status||'OPEN')+' · Awaiting verified result');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();+committed.toFixed(2)+' · Do not infer wins or losses from incomplete ledger records.'}
  else{
   const rate=typeof overall.winRate==='number'&&Number.isFinite(overall.winRate)?(overall.winRate*100).toFixed(1)+'%':'—';
   const pnl=typeof overall.netPnl==='number'&&Number.isFinite(overall.netPnl)?(overall.netPnl>=0?'+':'-')+'
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=Number(t.pnl)||0;const resolved=t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2):String(t.status||'OPEN')+' · Awaiting verified result');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();+Math.abs(overall.netPnl).toFixed(2):'unavailable';
   results.textContent='Eligible resolved PAPER results · Wins '+overall.wins+' · Losses '+overall.losses+' · Ties '+overall.ties+' · Count '+overall.trades+' · Win rate '+rate+' · Open '+open.length+' · Estimated committed 
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=Number(t.pnl)||0;const resolved=t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2):String(t.status||'OPEN')+' · Awaiting verified result');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();+committed.toFixed(2)+' · Simulated P&L '+pnl+' · Excluded records '+(stats.excluded??'unknown')+' · Official settlements and simulated bid exits; no actual fills or guaranteed accuracy.';
  }
 }
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=Number(t.pnl)||0;const resolved=t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2):String(t.status||'OPEN')+' · Awaiting verified result');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy||start.disabled||stop.disabled)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
async function configureControls(){
 try{const access=await request('/api/membership');const allowed=access?.owner===true;start.disabled=!allowed;stop.disabled=!allowed;if(!allowed)log('Paper bot start/stop controls are owner-only; members may view results.');}
 catch{start.disabled=true;stop.disabled=true;log('Owner permissions unavailable; bot controls disabled.');}
}
configureControls();
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();