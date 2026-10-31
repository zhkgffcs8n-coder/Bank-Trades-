import {initialModel,predict,learn,validFeatures} from './research-model.mjs';
const host=document.getElementById('pro-learning');
if(host){
 const key='banktrades.learning.v1.'+window.__BANK_TRADES_USER_ID__;
 let state={model:initialModel(),observations:[]};
 try{const saved=JSON.parse(localStorage.getItem(key));if(saved?.model?.weights?.length===4&&saved.model.weights.every(Number.isFinite)&&Array.isArray(saved.observations))state=saved;}catch{}
 const sharedStatus=document.createElement('p');sharedStatus.className='premium-foot';sharedStatus.textContent='Shared prediction feed: connecting. Research training remains separate until verified feature snapshots and finalized labels are available.';host.append(sharedStatus);
 window.addEventListener('banktrades:shared-signals',event=>{
  const signals=Array.isArray(event.detail)?event.detail:[];
  const buys=signals.filter(s=>s.action==='BUY UP'||s.action==='BUY DOWN');
  sharedStatus.textContent='SHARED KAIBOT SIGNAL FEED · '+signals.length+' markets · '+buys.length+' experimental BUY alerts · '+signals.filter(s=>s.action==='WAIT').length+' WAIT. Same server predictions as live dashboard; no duplicate learner samples. No live-money orders.';
 });
 const comparisonPanel=document.createElement('div');comparisonPanel.className='premium-foot';host.append(comparisonPanel);
 const serverTraining=document.createElement('p');serverTraining.className='premium-foot';serverTraining.textContent='SERVER RESEARCH TRAINING · loading verified settlement statistics';host.append(serverTraining);
 async function refreshServerTraining(){
  try{
   const response=await fetch('/.netlify/functions/market-history?asset=BTC',{cache:'no-store'});
   if(!response.ok)throw Error('status '+response.status);
   const data=await response.json(),t=data.training;
   const cmp=data.comparison,adaptive=data.adaptiveResearch,mistakes=data.mistakeAnalysis;
   const fmt=x=>Number.isFinite(x)?(100*x).toFixed(1)+'%':'N/A';
   comparisonPanel.replaceChildren();
   const heading=document.createElement('strong');heading.textContent='ENGINE A vs ENGINE B · SERVER SHADOW COMPARISON';comparisonPanel.append(heading);
   if(cmp){for(const name of ['original','upgraded']){const v=cmp.engines?.[name];if(!v)continue;const line=document.createElement('p');line.textContent=(name==='original'?'ENGINE A · ORIGINAL':'ENGINE B · UPGRADED')+' · '+v.trades+' settled · '+v.wins+' W / '+v.losses+' L · win rate '+fmt(v.winRate)+' · simulated net '+Number(v.netPnl).toFixed(2)+' contracts · ROI '+fmt(v.roi)+' · max drawdown '+Number(v.maxDrawdown).toFixed(2);comparisonPanel.append(line)}const meta=document.createElement('p');meta.textContent=cmp.pending+' pending · '+cmp.totalObserved+' observed · '+(cmp.truncated?'report truncated · ':'')+'one-contract hypothetical settlement; excludes fees, slippage and early exits';comparisonPanel.append(meta)}else{const line=document.createElement('p');line.textContent='Waiting for the first server-side comparison report';comparisonPanel.append(line)}
   if(mistakes){const line=document.createElement('p');line.textContent='AUTOMATIC MISTAKE REVIEW · '+mistakes.disagreements.originalOnly+' original-only signals · '+mistakes.disagreements.bothEntered+' shared entries · '+mistakes.recentLosses.length+' recent losing examples · '+mistakes.recommendations.length+' research warnings';comparisonPanel.append(line);for(const warning of mistakes.recommendations.slice(0,5)){const p=document.createElement('p');p.textContent='REVIEW · '+warning.reason;comparisonPanel.append(p)}}
   if(adaptive){const line=document.createElement('p');line.textContent='SHARED LOSS REVIEW · '+adaptive.trainingCount+' training / '+adaptive.holdoutCount+' recent observations · '+(adaptive.proposed?'Research-only proposed gate: score ≥'+adaptive.proposed.score+', ask ≤'+adaptive.proposed.maxAsk+'¢':'No validated replacement gate proposed')+' · baseline unchanged; no automatic deployment';comparisonPanel.append(line)}
   serverTraining.textContent=t?'SHARED SERVER RESEARCH · '+t.count+' finalized predictions · model Brier '+(Number.isFinite(t.brier)?t.brier.toFixed(4):'N/A')+' · market baseline '+(Number.isFinite(t.baselineBrier)?t.baselineBrier.toFixed(4):'N/A')+' · '+(t.validated?'research validation threshold met':'validation incomplete')+' · paper-only':'SHARED SERVER RESEARCH · awaiting first verified training update';
  }catch{serverTraining.textContent='SHARED SERVER RESEARCH · status temporarily unavailable';}
 }
 refreshServerTraining();setInterval(refreshServerTraining,60000);
 const paperPerformance=document.createElement('div');paperPerformance.className='premium-foot';host.append(paperPerformance);
 window.addEventListener('banktrades:paper-performance',event=>{
  const stats=event.detail,overall=stats?.overall;
  if(!overall)return;
  const pct=x=>Number.isFinite(x)?(100*x).toFixed(1)+'%':'N/A';
  const groups=Object.entries(stats.byStrategy||{}).sort((a,b)=>b[1].trades-a[1].trades);
  paperPerformance.replaceChildren();
  const h=document.createElement('strong');h.textContent='SHARED SERVER PAPER PERFORMANCE · VERIFIED SETTLEMENTS';paperPerformance.append(h);
  const total=document.createElement('p');total.textContent=overall.trades+' resolved · '+overall.wins+' W / '+overall.losses+' L · '+pct(overall.winRate)+' wins · paper P/L $'+overall.netPnl.toFixed(2)+' · ROI '+pct(overall.roi);paperPerformance.append(total);
  for(const [name,v] of groups){const row=document.createElement('p');row.textContent=name+' · '+v.trades+' trades · '+v.wins+'W/'+v.losses+'L · ROI '+pct(v.roi)+' · paper P/L $'+v.netPnl.toFixed(2);paperPerformance.append(row)}
  for(const [label,groups] of [['ENTRY PRICE',stats.byEntryBand],['EXIT REASON',stats.byExitReason]]){
   if(!groups)continue;
   const head=document.createElement('strong');head.textContent='PAPER LOSS ANALYSIS · '+label;paperPerformance.append(head);
   for(const [name,v] of Object.entries(groups)){
    if(!v.trades)continue;
    const line=document.createElement('p');line.textContent=name+' · '+v.trades+' resolved · '+v.wins+'W/'+v.losses+'L · ROI '+pct(v.roi)+' · P/L $'+v.netPnl.toFixed(2);
    paperPerformance.append(line);
   }
  }
  const note=document.createElement('p');note.textContent='Paper fills and slippage are simulated. Research training requires finalized market outcomes.';paperPerformance.append(note);
 });
 const panel=document.createElement('div');panel.className='notice';host.append(panel);
 const detail=document.createElement('p');detail.className='premium-foot';host.append(detail);
 const breakdown=document.createElement('div');breakdown.className='premium-foot';host.append(breakdown);
 const recent=document.createElement('div');recent.className='premium-foot';host.append(recent);
 const diagnostics=document.createElement('div');diagnostics.className='premium-foot';host.append(diagnostics);
 const walk=document.createElement('div');walk.className='premium-foot';host.append(walk);

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
  for(const o of settled.slice(-8).reverse()){const p=document.createElement('p');p.textContent=new Date(o.at).toLocaleString()+' · '+o.asset+' · '+(['BUY YES','BUY UP'].includes(o.action)?'BUY UP':'BUY DOWN')+' · '+(o.outcome===1?'WIN':'LOSS')+' · '+o.ticker;recent.append(p)}
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
  walk.replaceChildren();const wh=document.createElement('strong');wh.textContent='WALK-FORWARD BTC VALIDATION';walk.append(wh);
  const btc=settled.filter(o=>o.asset==='BTC'&&o.context);const trainCut=Math.max(0,btc.length-30),holdout=btc.slice(trainCut);
  const wp=document.createElement('p');wp.textContent=btc.length<30?'Collecting prospective BTC rounds: '+btc.length+'/30 minimum before adaptive setup recommendations.':('Newest '+holdout.length+' BTC rounds are shown as a rolling holdout window; older observations remain historical training evidence.');walk.append(wp);
  const dimensions=[['Entry',o=>o.context.entryBand],['Time left',o=>o.context.timeBand],['Spread',o=>o.context.spreadBand],['Momentum',o=>o.context.momentumBand],['Lock',o=>o.context.lockBand],['Indicators',o=>o.context.indicatorBand],['Regime',o=>o.context.regime]];
  for(const [label,get] of dimensions){const groups=new Map();for(const o of btc){const k=get(o)||'unknown',v=groups.get(k)||{n:0,w:0};v.n++;v.w+=o.outcome;groups.set(k,v)}const eligible=[...groups].filter(([,v])=>v.n>=12).sort((a,b)=>(b[1].w/b[1].n)-(a[1].w/a[1].n));if(!eligible.length)continue;const p=document.createElement('p');p.textContent=label+': '+eligible.map(([k,v])=>k+' '+v.w+'/'+v.n+' ('+(100*v.w/v.n).toFixed(0)+'%)').join(' · ');walk.append(p)}
  const adaptive=document.createElement('p');if(btc.length<50)adaptive.textContent='ADAPTIVE GATE: observation only — insufficient settled BTC sample to suppress setups.';else{const bad=[];for(const [label,get] of dimensions){const groups=new Map();for(const o of btc.slice(0,-20)){const k=get(o)||'unknown',v=groups.get(k)||{n:0,w:0};v.n++;v.w+=o.outcome;groups.set(k,v)}for(const [k,v] of groups)if(v.n>=20&&v.w/v.n<.45)bad.push(label+'='+k)}adaptive.textContent=bad.length?'RESEARCH WARNING: historically weak tested buckets: '+bad.join(', ')+'. Keep paper-only until holdout confirms.':'No setup bucket has enough evidence to disable under the conservative rule.'}walk.append(adaptive);
  detail.textContent=m.count?`Prospective Brier score ${(m.brier/m.count).toFixed(4)} · entry-ask baseline ${(m.baselineBrier/m.count).toFixed(4)} (lower is better). This device only. Uncalibrated; correlated samples; no guaranteed improvement. Research model does not control orders.`:'Logs predictions before results arrive, then updates a small online model only after finalized binary settlement. No synthetic wins. Runs while this page is open. Does not control orders.';
 }
 window.addEventListener('banktrades:signals',e=>{
  for(const s of e.detail||[]){
   if(!['BUY UP','BUY DOWN','BUY YES','BUY NO'].includes(s.action)||!s.ticker||!validFeatures(s.features)||!Number.isFinite(s.ask)||s.ask<=0||s.ask>=1||!Number.isFinite(s.expiresAt)||s.expiresAt<=Date.now()||state.observations.some(o=>o.ticker===s.ticker))continue;
   if(state.observations.length>=1000){const oldIndex=state.observations.findIndex(o=>o.outcome===0||o.outcome===1);if(oldIndex<0)continue;state.observations.splice(oldIndex,1);}
   const lock=s.asset==='BTC'?window.__BANK_TRADES_BTC_LOCK__:null,secondsLeft=Math.max(0,(s.expiresAt-Date.now())/1000),spread=Number(s.spread??s?.meta?.spread),momentum=Number(s.momentum??s.features?.[0]),entry=s.ask;
   const context={entryBand:entry<.45?'35–44¢':entry<.6?'45–59¢':'60¢+',timeBand:secondsLeft<360?'<6m':secondsLeft<600?'6–10m':'10m+',spreadBand:Number.isFinite(spread)?(spread<=.01?'≤1¢':spread<=.03?'2–3¢':'>3¢'):'unknown',momentumBand:Number.isFinite(momentum)?(Math.abs(momentum)<.25?'low':Math.abs(momentum)<.6?'medium':'high'):'unknown',lockBand:lock&&Date.now()-Number(lock.at)<90000?(lock.lockCandidate?'candidate':'tracking'):'none',indicatorBand:lock&&Number.isFinite(lock.quality)?(lock.quality>=75?'strong':lock.quality>=55?'mixed':'weak'):'unknown',regime:Number.isFinite(momentum)?(Math.abs(momentum)>=.6?'trend':Math.abs(momentum)<=.2?'flat':'transition'):'unknown',secondsLeft,spread:Number.isFinite(spread)?spread:null,momentum:Number.isFinite(momentum)?momentum:null,lockQuality:lock?.quality??null};
   state.observations.push({ticker:s.ticker,asset:s.asset,action:s.action,at:Date.now(),expiresAt:s.expiresAt,features:s.features,baseline:['BUY DOWN','BUY NO'].includes(s.action)?1-s.ask:s.ask,prediction:predict(state.model,['BUY DOWN','BUY NO'].includes(s.action)?1-s.ask:s.ask,s.features),modelVersion:state.model.count,context});
  }save();render();
 });
 let busy=false;
 async function outcomes(){if(busy||document.hidden)return;const pending=state.observations.filter(o=>o.outcome==null&&o.expiresAt<Date.now()-60000).sort((a,b)=>(a.checkedAt||0)-(b.checkedAt||0)).slice(0,8);if(!pending.length)return;busy=true;
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);
  try{
   const r=await fetch('/api/data?mode=outcomes&tickers='+encodeURIComponent(pending.map(o=>o.ticker).join(',')),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('Outcome feed HTTP '+r.status);
   const data=await r.json();if(Math.abs(Date.now()-Date.parse(data.fetched_at))>30000)throw Error('Stale outcome response');
   for(const o of pending){o.checkedAt=Date.now();const result=data.results?.find(r=>r.ticker===o.ticker);if(!result?.finalized||!['yes','no'].includes(result.result))continue;
    const y=(['BUY UP','BUY YES'].includes(o.action))===(result.result==='yes')?1:0;
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
  botResults.textContent='VERIFIED PAPER LEDGER · '+wins+' settled wins / '+(resolved.length-wins)+' settled losses · '+open+' awaiting settlement · '+(resolved.length?(100*wins/resolved.length).toFixed(1)+'%':'N/A')+' settled win rate · Virtual realized P/L '+pnl.toFixed(2)+' before fees · '+bot+' KaiBot / '+manual+' manual trades · local device + authenticated cloud entry backup';
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
 const serverSummary=document.createElement('p');serverSummary.className='notice';host.append(serverSummary);
 const combined=document.createElement('div');combined.className='notice';host.append(combined);
 const history=document.createElement('div');history.className='premium-foot';host.append(history);
 async function refreshServerResults(){
  try{
   const response=await fetch('/.netlify/functions/kaibot-state',{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   const trades=Array.isArray(data?.ledger?.trades)?data.ledger.trades:[];
   const settled=trades.filter(t=>t.status==='SETTLED'||t.status==='CLOSED');
   const resolved=settled.filter(t=>typeof t.pnl==='number'&&Number.isFinite(t.pnl));
   const wins=resolved.filter(t=>t.pnl>0).length;
   const losses=resolved.filter(t=>t.pnl<0).length;
   const ties=resolved.length-wins-losses;
   const pending=trades.filter(t=>t.status==='OPEN'||t.status==='PENDING').length;
   const totalPnl=resolved.reduce((sum,t)=>sum+t.pnl,0);
   serverSummary.textContent='SERVER KAIBOT PAPER RESULTS: '+settled.length+' settled, '+wins+' wins, '+losses+' losses, '+pending+' open.';
   combined.textContent='UNIFIED KALSHI PAPER RESULTS: '+resolved.length+' settled, '+wins+' wins / '+losses+' losses, '+ties+' break-even, '+(wins+losses?(100*wins/(wins+losses)).toFixed(1)+'%':'N/A')+' win rate, virtual P/L $'+totalPnl.toFixed(2)+'. Live market outcomes; simulated trades.';
   history.replaceChildren();
   const title=document.createElement('strong');title.textContent='SERVER PAPER TRADE HISTORY (latest 20)';history.append(title);
   for(const t of settled.slice(-20).reverse()){
    const line=document.createElement('p');
    const pnl=typeof t.pnl==='number'&&Number.isFinite(t.pnl)?t.pnl:null;
    line.textContent=String(t.asset||'UNKNOWN')+' / '+String(t.side||'').toUpperCase()+' / '+(pnl===null?'UNKNOWN':pnl>0?'WIN':pnl<0?'LOSS':'BREAK EVEN')+' / '+(pnl===null?'P/L unavailable':'virtual P/L $'+pnl.toFixed(2))+' / '+String(t.ticker||'');
    history.append(line);
   }
  }catch(e){serverSummary.textContent='Server KaiBot results unavailable: '+e.message;combined.textContent='';history.replaceChildren();}
 }
 refreshServerResults();setInterval(refreshServerResults,15000);
 render();outcomes();setInterval(outcomes,30000);
}
