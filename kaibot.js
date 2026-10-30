(() => {
'use strict';
const el=id=>document.getElementById(id);
const start=el('kaiStart'),stop=el('kaiStop'),status=el('kaiState'),output=el('kaiLog');
if(!start||!stop||!status||!output)return;
let active=false,busy=false,day=new Date().toDateString(),spent=0;
const samples=new Map(),attempted=new Set(),exitNotified=new Set();
const key='banktrades.paper.v2.'+window.__BANK_TRADES_USER_ID__;
const log=msg=>{const line=document.createElement('div');line.className='rank';line.textContent=new Date().toLocaleTimeString()+' · '+msg;output.prepend(line);while(output.children.length>15)output.lastChild.remove()};
const quote=(m,k)=>m[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:m[k]!=null?Number(m[k]):NaN;
const load=()=>{try{const b=JSON.parse(localStorage.getItem(key));if(b&&Number.isFinite(b.cash)&&Array.isArray(b.trades))return b}catch{}return {cash:1000,trades:[]}};
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
  const marketByTicker=new Map((data.results||[]).filter(r=>r.market?.ticker).map(r=>[r.market.ticker,r.market]));
  for(const t of load().trades.filter(t=>t.source==='KAIBOT PAPER'&&t.status==='OPEN')){
   const market=marketByTicker.get(t.ticker);if(!market)continue;
   const bid=quote(market,String(t.side).toLowerCase()==='up'?'yes_bid':'no_bid');
   if(!Number.isFinite(bid)||bid<=0||bid>=100)continue;
   const gross=(bid-Number(t.ask))*Number(t.qty)/100;
   const netEstimate=gross; // Fees and slippage not available; do not claim executable profit.
   const id=t.ticker+'|'+t.at;
   if(gross>=Math.max(.05,Number(t.cost)*.08)&&!exitNotified.has(id)){
    exitNotified.add(id);
    const msg='PAPER CASHOUT WATCH '+t.asset+' '+String(t.side).toUpperCase()+' · entry '+Number(t.ask).toFixed(1)+'¢ · bid '+bid.toFixed(1)+'¢ · gross $'+gross.toFixed(2)+' before fees/slippage; no sale placed';
    log(msg);
    window.dispatchEvent(new CustomEvent('banktrades:kai-exit',{detail:{ticker:t.ticker,asset:t.asset,side:t.side,entry:t.ask,bid,qty:t.qty,gross}}));
   }
  }
  spent=load().trades.filter(t=>t.source==='KAIBOT PAPER'&&new Date(t.at).toDateString()===today).reduce((sum,t)=>sum+(Number(t.cost)||0),0);
  for(const row of data.results||[]){
   const m=row.market;if(!m||!m.ticker||attempted.has(m.ticker))continue;
   const time=Date.parse(m.expires_at)-Date.now();if(!Number.isFinite(time)||time<360000||time>930000)continue;
   const yb=quote(m,'yes_bid'),ya=quote(m,'yes_ask'),nb=quote(m,'no_bid'),na=quote(m,'no_ask');
   if(![yb,ya,nb,na].every(Number.isFinite)||Math.min(yb,ya,nb,na)<=0||Math.max(yb,ya,nb,na)>=100||ya<yb||na<nb||Math.max(ya-yb,na-nb)>3)continue;
   const h=samples.get(m.ticker)||[];h.push({t:Date.now(),v:(yb+ya)/2});while(h.length>12)h.shift();samples.set(m.ticker,h);
   if(h.length<6||h[h.length-1].t-h[0].t<50000)continue;
   const change=h[h.length-1].v-h[0].v,side=change>3?'up':change< -3?'down':null;if(!side)continue;
   const isBTC=String(row.asset||'').toUpperCase()==='BTC'||/BTC/i.test(String(row.asset||''));
   let btcEvidence=null;
   if(isBTC){
    btcEvidence=window.__BANK_TRADES_BTC_EVIDENCE__;
    if(!btcEvidence||!Number.isFinite(btcEvidence.at)||Date.now()-btcEvidence.at>90000||!Number.isFinite(btcEvidence.candleAt)||Date.now()-btcEvidence.candleAt>180000){status.textContent='BTC PAPER: waiting for fresh independent BTCUSD chart confirmation';continue;}
    if(btcEvidence.direction!==side||Math.abs(btcEvidence.bull-btcEvidence.bear)<2){status.textContent='BTC PAPER: Kalshi and BTCUSD indicators disagree; no BTC trade';continue;}
   }
   const ask=side==='up'?ya:na;if(ask<35||ask>80)continue;
   const max=Math.min(1000,Math.max(1,Number(el('kaiMax').value)||50));
   const qty=Math.min(10000,Math.floor(Math.min(max,load().cash)/(ask/100))),cost=qty*ask/100;
   if(!qty||cost>1000)continue;
   if(!navigator.locks)throw Error('Safe paper-ledger locking is unavailable');
   await navigator.locks.request(key,()=>{const book=load();spent=book.trades.filter(t=>t.source==='KAIBOT PAPER'&&new Date(t.at).toDateString()===today).reduce((sum,t)=>sum+(Number(t.cost)||0),0);if(cost>1000)return;if(book.cash<cost||book.trades.some(t=>t.ticker===m.ticker&&t.source==='KAIBOT PAPER')){attempted.add(m.ticker);return}
   book.cash=Math.round((book.cash-cost)*100)/100;
   book.trades.push({asset:row.asset,side,qty,ask,ticker:m.ticker,at:Date.now(),cost,source:'KAIBOT PAPER',status:'OPEN',evidence:btcEvidence?{source:btcEvidence.source,at:btcEvidence.at,candleAt:btcEvidence.candleAt,direction:btcEvidence.direction,bull:btcEvidence.bull,bear:btcEvidence.bear,rsi:btcEvidence.rsi,macdHistogram:btcEvidence.macdHistogram}:null});
   save(book);window.dispatchEvent(new Event('banktrades:paper'));attempted.add(m.ticker);spent+=cost;
   log('SIMULATED BUY '+side.toUpperCase()+' '+row.asset+' · '+qty+' at '+ask.toFixed(1)+'¢');
   });
  }
  status.textContent='PAPER BOT ON · Virtual cash $'+load().cash.toFixed(2)+' / $1,000';
 }catch(e){status.textContent='BOT PAUSED · '+e.message;log('No trade: '+e.message)}
 finally{busy=false}
}
start.addEventListener('click',()=>{active=true;samples.clear();status.textContent='PAPER BOT ON · collecting market samples';log('Paper bot started');cycle()});
stop.addEventListener('click',()=>{active=false;status.textContent='BOT OFF';log('Bot stopped')});
setInterval(cycle,12000);
