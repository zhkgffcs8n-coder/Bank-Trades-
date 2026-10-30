import {initialModel,predict,learn,validFeatures} from './research-model.mjs';
const host=document.getElementById('pro-learning');
if(host){
 const key='banktrades.learning.v1.'+window.__BANK_TRADES_USER_ID__;
 let state={model:initialModel(),observations:[]};
 try{const saved=JSON.parse(localStorage.getItem(key));if(saved?.model?.weights?.length===4&&saved.model.weights.every(Number.isFinite)&&Array.isArray(saved.observations))state=saved;}catch{}
 const panel=document.createElement('div');panel.className='notice';host.append(panel);
 const detail=document.createElement('p');detail.className='premium-foot';host.append(detail);
 const breakdown=document.createElement('div');breakdown.className='premium-foot';host.append(breakdown);
 const recent=document.createElement('div');recent.className='premium-foot';host.append(recent);
 const diagnostics=document.createElement('div');diagnostics.className='premium-foot';host.append(diagnostics);

 const exportButton=document.createElement('button');exportButton.textContent='EXPORT RESEARCH RESULTS / BACKUP';host.append(exportButton);
 const storageNote=document.createElement('p');storageNote.className='premium-foot';storageNote.textContent='Stored in this browser only. Export backups regularly; clearing site data or changing devices can erase history. Accuracy uses finalized signals only, not paper-trade profit.';host.append(storageNote);
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{detail.textContent='Device storage unavailable. Research results are not saved.';}};
 function render(){const m=state.model,pending=state.observations.filter(o=>o.outcome==null).length;
  const settled=state.observations.filter(o=>o.outcome===0||o.outcome===1);const wins=settled.filter(o=>o.outcome===1).length;const losses=settled.length-wins;const rate=settled.length?(100*wins/settled.length).toFixed(1)+'%':'not available';
  panel.textContent='SETTLEMENT LEARNER · '+settled.length+' settled · '+wins+' wins / '+losses+' losses · '+rate+' observed accuracy · '+pending+' pending · VALIDATION INCOMPLETE';
  const byAsset=new Map();for(const o of settled){const asset=o.asset||'OTHER',v=byAsset.get(asset)||{wins:0,losses:0};if(o.outcome===1)v.wins++;else v.losses++;byAsset.set(asset,v)}
  breakdown.replaceChildren();const h=document.createElement('strong');h.textContent='SETTLED RESULTS BY MARKET';breakdown.append(h);
  if(!byAsset.size){const p=document.createElement('p');p.textContent='No finalized outcomes recorded on this device yet.';breakdown.append(p)}
  for(const [asset,v] of [...byAsset.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){const p=document.createElement('p');const n=v.wins+v.losses;p.textContent=asset+' · '+v.wins+' W / '+v.losses+' L · '+(100*v.wins/n).toFixed(1)+'% ('+n+' settled)';breakdown.append(p)}
  recent.replaceChildren();const rh=document.createElement('strong');rh.textContent='LAST FINALIZED SIGNALS';recent.append(rh);
  for(const o of settled.slice(-8).reverse()){const p=document.createElement('p');p.textContent=new Date(o.at).toLocaleString()+' · '+o.asset+' · '+(o.action==='BUY YES'?'BUY UP':'BUY DOWN')+' · '+(o.outcome===1?'WIN':'LOSS')+' · '+o.ticker;recent.append(p)}
  diagnostics.replaceChildren();
  const heading=document.createElement('strong');heading.textContent='RECENT ACCURACY & CALIBRATION';diagnostics.append(heading);
  const recentSettled=settled.slice(-50),recentWins=recentSettled.filter(o=>o.outcome===1).length;
  const n=recentSettled.length;
  const z=1.96,rate50=n?recentWins/n:0,den=1+z*z/Math.max(n,1);
  const lower=n?(rate50+z*z/(2*n)-z*Math.sqrt(rate50*(1-rate50)/n+z*z/(4*n*n)))/den:0;
  const upper=n?(rate50+z*z/(2*n)+z*Math.sqrt(rate50*(1-rate50)/n+z*z/(4*n*n)))/den:0;
  const rec=document.createElement('p');rec.textContent=n?'Last '+n+' finalized signals: '+recentWins+' W / '+(n-recentWins)+' L · '+(100*rate50).toFixed(1)+'% observed · 95% Wilson interval '+(100*lower).toFixed(0)+'–'+(100*upper).toFixed(0)+'%':'No recent finalized signals yet';diagnostics.append(rec);
  const caution=document.createElement('p');caution.textContent=settled.length<30?'LOW SAMPLE: fewer than 30 finalized signals; do not rely on the win rate.':settled.length<100?'LIMITED SAMPLE: fewer than 100 finalized signals; uncertainty remains high.':'Historical outcomes do not guarantee future results; correlated signals can exaggerate apparent precision.';diagnostics.append(caution);
  const bins=[{lo:0,hi:.25},{lo:.25,hi:.5},{lo:.5,hi:.75},{lo:.75,hi:1.00001}];
  for(const b of bins){const group=settled.filter(o=>Number.isFinite(o.prediction)&&o.prediction>=b.lo&&o.prediction<b.hi);if(!group.length)continue;const predicted=group.reduce((s,o)=>s+o.prediction,0)/group.length;const actual=group.filter(o=>o.outcome===1).length/group.length;const p=document.createElement('p');p.textContent='Predicted '+Math.round(b.lo*100)+'–'+Math.round(Math.min(1,b.hi)*100)+'%: '+group.length+' settled · mean forecast '+(100*predicted).toFixed(1)+'% vs observed '+(100*actual).toFixed(1)+'%';diagnostics.append(p)}
  const recentBrier=recentSettled.length?recentSettled.reduce((s,o)=>s+(o.prediction-o.outcome)**2,0)/recentSettled.length:null;
  const recentBase=recentSettled.length?recentSettled.reduce((s,o)=>s+(o.baseline-o.outcome)**2,0)/recentSettled.length:null;
  const score=document.createElement('p');score.textContent=recentBrier===null?'Recent forecast error: not available':'Last '+n+' Brier error '+recentBrier.toFixed(4)+' vs market-price baseline '+recentBase.toFixed(4)+' (lower is better)'+(recentBrier<recentBase?' · research forecast lower error':' · no demonstrated improvement');diagnostics.append(score);
  detail.textContent=m.count?`Prospective Brier score ${(m.brier/m.count).toFixed(4)} · entry-ask baseline ${(m.baselineBrier/m.count).toFixed(4)} (lower is better). This device only. Uncalibrated; correlated samples; no guaranteed improvement. Research model does not control orders.`:'Logs predictions before results arrive, then updates a small online model only after finalized binary settlement. No synthetic wins. Runs while this page is open. Does not control orders.';
 }
 window.addEventListener('banktrades:signals',e=>{
  for(const s of e.detail||[]){
   if(s.action==='WAIT'||!s.ticker||!validFeatures(s.features)||!Number.isFinite(s.ask)||s.ask<=0||s.ask>=1||!Number.isFinite(s.expiresAt)||s.expiresAt<=Date.now()||state.observations.some(o=>o.ticker===s.ticker))continue;
   if(state.observations.length>=1000){const oldIndex=state.observations.findIndex(o=>o.outcome===0||o.outcome===1);if(oldIndex<0)continue;state.observations.splice(oldIndex,1);}
   state.observations.push({ticker:s.ticker,asset:s.asset,action:s.action,at:Date.now(),expiresAt:s.expiresAt,features:s.features,baseline:s.ask,prediction:predict(state.model,s.ask,s.features),modelVersion:state.model.count});
  }save();render();
 });
 let busy=false;
 async function outcomes(){if(busy||document.hidden)return;const pending=state.observations.filter(o=>o.outcome==null&&o.expiresAt<Date.now()-60000).sort((a,b)=>(a.checkedAt||0)-(b.checkedAt||0)).slice(0,8);if(!pending.length)return;busy=true;
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);
  try{
   const r=await fetch('/api/data?mode=outcomes&tickers='+encodeURIComponent(pending.map(o=>o.ticker).join(',')),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('Outcome feed HTTP '+r.status);
   const data=await r.json();if(Math.abs(Date.now()-Date.parse(data.fetched_at))>30000)throw Error('Stale outcome response');
   for(const o of pending){o.checkedAt=Date.now();const result=data.results?.find(r=>r.ticker===o.ticker);if(!result?.finalized||!['yes','no'].includes(result.result))continue;
    const y=(o.action==='BUY YES')===(result.result==='yes')?1:0;
    state.model=learn(state.model,o,y);o.outcome=y;o.finalizedAt=result.settledAt;o.measuredAt=Date.now();
   }save();render();
  }catch(e){detail.textContent='Settlement checks paused: '+e.message+'. Pending outcomes are not counted as wins or losses.';}finally{clearTimeout(timer);busy=false;}
 }
 const paperKey='banktrades.paper.v2.'+window.__BANK_TRADES_USER_ID__;
 const botResults=document.createElement('div');botResults.className='notice';host.append(botResults);
 const botHistory=document.createElement('div');botHistory.className='premium-foot';host.append(botHistory);
 function renderBot(){
  let ledger;try{ledger=JSON.parse(localStorage.getItem(paperKey)||'null')}catch{}
  const trades=Array.isArray(ledger?.trades)?ledger.trades:[];
  const resolved=trades.filter(t=>t.settlement==='WIN'||t.settlement==='LOSS');const wins=resolved.filter(t=>t.settlement==='WIN').length;
  const open=trades.filter(t=>t.status==='OPEN').length;
  const pnl=trades.filter(t=>t.status==='SETTLED'||t.status==='CLOSED').reduce((sum,t)=>sum+(Number.isFinite(Number(t.pnl))?Number(t.pnl):0),0);const manual=trades.filter(t=>t.source!=='KAIBOT PAPER').length;const bot=trades.length-manual;
  botResults.textContent='VERIFIED PAPER LEDGER · '+wins+' settled wins / '+(resolved.length-wins)+' settled losses · '+open+' awaiting settlement · '+(resolved.length?(100*wins/resolved.length).toFixed(1)+'%':'N/A')+' settled win rate · Virtual realized P/L 
  botHistory.replaceChildren();
  for(const t of trades.slice(-10).reverse()){
   const p=document.createElement('p');
   p.textContent=t.asset+' '+String(t.side).toUpperCase()+' · '+t.qty+' @ '+Number(t.ask).toFixed(1)+'¢ · '+(t.settlement||t.status||'OPEN')+(Number.isFinite(t.pnl)?' · virtual P/L $'+t.pnl.toFixed(2):'')+' · '+t.ticker;
   botHistory.append(p);
  }
 }
 let botBusy=false;
 async function reconcileBot(){
  if(botBusy||document.hidden||!navigator.locks)return;let ledger;try{ledger=JSON.parse(localStorage.getItem(paperKey)||'null')}catch{};
  const due=(ledger?.trades||[]).filter(t=>t.status!=='CLOSED'&&t.status!=='SETTLED'&&t.ticker&&Date.now()-t.at>60000).slice(0,8);
  if(!due.length){renderBot();return}botBusy=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const r=await fetch('/api/data?mode=outcomes&tickers='+encodeURIComponent([...new Set(due.map(t=>t.ticker))].join(',')),{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('Settlement feed '+r.status);
   const d=await r.json();if(!Number.isFinite(Date.parse(d.fetched_at))||Math.abs(Date.now()-Date.parse(d.fetched_at))>30000)throw Error('Stale settlement feed');
   await navigator.locks.request(paperKey,()=>{
    let b;try{b=JSON.parse(localStorage.getItem(paperKey)||'null')}catch{};if(!b||!Array.isArray(b.trades)||!Number.isFinite(b.cash))return;
    let changed=false;
    for(const t of b.trades){if(t.status==='CLOSED'||t.status==='SETTLED'||!t.ticker)continue;
     const result=d.results?.find(x=>x.ticker===t.ticker);if(!result?.finalized||!['yes','no'].includes(result.result))continue;
     const won=(t.side==='up'&&result.result==='yes')||(t.side==='down'&&result.result==='no');
     const payout=won?t.qty:0;const cost=Number(t.cost);if(!Number.isFinite(cost)||!Number.isFinite(payout)||!Number.isInteger(t.qty)||t.qty<=0)continue;
     t.status='SETTLED';t.settlement=won?'WIN':'LOSS';t.settlementResult=result.result;t.settledAt=result.settledAt||Date.now();t.pnl=Math.round((payout-cost)*100)/100;t.payout=payout;b.cash=Math.round((b.cash+payout)*100)/100;changed=true;
    }
    if(changed){localStorage.setItem(paperKey,JSON.stringify(b));window.dispatchEvent(new Event('banktrades:paper'))}
   });renderBot();
  }catch(e){botResults.textContent='KAIBOT settlement verification pending: '+e.message+' · no result assumed';}finally{clearTimeout(timer);botBusy=false}
 }
 window.addEventListener('banktrades:paper',renderBot);
 renderBot();reconcileBot();setInterval(reconcileBot,30000);
 exportButton.onclick=()=>{const blob=new Blob([JSON.stringify({schema:'banktrades-research-v1',exportedAt:new Date().toISOString(),...state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bank-trades-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 render();outcomes();setInterval(outcomes,30000);
}
+pnl.toFixed(2)+' before fees · '+bot+' KaiBot / '+manual+' manual trades · local device only';
  botHistory.replaceChildren();
  for(const t of trades.slice(-10).reverse()){
   const p=document.createElement('p');
   p.textContent=t.asset+' '+String(t.side).toUpperCase()+' · '+t.qty+' @ '+Number(t.ask).toFixed(1)+'¢ · '+(t.settlement||t.status||'OPEN')+(Number.isFinite(t.pnl)?' · virtual P/L $'+t.pnl.toFixed(2):'')+' · '+t.ticker;
   botHistory.append(p);
  }
 }
 let botBusy=false;
 async function reconcileBot(){
  if(botBusy||document.hidden||!navigator.locks)return;let ledger;try{ledger=JSON.parse(localStorage.getItem(paperKey)||'null')}catch{};
  const due=(ledger?.trades||[]).filter(t=>t.status!=='CLOSED'&&t.status!=='SETTLED'&&t.ticker&&Date.now()-t.at>60000).slice(0,8);
  if(!due.length){renderBot();return}botBusy=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const r=await fetch('/api/data?mode=outcomes&tickers='+encodeURIComponent([...new Set(due.map(t=>t.ticker))].join(',')),{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('Settlement feed '+r.status);
   const d=await r.json();if(!Number.isFinite(Date.parse(d.fetched_at))||Math.abs(Date.now()-Date.parse(d.fetched_at))>30000)throw Error('Stale settlement feed');
   await navigator.locks.request(paperKey,()=>{
    let b;try{b=JSON.parse(localStorage.getItem(paperKey)||'null')}catch{};if(!b||!Array.isArray(b.trades)||!Number.isFinite(b.cash))return;
    let changed=false;
    for(const t of b.trades){if(t.status==='CLOSED'||t.status==='SETTLED'||!t.ticker)continue;
     const result=d.results?.find(x=>x.ticker===t.ticker);if(!result?.finalized||!['yes','no'].includes(result.result))continue;
     const won=(t.side==='up'&&result.result==='yes')||(t.side==='down'&&result.result==='no');
     const payout=won?t.qty:0;const cost=Number(t.cost);if(!Number.isFinite(cost)||!Number.isFinite(payout)||!Number.isInteger(t.qty)||t.qty<=0)continue;
     t.status='SETTLED';t.settlement=won?'WIN':'LOSS';t.settlementResult=result.result;t.settledAt=result.settledAt||Date.now();t.pnl=Math.round((payout-cost)*100)/100;t.payout=payout;b.cash=Math.round((b.cash+payout)*100)/100;changed=true;
    }
    if(changed){localStorage.setItem(paperKey,JSON.stringify(b));window.dispatchEvent(new Event('banktrades:paper'))}
   });renderBot();
  }catch(e){botResults.textContent='KAIBOT settlement verification pending: '+e.message+' · no result assumed';}finally{clearTimeout(timer);botBusy=false}
 }
 window.addEventListener('banktrades:paper',renderBot);
 renderBot();reconcileBot();setInterval(reconcileBot,30000);
 exportButton.onclick=()=>{const blob=new Blob([JSON.stringify({schema:'banktrades-research-v1',exportedAt:new Date().toISOString(),...state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bank-trades-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 render();outcomes();setInterval(outcomes,30000);
}
