(()=>{'use strict';
function arrange(){
 const grid=document.querySelector('.bt-command-grid.bt-command-stacked');
 const middle=grid?.querySelector('.bt-command-middle');
 const signals=document.getElementById('liveTerminal');
 const radar=document.getElementById('btcLockDesk');
 if(!grid||!middle||!signals||!radar)return false;
 // Restore original signal location directly beneath Lock & Flip Radar.
 if(signals.parentElement!==middle)radar.after(signals);
 const lower=document.getElementById('btLowerCommandRow');
 if(lower){const easy=document.getElementById('quickAssets')?.closest('.card');const desk=document.getElementById('signalDesk');if(easy&&easy.parentElement===lower)grid.querySelector('.bt-command-left')?.append(easy);if(desk&&desk.parentElement===lower)grid.querySelector('.bt-command-right')?.append(desk);lower.remove()}
 grid.classList.remove('bt-command-bottom-filled');
 grid.classList.add('bt-command-professional','bt-compact-live-signals');
 return true;
}
if(!arrange()){
 const observer=new MutationObserver(()=>{if(arrange())observer.disconnect()});
 observer.observe(document.body,{subtree:true,childList:true});
 setTimeout(()=>observer.disconnect(),15000);
}
})();