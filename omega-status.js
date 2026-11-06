(() => {
 const $=id=>document.getElementById(id);
 const health=$('omegaUltraReadout'), status=$('spiderReviewStatus'), results=$('spiderReviewResults');
 let signals=[],receivedAt=0;
 function review(){
  if(!status||!results)return;
  if(window.__BANK_TRADES_SHARED_ERROR__||Date.now()-receivedAt>90000){
   if(results.childElementCount)results.replaceChildren();
   status.textContent=receivedAt?'Fresh shared signals unavailable':'Waiting for shared signals';
   return;
  }
  const now=Date.now();
  const rows=signals.map(signal=>{
   const assessment=signal.roundAssessment;
   const current=assessment?.ticker===signal.ticker&&assessment.expiresAt>now&&
    assessment.evaluatedAt<=now&&now-assessment.evaluatedAt<=90000;
   const item=document.createElement('p');
   item.textContent=[signal.asset,current?signal.action:'WAIT',current?signal.reason:signal.ticker?'Fresh round assessment unavailable':signal.reason].filter(Boolean).join(' · ');
   return item;
  });
  results.replaceChildren(...rows);
  status.textContent='Reviewed '+rows.length+' markets · '+new Date(receivedAt).toLocaleTimeString();
 }
 window.addEventListener('banktrades:shared-signals',event=>{
  signals=Array.isArray(event.detail)?event.detail:[];
  receivedAt=Date.now();
  // The signal publisher clears its previous error after dispatch.
  queueMicrotask(review);
 });
 $('spiderReview')?.addEventListener('click',review);
 setInterval(review,5000);

 let checking=false;
 async function refreshHealth(){
  if(!health||checking||document.hidden)return;
  checking=true;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetch('/.netlify/functions/omega-live-health',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Health unavailable');
   const data=await response.json();
   const fresh=Number.isFinite(data.omegaAgeSeconds)&&data.omegaAgeSeconds<=150;
   const providers=(data.omegaProviderStatus||[]).map(p=>p.provider+' '+(p.httpStatus===401?'authentication rejected (401)':p.status.replace(/_/g,' ').toLowerCase())+(p.errorCode?' · '+p.errorCode:''));
   const providerCheck=data.omegaProviderCheckedAt?'Last provider check '+new Date(data.omegaProviderCheckedAt).toLocaleTimeString():null;
   const collector=data.status==='COLLECTOR_FRESH'?'Collector fresh · '+data.sampledAssetCount+' markets':'Collector freshness unverified';
   health.textContent=[collector,fresh?'OMEGA '+data.omegaStatus.replace(/_/g,' ').toLowerCase():'OMEGA heartbeat unverified',data.omegaProvidersConfigured+' external providers configured',providerCheck,...providers,'Paper last action '+data.paperLastAction,'Real orders off'].filter(Boolean).join(' · ');
  }catch{health.textContent='Research status unavailable · Real orders off'}
  finally{clearTimeout(timeout);checking=false}
 }
 refreshHealth();
 setInterval(refreshHealth,30000);
 document.addEventListener('visibilitychange',refreshHealth);
})();
