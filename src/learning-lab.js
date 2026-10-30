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
  detail.textContent=m.count?`Prospective Brier score ${(m.brier/m.count).toFixed(4)} · entry-ask baseline ${(m.baselineBrier/m.count).toFixed(4)} (lower is better). This device only. Uncalibrated; correlated samples; no guaranteed improvement. Research model does not control orders.`:'Logs predictions before results arrive, then updates a small online model only after finalized binary settlement. No synthetic wins. Runs while this page is open. Does not control orders.';
 }
 window.addEventListener('banktrades:signals',e=>{
  for(const s of e.detail||[]){
   if(s.action==='WAIT'||!s.ticker||!validFeatures(s.features)||!Number.isFinite(s.ask)||s.ask<=0||s.ask>=1||!Number.isFinite(s.expiresAt)||s.expiresAt<=Date.now()||state.observations.some(o=>o.ticker===s.ticker))continue;
   if(state.observations.length>=1000)continue;
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
 exportButton.onclick=()=>{const blob=new Blob([JSON.stringify({schema:'banktrades-research-v1',exportedAt:new Date().toISOString(),...state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bank-trades-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 render();outcomes();setInterval(outcomes,30000);
}
