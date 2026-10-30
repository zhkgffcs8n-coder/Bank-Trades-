(() => {
'use strict';
const el=id=>document.getElementById(id);
const start=el('kaiStart'),stop=el('kaiStop'),status=el('kaiState'),output=el('kaiLog');
if(!start||!stop||!status||!output)return;
let active=false,busy=false,day=new Date().toDateString(),spent=0;
const samples=new Map(),attempted=new Set();
const key='banktrades.paper.v1.'+window.__BANK_TRADES_USER_ID__;
const log=msg=>{const line=document.createElement('div');line.className='rank';line.textContent=new Date().toLocaleTimeString()+' · '+msg;output.prepend(line);while(output.children.length>15)output.lastChild.remove()};
const quote=(m,k)=>m[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:m[k]!=null?Number(m[k]):NaN;
const load=()=>{try{const b=JSON.parse(localStorage.getItem(key));if(b&&Number.isFinite(b.cash)&&Array.isArray(b.trades))return b}catch{}return {cash:10000,trades:[]}};
function save(b){localStorage.setItem(key,JSON.stringify(b))}
async function cycle(){
 if(!active||busy||document.hidden)return;
 busy=true;
 try{
  const today=new Date().toDateString();if(today!==day){day=today;spent=0;samples.clear();attempted.clear()}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  let res;try{res=await fetch('/api/data?mode=markets',{cache:'no-store',signal:controller.signal})}finally{clearTimeout(timeout)}
  if(!res.ok)throw Error('Feed HTTP '+res.status);
  const data=await res.json();
  if(!Number.isFinite(Date.parse(data.fetched_at))||Math.abs(Date.now()-Date.parse(data.fetched_at))>25000)throw Error('Stale feed');
  spent=load().trades.filter(t=>t.source==='KAIBOT PAPER'&&new Date(t.at).toDateString()===today).reduce((sum,t)=>sum+(Number(t.cost)||0),0);
  for(const row of data.results||[]){
   const m=row.market;if(!m||!m.ticker||attempted.has(m.ticker))continue;
   const time=Date.parse(m.expires_at)-Date.now();if(!Number.isFinite(time)||time<75000||time>930000)continue;
   const yb=quote(m,'yes_bid'),ya=quote(m,'yes_ask'),nb=quote(m,'no_bid'),na=quote(m,'no_ask');
   if(![yb,ya,nb,na].every(Number.isFinite)||Math.min(yb,ya,nb,na)<=0||Math.max(yb,ya,nb,na)>=100||ya<yb||na<nb||Math.max(ya-yb,na-nb)>6)continue;
   const h=samples.get(m.ticker)||[];h.push({t:Date.now(),v:(yb+ya)/2});while(h.length>12)h.shift();samples.set(m.ticker,h);
   if(h.length<6||h[h.length-1].t-h[0].t<50000)continue;
   const change=h[h.length-1].v-h[0].v,side=change>3?'up':change< -3?'down':null;if(!side)continue;
   const ask=side==='up'?ya:na;if(ask<12||ask>85)continue;
   const max=Math.min(20,Math.max(1,Number(el('kaiMax').value)||5));
   const qty=Math.min(5,Math.floor(max/(ask/100))),cost=qty*ask/100;
   if(!qty||spent+cost>25)continue;
   if(!navigator.locks)throw Error('Safe paper-ledger locking is unavailable');
   await navigator.locks.request(key,()=>{const book=load();spent=book.trades.filter(t=>t.source==='KAIBOT PAPER'&&new Date(t.at).toDateString()===today).reduce((sum,t)=>sum+(Number(t.cost)||0),0);if(spent+cost>25)return;if(book.cash<cost||book.trades.some(t=>t.ticker===m.ticker&&t.source==='KAIBOT PAPER')){attempted.add(m.ticker);return}
   book.cash=Math.round((book.cash-cost)*100)/100;
   book.trades.push({asset:row.asset,side,qty,ask,ticker:m.ticker,at:Date.now(),cost,source:'KAIBOT PAPER',status:'OPEN'});
   save(book);window.dispatchEvent(new Event('banktrades:paper'));attempted.add(m.ticker);spent+=cost;
   log('SIMULATED BUY '+side.toUpperCase()+' '+row.asset+' · '+qty+' at '+ask.toFixed(1)+'¢');
   });
  }
  status.textContent='PAPER BOT ON · Virtual daily spend $'+spent.toFixed(2)+' / $25';
 }catch(e){status.textContent='BOT PAUSED · '+e.message;log('No trade: '+e.message)}
 finally{busy=false}
}
start.addEventListener('click',()=>{active=true;samples.clear();status.textContent='PAPER BOT ON · collecting market samples';log('Paper bot started');cycle()});
stop.addEventListener('click',()=>{active=false;status.textContent='BOT OFF';log('Bot stopped')});
setInterval(cycle,12000);
})();
