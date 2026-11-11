(()=>{'use strict';
function arrange(){
 const grid=document.querySelector('.bt-command-grid.bt-command-stacked');
 const easy=document.getElementById('quickAssets')?.closest('.card');
 const desk=document.getElementById('signalDesk');
 const signals=document.getElementById('liveTerminal');
 if(!grid||!easy||!desk||!signals)return false;
 let bottom=grid.querySelector('#btLowerCommandRow');
 if(!bottom){bottom=document.createElement('div');bottom.id='btLowerCommandRow';bottom.className='bt-lower-command-row';grid.append(bottom)}
 for(const panel of [easy,signals,desk])if(panel.parentElement!==bottom)bottom.append(panel);
 grid.classList.add('bt-command-professional','bt-command-bottom-filled');
 return true;
}
if(!arrange()){
 const observer=new MutationObserver(()=>{if(arrange())observer.disconnect()});
 observer.observe(document.body,{subtree:true,childList:true});
 setTimeout(()=>observer.disconnect(),15000);
}
})();