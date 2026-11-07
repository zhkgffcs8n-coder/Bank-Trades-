(()=>{'use strict';
if(!document.querySelector('#premiumRows'))return;
const crew=[['primal','OPTIMUS PRIMAL','AI COMMANDER','#a178ff'],['omega','OMEGA','MARKET INTEL','#38d9ff'],['kai','KAI BOT','PAPER EXECUTION','#42f7a2'],['flip','FLIP HUNTER','REVERSAL SCAN','#ffdb72'],['guard','MARKET GUARDIAN','RISK CONTROL','#ff5579']];
const svg=(color,index)=>`<svg viewBox="0 0 100 94" role="img" aria-label="Original arcade robot mascot" xmlns="http://www.w3.org/2000/svg"><path d="M50 4v11M43 4h14" stroke="${color}" stroke-width="5" stroke-linecap="round"/><path d="M19 30L7 40v18l12 6M81 30l12 10v18l-12 6" fill="#263960" stroke="${color}" stroke-width="4"/><path d="M21 18Q50 6 79 18L88 57Q81 81 50 86Q19 81 12 57Z" fill="#172546" stroke="${color}" stroke-width="4"/><path d="M26 39Q50 28 74 39L69 60Q50 68 31 60Z" fill="#060e22" stroke="#526aaf" stroke-width="2"/><path class="bt-eyes" d="${index===3?'M30 43l14 5-12 4ZM70 43l-14 5 12 4Z':'M30 43h15v9H30zM55 43h15v9H55z'}"/><path d="M40 70h20" stroke="${color}" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="22" r="4" fill="${color}"/></svg>`;
const root=document.createElement('section');root.id='btArcadeCrew';root.setAttribute('aria-label','AI engine activity');
root.innerHTML=crew.map(([id,name,role,color],i)=>`<div class="bt-bot" data-bot="${id}" data-mode="idle">${svg(color,i)}<strong>${name}</strong><small>${role}</small></div>`).join('');
const target=document.querySelector('.terminal-heading')||document.querySelector('main header')||document.querySelector('header');
if(!target)return;
const arena=document.createElement('section');arena.id='btBattleArena';arena.setAttribute('aria-label','Market risk battle arena');arena.innerHTML='<div class="bt-arena-top"><strong>⚔️ AI MARKET BATTLE ARENA</strong><span id="btArenaStatus" role="status">Scanning live signal table · no verified trades implied</span></div><div class="bt-arena-field"><span class="bt-arena-hero" aria-hidden="true">🛡️</span><span class="bt-arena-beam" aria-hidden="true"></span><span class="bt-arena-foe" aria-hidden="true">👾</span></div><div id="btArenaNarrative">The crew is on patrol. Signal changes trigger team battle replays. Replays visualize roles only.</div>';
const field=arena.querySelector('.bt-arena-field');
field.style.cssText='height:auto;min-height:126px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:12px';
root.style.margin='0';
field.replaceChildren(root);
const foe=document.createElement('span');
foe.className='bt-arena-foe';
foe.setAttribute('aria-hidden','true');
foe.textContent='👾';
field.append(foe);
const destination=document.querySelector('#premiumChart')?.closest('.premium-grid');
(destination||target).insertAdjacentElement('afterend',arena);
const controls=document.createElement('div');controls.id='btArcadeControls';controls.innerHTML='<button type="button" id="btArcadeMotion" aria-pressed="true">✨ MOTION ON</button>';
arena.insertAdjacentElement('beforebegin',controls);
let motion=true;try{motion=localStorage.getItem('banktrades:arcade-motion')!=='false'}catch{}
const paint=()=>{document.body.classList.toggle('bt-arcade-muted',!motion);const b=document.querySelector('#btArcadeMotion');b.textContent=motion?'✨ MOTION ON':'⏸ MOTION OFF';b.setAttribute('aria-pressed',String(motion))};paint();
document.querySelector('#btArcadeMotion').addEventListener('click',()=>{motion=!motion;try{localStorage.setItem('banktrades:arcade-motion',String(motion))}catch{}paint()});
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const battleAnimations=new Set();
function stopBattle(){
  for(const animation of battleAnimations)animation.cancel();
  battleAnimations.clear();
}
function animate(node,frames,options){
  if(!motion||reducedMotion.matches||!node?.animate)return;
  const animation=node.animate(frames,options);
  battleAnimations.add(animation);
  animation.onfinish=animation.oncancel=()=>battleAnimations.delete(animation);
}
function battle(action){
  stopBattle();
  const team=action==='ENTRY'?['omega','primal','guard','kai']
    :action==='FLIP'?['flip','omega','primal','guard']
    :action==='PAPER'?['guard','kai']:['omega','guard','primal'];
  team.forEach((id,index)=>{
    const node=root.querySelector('[data-bot="'+id+'"] svg');
    animate(node,[{transform:'none'},{transform:'translate(12px,-10px) scale(1.16)',filter:'brightness(1.8)'},{transform:'none'}],
      {duration:560,delay:index*240,easing:'ease-in-out'});
  });
  animate(foe,[{transform:'none'},{transform:'translateX(9px) rotate(17deg)',filter:'brightness(1.9)'},{transform:'none'}],
    {duration:440,delay:team.length*240,easing:'ease-out'});
}
reducedMotion.addEventListener('change',stopBattle);
document.querySelector('#btArcadeMotion').addEventListener('click',stopBattle);
const plays={
  ENTRY:'OMEGA scouts → Primal calls → Guardian checks risk → Kai lines up a paper setup.',
  FLIP:'Flip Hunter spots the reversal → OMEGA and Primal reassess → Guardian covers.',
  EXIT:'OMEGA relays the exit signal → Guardian shields → Primal stands down.',
  RISK:'OMEGA spots risk → Guardian blocks → Primal stands down.'
};
let prior=new Map();let priorPaperStatus='';const activate=(id,mode)=>{const node=root.querySelector('[data-bot="'+id+'"]');if(!node)return;node.dataset.mode=mode;clearTimeout(node._reset);node._reset=setTimeout(()=>{node.dataset.mode='idle'},1700)};
function scan(){if(document.hidden)return;
 for(const tr of document.querySelectorAll('#premiumRows tr')){const asset=tr.dataset.asset||tr.dataset.fallbackAsset||'',label=tr.children[3]?.textContent||'';if(!asset)continue;
 const action=/SELL FAST|CASH OUT|TAKE PROFITS/.test(label)?'EXIT':/POSSIBLE FLIP|FLIP WATCH|FLIP UP|FLIP DOWN/.test(label)?'FLIP':/BUY (UP|DOWN).*QUALIFIED PAPER SIGNAL|QUALIFIED PAPER SIGNAL.*BUY (UP|DOWN)/.test(label)||/QUALIFIED ENTRY · BUY (UP|DOWN)/.test(label)?'ENTRY':/STAY OUT/.test(label)?'RISK':'';
 if(!prior.has(asset)){prior.set(asset,action);continue}if(!action||prior.get(asset)===action){prior.set(asset,action);continue}prior.set(asset,action);
 const status=document.querySelector('#btArenaStatus');const narrative=document.querySelector('#btArenaNarrative');if(status)status.textContent=asset+' · '+action+' signal transition';if(narrative)narrative.textContent=asset+' · '+(action==='ENTRY'?'Qualified signal observed — not an executed order':action==='EXIT'?'Exit recommendation observed — fill not verified':action==='FLIP'?'Reversal alert observed — flip not executed':'Risk warning observed — no trade implied');arena.dataset.mode=action.toLowerCase();if(narrative)narrative.textContent+=' · Arena replay: '+plays[action];battle(action);
 if(action==='ENTRY'){activate('primal','entry');activate('omega','entry')}
 else if(action==='EXIT'||action==='RISK')activate('guard','danger');
 else if(action==='FLIP')activate('flip','flip');
 }
 const paper=document.querySelector('#paperBotStatus,#kaibotStatus');if(paper){const state=paper.textContent||'';const running=/RUNNING|ACTIVE/i.test(state)&&!/STOPPED|NOT ACTIVE/i.test(state);if(priorPaperStatus&&state!==priorPaperStatus&&running){
   activate('kai','entry');battle('PAPER');
   arena.querySelector('#btArenaStatus').textContent='KAI BOT · Paper status changed';
   arena.querySelector('#btArenaNarrative').textContent='Arena replay: Guardian covers while Kai advances. Paper activity reported · fill not verified.';
 }priorPaperStatus=state;}
}
function patrol(){
  if(document.hidden||battleAnimations.size)return;
  root.querySelectorAll('.bt-bot svg').forEach((node,index)=>{
    animate(node,[{transform:'none'},{transform:'translateY(-5px)'},{transform:'none'}],
      {duration:720,delay:index*140,easing:'ease-in-out'});
  });
}
scan();patrol();setInterval(scan,2500);setInterval(patrol,5000);
})();