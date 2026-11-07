(()=>{'use strict';
if(!document.querySelector('#premiumRows'))return;
const crew=[['primal','OPTIMUS PRIMAL','AI COMMANDER','#a178ff'],['omega','OMEGA','MARKET INTEL','#38d9ff'],['kai','KAI BOT','PAPER EXECUTION','#42f7a2'],['flip','FLIP HUNTER','REVERSAL SCAN','#ffdb72'],['guard','MARKET GUARDIAN','RISK CONTROL','#ff5579']];
const svg=(color,index)=>`<svg viewBox="0 0 100 94" role="img" aria-label="Original arcade robot mascot" xmlns="http://www.w3.org/2000/svg"><path d="M50 4v11M43 4h14" stroke="${color}" stroke-width="5" stroke-linecap="round"/><path d="M19 30L7 40v18l12 6M81 30l12 10v18l-12 6" fill="#263960" stroke="${color}" stroke-width="4"/><path d="M21 18Q50 6 79 18L88 57Q81 81 50 86Q19 81 12 57Z" fill="#172546" stroke="${color}" stroke-width="4"/><path d="M26 39Q50 28 74 39L69 60Q50 68 31 60Z" fill="#060e22" stroke="#526aaf" stroke-width="2"/><path class="bt-eyes" d="${index===3?'M30 43l14 5-12 4ZM70 43l-14 5 12 4Z':'M30 43h15v9H30zM55 43h15v9H55z'}"/><path d="M40 70h20" stroke="${color}" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="22" r="4" fill="${color}"/></svg>`;
const root=document.createElement('section');root.id='btArcadeCrew';root.setAttribute('aria-label','AI engine activity');
root.innerHTML=crew.map(([id,name,role,color],i)=>`<div class="bt-bot" data-bot="${id}" data-mode="idle">${svg(color,i)}<strong>${name}</strong><small>${role}</small></div>`).join('');
const target=document.querySelector('.terminal-heading')||document.querySelector('main header')||document.querySelector('header');
if(!target)return;target.insertAdjacentElement('afterend',root);
const controls=document.createElement('div');controls.id='btArcadeControls';controls.innerHTML='<button type="button" id="btArcadeMotion" aria-pressed="true">✨ MOTION ON</button>';
root.insertAdjacentElement('beforebegin',controls);
let motion=true;try{motion=localStorage.getItem('banktrades:arcade-motion')!=='false'}catch{}
const paint=()=>{document.body.classList.toggle('bt-arcade-muted',!motion);const b=document.querySelector('#btArcadeMotion');b.textContent=motion?'✨ MOTION ON':'⏸ MOTION OFF';b.setAttribute('aria-pressed',String(motion))};paint();
document.querySelector('#btArcadeMotion').addEventListener('click',()=>{motion=!motion;try{localStorage.setItem('banktrades:arcade-motion',String(motion))}catch{}paint()});
let prior=new Map();const activate=(id,mode)=>{const node=root.querySelector('[data-bot="'+id+'"]');if(!node)return;node.dataset.mode=mode;clearTimeout(node._reset);node._reset=setTimeout(()=>{node.dataset.mode='idle'},1700)};
function scan(){if(document.hidden)return;
 for(const tr of document.querySelectorAll('#premiumRows tr')){const asset=tr.dataset.asset||'',label=tr.children[3]?.textContent||'';if(!asset)continue;
 const action=/SELL FAST|CASH OUT|TAKE PROFITS/.test(label)?'EXIT':/POSSIBLE FLIP|FLIP WATCH|FLIP UP|FLIP DOWN/.test(label)?'FLIP':/QUALIFIED PAPER SIGNAL: BUY UP|QUALIFIED PAPER SIGNAL: BUY DOWN/.test(label)?'ENTRY':/STAY OUT/.test(label)?'RISK':'';
 if(!action||prior.get(asset)===action)continue;prior.set(asset,action);
 if(action==='ENTRY'){activate('primal','entry');activate('omega','entry')}
 else if(action==='EXIT'||action==='RISK')activate('guard','danger');
 else if(action==='FLIP')activate('flip','flip');
 }
 const paper=document.querySelector('#paperBotStatus,#kaibotStatus');if(paper&&/RUNNING|ACTIVE/i.test(paper.textContent||'')&&!/STOPPED|NOT ACTIVE/i.test(paper.textContent||''))activate('kai','entry');
}
scan();setInterval(scan,2500);
})();