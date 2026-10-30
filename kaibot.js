(()=>{'use strict';
const el=id=>document.getElementById(id);
const start=el('kaiStart'),stop=el('kaiStop'),status=el('kaiState'),logBox=el('kaiLog');
if(!start||!stop||!status)return;
let busy=false;
const log=msg=>{if(!logBox)return;const d=document.createElement('div');d.className='rank';d.textContent=new Date().toLocaleTimeString()+' · '+msg;logBox.prepend(d);while(logBox.children.length>15)logBox.lastChild.remove()};
async function request(url,options){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),10000);
 try{const r=await fetch(url,{cache:'no-store',...options,signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}
}
function render(d){
 const state=d?.state||{},ledger=d?.ledger||{},trades=Array.isArray(ledger.trades)?ledger.trades:[];
 const settled=trades.filter(t=>t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)))),open=trades.filter(t=>t.status==='OPEN'||t.status==='PENDING');
 const wins=settled.filter(t=>Number(t.pnl)>0).length,losses=settled.filter(t=>Number(t.pnl)<0).length, ties=settled.length-wins-losses;
 const pnl=settled.reduce((n,t)=>n+(Number(t.pnl)||0),0),rate=settled.length?wins/settled.length*100:null,cash=Number(ledger.cash);
 const committed=open.reduce((n,t)=>{const explicit=Number(t.cost??t.spend??t.stake);if(Number.isFinite(explicit)&&explicit>=0)return n+explicit;const qty=Number(t.qty??t.quantity),ask=Number(t.ask??t.price);return n+(Number.isFinite(qty)&&Number.isFinite(ask)?qty*ask/(ask>1?100:1):0)},0);
 status.textContent=state.running?'SERVER PAPER BOT ON · persists after refresh/close · Virtual cash '+(Number.isFinite(cash)?'$'+cash.toFixed(2):'unavailable')+' / $1,000':'SERVER PAPER BOT OFF · state persists across refreshes';
 const results=el('kaiResults');if(results)results.textContent='Permanent server results · Wins '+wins+' · Losses '+losses+' · Resolved '+settled.length+' · Ties '+ties+' · Win rate '+(rate==null?'—':rate.toFixed(1)+'%')+' · Open '+open.length+' · Estimated committed $'+committed.toFixed(2)+' · Realized paper P&L '+(pnl>=0?'+':'-')+'$'+Math.abs(pnl).toFixed(2);
 const history=el('kaiResultHistory');if(history){history.replaceChildren();const list=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);if(!list.length){const x=document.createElement('div');x.className='rank';x.textContent='No recorded server paper trades yet.';history.append(x)}else list.forEach(t=>{const x=document.createElement('div');x.className='rank';const n=Number(t.pnl)||0;const resolved=t.status==='SETTLED'||(t.status==='CLOSED'&&t.paperExitOnly===true&&Number.isFinite(Number(t.pnl)));x.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+' · '+(resolved?(n>0?'WIN':n<0?'LOSS':'BREAK EVEN')+' · '+(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2):String(t.status||'OPEN')+' · Awaiting verified result');history.append(x)})}
}
async function refresh(){try{render(await request('/.netlify/functions/kaibot-state'))}catch(e){status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;const results=el('kaiResults');if(results)results.textContent='Permanent server results unavailable'}}
async function action(name){if(busy)return;busy=true;try{const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));await request('/.netlify/functions/kaibot-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,maxSpend:max})});log(name==='start'?'Server paper bot started':'Server paper bot stopped');await refresh()}catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}finally{busy=false}}
start.addEventListener('click',()=>action('start'));stop.addEventListener('click',()=>action('stop'));
refresh();setInterval(refresh,12000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('pageshow',refresh);
})();