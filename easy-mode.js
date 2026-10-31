(()=>{'use strict';
const $=id=>document.getElementById(id), assets=['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
let asset=localStorage.getItem('btEasyAsset')||'',side=localStorage.getItem('btEasySide')||'',active=localStorage.getItem('btEasyActive')==='1';
const status=m=>{const q=$('quickPosition');if(q)q.textContent=m};
function paint(){document.querySelectorAll('#quickAssets [data-quick-asset]').forEach(b=>{const on=b.dataset.quickAsset===asset;b.style.setProperty('background',on?'#8a7300':'transparent','important');b.style.setProperty('border',on?'4px solid #ffd400':'1px solid rgba(255,255,255,.35)','important');b.style.setProperty('color',on?'#fff7a8':'inherit','important')});['quickUp','quickDown'].forEach(id=>{const b=$(id);if(!b)return;const on=(id==='quickUp'?'up':'down')===side;b.style.setProperty('background',on?'#8a7300':'','important');b.style.setProperty('border',on?'4px solid #ffd400':'','important')});const l=$('quickSelected');if(l)l.innerHTML=asset?'<b style="color:#ffd400">✓ YOU PICKED '+asset+'</b>':'<b>👆 TAP YOUR COIN</b>'}
function choose(a){asset=a;active=false;localStorage.setItem('btEasyAsset',a);localStorage.removeItem('btEasyActive');paint();status('✓ '+a+' selected · Enter your entry %, then choose UP or DOWN.')}
function chooseSide(v){if(!asset){status('⚠️ Pick a coin first.');return}side=v;localStorage.setItem('btEasySide',v);paint();status('✓ '+asset+' '+v.toUpperCase()+' selected · Press START LIVE TRACKING.')}
function start(){const e=Number($('quickEntry')?.value);if(!asset)return status('⚠️ Pick a coin first.');if(!side)return status('⚠️ Pick UP or DOWN.');if(!Number.isFinite(e)||e<=0||e>=100)return status('⚠️ Enter your entry % from 1–99.');active=true;localStorage.setItem('btEasyActive','1');localStorage.setItem('btEasyEntry',String(e));status('🟢 LIVE TRACKING STARTED · '+asset+' '+side.toUpperCase()+' · Entry '+e.toFixed(1)+'%')}
function liveDecision(){
 if(!active||!asset||!side)return;
 const entry=Number(localStorage.getItem('btEasyEntry'));if(!Number.isFinite(entry))return;
 const rows=Array.from(document.querySelectorAll('#signalRows tr'));
 const row=rows.find(r=>(r.children[0]?.textContent||'').trim().toUpperCase()===asset);
 if(!row)return status('⚪ '+asset+' '+side.toUpperCase()+' · Waiting for live quote...');
 const up=parseFloat((row.children[1]?.textContent||'').replace(/[^0-9.]/g,'')),down=parseFloat((row.children[2]?.textContent||'').replace(/[^0-9.]/g,''));
 const quote=side==='up'?up:down,txt=(row.children[3]?.textContent||'').toUpperCase();
 const mins=parseFloat((row.children[4]?.textContent||'').replace(/[^0-9.]/g,''));
 if(!Number.isFinite(quote))return status('⚪ '+asset+' '+side.toUpperCase()+' · Waiting for executable quote...');
 const roi=(quote-entry)/entry,opposite=(side==='up'&&/BUY DOWN|DOWN SIGNAL/.test(txt))||(side==='down'&&/BUY UP|UP SIGNAL/.test(txt));
 let action='🟢 HOLD',reason='Position remains above the fast-exit threshold.';
 if(roi<=-.18||opposite&&roi<=-.08){action='🚨 SELL FAST';reason=opposite?'Signal reversed against your position and loss is accelerating.':'Position is 18%+ below your entry.'}
 else if(roi<=-.12){action='🔴 SELL / GET OUT';reason='Position is 12%+ below your entry.'}
 else if(roi<=-.05||opposite){action='🟡 WATCH CLOSELY';reason=opposite?'Live signal is leaning against your selected side.':'Position is 5%+ below your entry.'}
 else if(Number.isFinite(mins)&&mins<=2&&quote>=entry){action='🏁 HOLD TO END — WATCH';reason='About 2 minutes or less remain and your selected side is still above entry; late flips are possible.'}
 else if(roi>=.15){action='🟢 HOLD / PROTECT PROFIT';reason='Selected side is 15%+ above your entry.'}
 const q=$('quickPosition');if(q)q.innerHTML='<div style="font-size:27px;font-weight:900">'+action+'</div><div>'+asset+' '+side.toUpperCase()+' · Entry '+entry.toFixed(1)+'% · Current '+quote.toFixed(1)+'%'+(Number.isFinite(mins)?' · '+mins+'m left':'')+'</div><div style="margin-top:6px;font-size:14px">'+reason+'</div>';
}
function close(){active=false;side='';localStorage.removeItem('btEasyActive');localStorage.removeItem('btEasySide');paint();status('✅ Tracking stopped. Pick a coin for another position.')}
function bind(){const box=$('quickAssets');if(!box)return;box.querySelectorAll('[data-quick-asset]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();choose(b.dataset.quickAsset)}));$('quickUp')?.addEventListener('click',e=>{e.preventDefault();chooseSide('up')});$('quickDown')?.addEventListener('click',e=>{e.preventDefault();chooseSide('down')});$('quickStart')?.addEventListener('click',e=>{e.preventDefault();start()});$('quickClose')?.addEventListener('click',e=>{e.preventDefault();close()});paint();if(active)liveDecision();setInterval(liveDecision,1000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();