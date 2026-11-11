(()=>{'use strict';
function arrange(){
 const grid=document.querySelector('.bt-command-grid.bt-command-stacked');
 const middle=grid?.querySelector('.bt-command-middle');
 const left=grid?.querySelector('.bt-command-left');
 const right=grid?.querySelector('.bt-command-right');
 const signals=document.getElementById('liveTerminal');
 const easy=document.getElementById('quickAssets')?.closest('.card');
 const desk=document.getElementById('signalDesk');
 if(!grid||!middle||!left||!right||!signals||!easy||!desk)return false;
 // Restore Live Market Signals immediately below Lock & Flip Radar.
 if(signals.parentElement!==middle)middle.append(signals);
 if(easy.parentElement!==left)left.append(easy);
 if(desk.parentElement!==right)right.append(desk);
 const lower=grid.querySelector('#btLowerCommandRow');if(lower)lower.remove();
 grid.classList.remove('bt-command-bottom-filled');
 grid.classList.add('bt-command-professional','bt-command-radar-signals');
 return true;
}
if(!arrange()){
 const observer=new MutationObserver(()=>{if(arrange())observer.disconnect()});
 observer.observe(document.body,{childList:true,subtree:true});
 setTimeout(()=>observer.disconnect(),15000);
}
})();