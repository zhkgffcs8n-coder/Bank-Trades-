// OMEGA dashboard research indicator: never invents provider connections or wins.
const el=document.getElementById('omegaUltraReadout');
if(el){
 const moduleStatus='Shared research scoring available · External AI providers: 0 connected · Auto orders: disabled';
 el.textContent=moduleStatus;
 el.title='OMEGA source modules are research-only. This indicator does not assert an active provider connection or continuously running model.';
}
