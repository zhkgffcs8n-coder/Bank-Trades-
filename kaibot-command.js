(()=>{
 const trigger=document.querySelector('[data-protab="real"]');
 const controls=document.getElementById('pro-real');
 if(!trigger||!controls||typeof HTMLDialogElement==='undefined')return;
 const panel=document.createElement('dialog');
 panel.id='kai-command';
 panel.setAttribute('aria-labelledby','kai-command-title');
 panel.innerHTML=`
 <header class="kai-command-head">
  <div><p>BANK TRADES PRO / EXECUTION DESK</p><h1 id="kai-command-title">KAIBOT COMMAND CENTER</h1></div>
  <button type="button" data-back autofocus>← BACK TO DASHBOARD</button>
 </header>
 <div class="kai-command-modes"><strong data-live-mode>REAL MONEY · LOCKED</strong><span>DEMO · SIMULATED FUNDS</span><span>PAPER · VIRTUAL LEDGER</span></div>
 <div class="kai-command-actions"><button type="button" data-start disabled>START AUTO TRADE</button><button type="button" data-stop disabled>STOP AUTO TRADE</button></div>
 <section class="kai-arena" data-move="idle" aria-label="KaiBot animated robot arena">
  <div class="kai-arena-heading"><span>01 / BTC ARENA</span><strong data-decision>AWAITING SIGNAL</strong></div>
  <svg viewBox="0 0 680 240" aria-hidden="true">
   <defs><g id="kai-robot">
    <path d="M-38 62h76l-8 50H-30Z M-27 112l-8 47h24l11-39 11 39h24l-8-47Z" fill="#162a4b" stroke="currentColor" stroke-width="3"/>
    <path d="M-22 22h44l10 14-9 25h-46l-9-25Z" fill="#14213d" stroke="currentColor" stroke-width="3"/>
    <path d="M-18 42h36M-10 88h20" stroke="currentColor" stroke-width="6"/>
    <path class="kai-fist" d="M-40 67l-25 23 9 18 30-22M40 67l25 23-9 18-30-22" fill="#192f50" stroke="currentColor" stroke-width="5"/>
   </g></defs>
   <path d="M70 205h540M117 218h446M210 231h260" fill="none" stroke="#3a306a" stroke-width="2"/>
   <g transform="translate(195 33)"><g class="kai-fighter"><use href="#kai-robot"/></g></g>
   <g transform="translate(485 33) scale(-1 1)"><g class="kai-rival"><use href="#kai-robot"/></g></g>
   <circle class="kai-impact" cx="340" cy="120" r="32" fill="none" stroke="currentColor" stroke-width="4"/>
  </svg>
  <div class="kai-arena-footer"><span>KAIBOT</span><span>15 MIN / SIMULATION</span><span>OPPONENT</span></div>
 </section>
 <dl class="kai-telemetry">
  <div><dt>CONTRACT</dt><dd data-contract>—</dd></div>
  <div><dt>WORKER HEARTBEAT</dt><dd data-worker>—</dd></div>
  <div><dt>MARKET DATA AGE</dt><dd data-latency>—</dd></div>
  <div><dt>KALSHI STREAM</dt><dd data-connection>—</dd></div>
  <div><dt>EXECUTION INTAKE</dt><dd data-intake>—</dd></div>
  <div><dt>DEMO LIFECYCLE</dt><dd data-demo>—</dd></div>
 </dl>
 <section class="kai-activity"><h2>Activity</h2><p>Champion shadow signals and server events. These are separate from confirmed fills.</p><ol data-activity aria-label="Recent KaiBot events"></ol></section>
 <div data-controls></div>`;
 document.body.append(panel);
 const field=name=>panel.querySelector('[data-'+name+']');
 const arena=panel.querySelector('.kai-arena');
 const update=(name,value)=>{field(name).textContent=value;};
 const readable=value=>value?String(value).replaceAll('_',' '):'Unavailable';
 let timer,pending,lastEvent;
 const liveStart=document.getElementById('primalLiveStart');
 const liveStop=document.getElementById('liveStop');
 const syncActions=()=>{
  field('start').disabled=!liveStart||liveStart.disabled;
  field('stop').disabled=!liveStop||liveStop.disabled;
  update('live-mode',field('start').disabled?'REAL MONEY · START UNAVAILABLE':'REAL MONEY · START AVAILABLE');
 };
 const actionObserver=new MutationObserver(syncActions);
 for(const button of [liveStart,liveStop])if(button)actionObserver.observe(button,{attributes:true,attributeFilter:['disabled']});
 field('start').addEventListener('click',()=>liveStart?.click());
 field('stop').addEventListener('click',()=>liveStop?.click());
 for(const id of ['liveStop','liveEmergency'])document.getElementById(id)?.addEventListener('click',()=>{
  arena.dataset.move='stop';
  update('decision','STOP REQUESTED');
 });
 const home=document.createComment('Auto Trade controls');
 controls.before(home);
 const read=async(path,signal)=>{
  const response=await fetch('/.netlify/functions/'+path,{cache:'no-store',signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  return response.json();
 };
 async function refresh(){
  if(!panel.open||document.hidden||pending)return;
  const controller=new AbortController();
  pending=controller;
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
   const [report,demo]=await Promise.allSettled([
    read('predator-report?mode=worker',controller.signal),read('kalshi-demo-status',controller.signal)
   ]);
   if(!panel.open||controller.signal.aborted)return;
   const worker=report.value?.worker,champion=worker?.fresh?worker.championShadow:null;
   const action=champion?.action||'AWAITING SIGNAL';
   update('decision',action);
   update('contract',champion?.ticker||worker?.latest?.ticker||'Unavailable');
   update('worker',worker?.fresh?'Fresh':worker?'Stale':'Unavailable');
   update('latency',worker?.fresh&&Number.isFinite(worker.latest?.kalshiEventAgeMs)?worker.latest.kalshiEventAgeMs+' ms':'Unavailable');
   update('connection',worker?.fresh&&worker.feeds?.kalshiAuthenticated?'Authenticated':worker?'Unverified':'Unavailable');
   update('intake',readable(report.value?.championIntake?.status));
   update('demo',readable(demo.value?.lifecycleTest?.status));
   arena.dataset.move=/^BUY UP/.test(action)?'buy-up':/^BUY DOWN/.test(action)?'buy-down':/^HOLD/.test(action)?'hold':/^TAKE PROFIT/.test(action)?'profit':/^SELL FAST/.test(action)?'fast':/^STOP/.test(action)?'stop':'idle';
   const event=[champion?.ticker,action,report.value?.championIntake?.status].join('|');
   if(event!==lastEvent){
    lastEvent=event;
    const row=document.createElement('li');
    row.textContent=new Date().toLocaleTimeString()+' · '+action+' · '+readable(report.value?.championIntake?.status);
    field('activity').prepend(row);
    while(field('activity').children.length>8)field('activity').lastElementChild.remove();
   }
  }finally{clearTimeout(timeout);if(pending===controller)pending=null;}
 }
 trigger.addEventListener('click',event=>{
  event.stopImmediatePropagation();
  if(panel.open)return;
  field('controls').append(controls);
  syncActions();
  panel.showModal();
  refresh();
  timer=setInterval(refresh,5000);
 },true);
 field('back').addEventListener('click',()=>panel.close());
 panel.addEventListener('close',()=>{
  clearInterval(timer);
  pending?.abort();
  pending=null;
  home.after(controls);
  trigger.focus({preventScroll:true});
 });
})();
