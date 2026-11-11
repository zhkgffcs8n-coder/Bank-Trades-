(()=>{'use strict';
function arrange(){
 const grid=document.querySelector('.bt-command-grid.bt-command-stacked');
 const left=grid?.querySelector('.bt-command-left');
 const right=grid?.querySelector('.bt-command-right');
 const easy=document.getElementById('quickAssets')?.closest('.card');
 const desk=document.getElementById('signalDesk');
 if(!left||!right||!easy||!desk)return false;
 if(easy.parentElement!==left)left.append(easy);
 if(desk.parentElement!==right)right.append(desk);
 grid.classList.add('bt-command-professional');
 return true;
}
if(!arrange()){
 const observer=new MutationObserver(()=>{if(arrange())observer.disconnect()});
 observer.observe(document.body,{subtree:true,childList:true});
 setTimeout(()=>observer.disconnect(),15000);
}
})();