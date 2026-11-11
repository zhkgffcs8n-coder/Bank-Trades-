(()=>{'use strict';
const el=id=>document.getElementById(id);
const start=el('kaiStart'),stop=el('kaiStop'),status=el('kaiState'),logBox=el('kaiLog');
if(!start||!stop||!status)return;
const previewStart=el('primalPaperStart'),previewStop=el('primalPaperStop');
const signalStart=el('paperSignalStart'),signalStop=el('paperSignalStop');
let busy=false;let ownerAllowed=false;
start.disabled=true;stop.disabled=true;
const hasNumber=v=>(typeof v==='number'||(typeof v==='string'&&v.trim()!==''))&&Number.isFinite(Number(v));
const money=n=>(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2);
function log(message){
 if(!logBox)return;
 const row=document.createElement('div');row.className='rank';
 row.textContent=new Date().toLocaleTimeString()+' · '+message;
 logBox.prepend(row);
 while(logBox.children.length>15)logBox.lastChild.remove();
}
async function request(url,options){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(url,{cache:'no-store',...options,signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timeout)}
}
function render(data){
 const state=data?.state||{},ledger=data?.ledger||{};
 const trades=Array.isArray(ledger.trades)?ledger.trades:[];
 const open=trades.filter(t=>t.status==='OPEN'||t.status==='PENDING');
 const cash=hasNumber(ledger.cash)?Number(ledger.cash):null;
 const committed=open.reduce((sum,t)=>{
  if(hasNumber(t.cost)&&Number(t.cost)>=0)return sum+Number(t.cost);
  const qty=Number(t.qty??t.quantity),ask=Number(t.ask??t.price);
  return sum+(Number.isFinite(qty)&&Number.isFinite(ask)?qty*ask/(ask>1?100:1):0);
 },0);
 const health=data?.runnerHealth;
 const heartbeat=!health?.lastRunAt?'NO RUNNER HEARTBEAT':health.fresh?'RUNNER HEARTBEAT FRESH':'RUNNER HEARTBEAT OVERDUE';
 status.textContent=(state.running?'SERVER PAPER MONITOR ON':'SERVER PAPER MONITOR OFF')+
  ' · '+heartbeat+(data?.entriesPaused?' · NEW PAPER ENTRIES PAUSED FOR SAFETY':'')+
  ' · Virtual cash '+(cash===null?'unavailable':'$'+cash.toFixed(2))+' / $1,000';
 const results=el('kaiResults'),stats=data?.performance,overall=stats?.overall;
 if(results){
  if(!overall||!Number.isFinite(overall.trades)){
   results.textContent='Server paper statistics unavailable · Open '+open.length+
    ' · Estimated committed $'+committed.toFixed(2)+
    ' · No wins or losses inferred from unverified ledger records.';
  }else{
   const rate=typeof overall.winRate==='number'&&Number.isFinite(overall.winRate)?
    (overall.winRate*100).toFixed(1)+'%':'—';
   const pnl=hasNumber(overall.netPnl)?money(Number(overall.netPnl)):'unavailable';
   results.textContent='Eligible resolved PAPER results · Wins '+overall.wins+
    ' · Losses '+overall.losses+' · Ties '+overall.ties+
    ' · Count '+overall.trades+' · Win rate '+rate+
    ' · Open '+open.length+' · Estimated committed $'+committed.toFixed(2)+
    ' · Simulated P&L '+pnl+' · Excluded records '+(stats.excluded??'unknown')+
    ' · Official settlements and simulated bid exits; no real fills or guaranteed accuracy.';
  }
 }
 const history=el('kaiResultHistory');
 if(history){
  history.replaceChildren();
  const recent=trades.slice().sort((a,b)=>Number(b.settledAt||b.at)-Number(a.settledAt||a.at)).slice(0,50);
  if(!recent.length){
   const row=document.createElement('div');row.className='rank';
   row.textContent='No recorded server paper trades yet.';history.append(row);
  }
  for(const t of recent){
   const row=document.createElement('div');row.className='rank';
   const settled=t.status==='SETTLED'&&['WIN','LOSS'].includes(t.settlement)&&
    ['yes','no'].includes(t.marketResult);
   const exited=t.status==='CLOSED'&&t.paperExitOnly===true&&hasNumber(t.exitBid);
   const valid=(settled||exited)&&hasNumber(t.pnl)&&hasNumber(t.cost)&&
    Number(t.cost)>0&&hasNumber(t.ask)&&Number(t.ask)>0&&Number(t.ask)<100;
   const pnl=valid?Number(t.pnl):null;
   row.textContent=String(t.asset||t.ticker||'')+' '+String(t.side||'').toUpperCase()+
    ' · '+(valid?(pnl>0?'WIN':pnl<0?'LOSS':'BREAK EVEN')+' · '+money(pnl)+
    (exited?' · SIMULATED EXIT':' · OFFICIAL OUTCOME'):
    String(t.status||'OPEN')+' · Not included in resolved results');
   history.append(row);
  }
 }
}
async function refresh(){
 try{render(await request('/.netlify/functions/kaibot-state'))}
 catch(e){
  status.textContent='SERVER PAPER BOT STATUS UNAVAILABLE · '+e.message;
  const results=el('kaiResults');
  if(results)results.textContent='Server paper statistics unavailable';
 }
}
async function action(name){
 if(busy||!ownerAllowed)return;
 busy=true;
 try{
  const max=Math.min(1000,Math.max(1,Number(el('kaiMax')?.value)||50));
  const result=await request('/.netlify/functions/kaibot-state',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action:name,maxSpend:max})
  });
  if(result?.state?.running!==(name==='start'))throw Error('Server did not confirm '+name);
  const verified=await request('/.netlify/functions/kaibot-state');
  if(verified?.state?.running!==(name==='start'))throw Error('Persistent server state did not confirm '+name);
  render(verified);
  log(name==='start'?'Paper monitoring enabled and saved on server':'Paper monitoring stopped and saved on server');
 }catch(e){status.textContent=(name==='start'?'START':'STOP')+' FAILED · '+e.message}
 finally{busy=false}
}
async function configureControls(){
 try{
  const access=await request('/api/membership');
  const allowed=access?.owner===true;
  ownerAllowed=allowed;
  start.disabled=!allowed;stop.disabled=!allowed;
  if(previewStart)previewStart.disabled=!allowed;
  if(previewStop)previewStop.disabled=!allowed;
  if(signalStart)signalStart.disabled=!allowed;
  if(signalStop)signalStop.disabled=!allowed;
  if(!allowed)log('Start/stop controls are owner-only; members can view paper results.');
 }catch{
  ownerAllowed=false;
  start.disabled=true;stop.disabled=true;
  if(signalStart)signalStart.disabled=true;
  if(signalStop)signalStop.disabled=true;
  log('Owner permissions unavailable; controls disabled.');
 }
}
for(const [button,name] of [[previewStart,'start'],[previewStop,'stop'],[signalStart,'start'],[signalStop,'stop']]){
 button?.addEventListener('click',()=>{
  if(button===previewStart||button===previewStop)document.querySelector('[data-protab="kaibot"]')?.click();
  action(name);
 });
}
configureControls();
start.addEventListener('click',()=>action('start'));
stop.addEventListener('click',()=>action('stop'));
refresh();
setInterval(refresh,12000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
window.addEventListener('pageshow',refresh);
})();