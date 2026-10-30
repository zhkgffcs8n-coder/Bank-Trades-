(()=>{
'use strict';
const uid=window.__BANK_TRADES_USER_ID__;if(!uid)return;
const key='banktrades.paper.v2.'+uid;
const style=document.createElement('style');style.textContent=`
#btAlert{position:fixed;top:env(safe-area-inset-top,0px);left:50%;transform:translateX(-50%);width:min(96vw,620px);z-index:2147483000;background:#101925;color:white;border:2px solid #e8b954;box-shadow:0 12px 55px #000b;border-radius:0 0 18px 18px;padding:12px 15px;display:none;font:700 15px system-ui}
#btAlert strong{display:block;font-size:clamp(19px,5vw,29px);letter-spacing:.03em}
#btAlert small{display:block;color:#e0e6ec;font-size:12px;font-weight:500;margin-top:4px}
#btAlert button{float:right;background:#293545;border:1px solid #64748b;color:white;border-radius:7px;padding:7px}
#btPaperStats{margin:12px 0;padding:16px;border:1px solid #8a6b29;border-radius:12px;background:#111a26;color:#fff}
#btPaperStats .btMetrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:9px;margin:12px 0}
#btPaperStats .btMetric{background:#1c2b39;padding:10px;border-radius:8px}
#btPaperStats .btMetric b{display:block;font-size:21px}
#btPaperStats table{width:100%;font-size:12px;border-collapse:collapse}
#btPaperStats td,#btPaperStats th{padding:8px 4px;border-bottom:1px solid #344454;text-align:left}
`;document.head.append(style);
const banner=document.createElement('div');banner.id='btAlert';banner.setAttribute('role','alert');banner.setAttribute('aria-live','assertive');const close=document.createElement('button');close.textContent='DISMISS';const title=document.createElement('strong'),detail=document.createElement('small');banner.append(close,title,detail);document.body.append(banner);
let lastAlert='',dismissed='',quotes=new Map(),lastFetch=0;
close.onclick=()=>{dismissed=lastAlert;banner.style.display='none'};
function alertNow(kind,message,id){if(id===dismissed)return;if(id!==lastAlert){lastAlert=id;title.textContent=kind;detail.textContent=message;banner.style.display='block'}}
const host=document.getElementById('pro-paper');if(!host)return;
const panel=document.createElement('section');panel.id='btPaperStats';const heading=document.createElement('h3');heading.textContent='KAIBOT · LIVE KALSHI PAPER PERFORMANCE';const metrics=document.createElement('div');metrics.className='btMetrics';const table=document.createElement('table');panel.append(heading,metrics,table);host.insertBefore(panel,host.querySelector('#paperLedger'));
const money=n=>'$'+(Number(n)||0).toFixed(2);
const read=()=>{try{const b=JSON.parse(localStorage.getItem(key));return b&&Array.isArray(b.trades)?b:{cash:1000,trades:[]}}catch{return {cash:1000,trades:[]}}};
const quote=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:Number(m?.[k]);
async function refresh(){
 try{const response=await fetch('/api/data?mode=markets',{cache:'no-store'});if(!response.ok)throw Error('feed unavailable');const data=await response.json();if(!Number.isFinite(Date.parse(data.fetched_at))||Date.now()-Date.parse(data.fetched_at)>30000)throw Error('stale feed');quotes=new Map((data.results||[]).filter(x=>x.market?.ticker).map(x=>[x.market.ticker,x.market]));lastFetch=Date.now()}catch{quotes=new Map();lastFetch=0}
 render();
}
function metric(name,value){const x=document.createElement('div');x.className='btMetric';const a=document.createElement('small');a.textContent=name;const b=document.createElement('b');b.textContent=value;x.append(a,b);metrics.append(x)}
function render(){
 const b=read(),closed=b.trades.filter(t=>t.status==='CLOSED'||t.status==='SETTLED'),open=b.trades.filter(t=>t.status==='OPEN'||!t.status);
 const realized=closed.reduce((n,t)=>n+(Number(t.pnl)||0),0);
 let unrealized=0,priced=0;
 for(const t of open){const m=quotes.get(t.ticker),bid=quote(m,t.side==='up'?'yes_bid':'no_bid');if(Number.isFinite(bid)&&bid>=0&&bid<=100){unrealized+=(bid-Number(t.ask))*Number(t.qty)/100;priced++}}
 metrics.replaceChildren();metric('Virtual cash',money(b.cash));metric('Closed P/L',money(realized));metric('Open P/L (gross)',priced?money(unrealized):'Unavailable');metric('Paper rounds',String(b.trades.length));metric('Closed wins / losses',closed.filter(t=>t.pnl>0).length+' / '+closed.filter(t=>t.pnl<0).length);
 table.replaceChildren();const tr=document.createElement('tr');for(const h of ['Market','Position','Status','P/L']){const th=document.createElement('th');th.textContent=h;tr.append(th)}table.append(tr);
 for(const t of b.trades.slice(-10).reverse()){const row=document.createElement('tr'),m=quotes.get(t.ticker),bid=quote(m,t.side==='up'?'yes_bid':'no_bid');const mark=Number.isFinite(bid)&&bid>=0&&bid<=100;const pnl=t.status==='CLOSED'||t.status==='SETTLED'?Number(t.pnl):mark?(bid-Number(t.ask))*Number(t.qty)/100:null;
 for(const value of [t.asset+' · '+t.ticker,String(t.side).toUpperCase()+' '+t.qty+' @ '+Number(t.ask).toFixed(1)+'¢',t.status||'OPEN',pnl===null?'Awaiting quote':money(pnl)+(t.status==='CLOSED'||t.status==='SETTLED'?' closed':' open')]){const td=document.createElement('td');td.textContent=value;row.append(td)}table.append(row)}
 const running=document.getElementById('kaiState')?.textContent||'';const active=/PAPER BOT ON|BTC PAPER/.test(running);
 if(!active||!open.length||!lastFetch)return;
 let worst=null,best=null;
 for(const t of open){const m=quotes.get(t.ticker),bid=quote(m,t.side==='up'?'yes_bid':'no_bid');if(!Number.isFinite(bid)||bid<=0||bid>=100)continue;const delta=bid-Number(t.ask);const obj={t,bid,delta};if(!worst||delta<worst.delta)worst=obj;if(!best||delta>best.delta)best=obj}
 if(worst&&worst.delta<=-8)alertNow('⚠ CASHOUT RISK · REVIEW NOW',worst.t.asset+' '+worst.t.side.toUpperCase()+' · bid '+worst.bid.toFixed(1)+'¢ vs entry '+Number(worst.t.ask).toFixed(1)+'¢ · paper position; no sale placed','risk-'+worst.t.ticker+'-'+Math.floor(worst.bid/3));
 else if(best&&best.delta>=8)alertNow('💰 CASHOUT WATCH · PAPER PROFIT',best.t.asset+' '+best.t.side.toUpperCase()+' · bid '+best.bid.toFixed(1)+'¢ vs entry '+Number(best.t.ask).toFixed(1)+'¢ · before fees/slippage','profit-'+best.t.ticker+'-'+Math.floor(best.bid/3));
 else if(best)alertNow('HOLD / MONITOR · PAPER',best.t.asset+' '+best.t.side.toUpperCase()+' · bid '+best.bid.toFixed(1)+'¢ · monitor risk; no guaranteed outcome','hold-'+best.t.ticker+'-'+Math.floor(Date.now()/120000));
}
window.addEventListener('banktrades:kai-exit',e=>{const d=e.detail||{};alertNow('💰 CASHOUT WATCH',String(d.asset||'')+' · estimated gross '+money(d.gross)+' before fees; paper only','exit-'+d.ticker+'-'+Math.floor(Date.now()/30000))});
window.addEventListener('banktrades:paper',render);window.addEventListener('storage',e=>{if(e.key===key)render()});refresh();setInterval(()=>{if(!document.hidden)refresh()},12000);
})();