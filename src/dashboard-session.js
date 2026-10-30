import {getUser} from '@netlify/identity';
let checking=false;
async function check(){
 if(checking||document.hidden)return;checking=true;
 try{
  const user=await getUser();
  if(!user||user.id!==window.__BANK_TRADES_USER_ID__){location.replace('/?membership=required');return;}
  const res=await fetch('/api/membership',{cache:'no-store'});
  if(res.status===401||res.status===403){location.replace('/?membership=required');return;}
  if(res.ok && !(await res.json()).access.active)location.replace('/?membership=required');
 }catch{/* A network failure cannot grant new access; protected APIs still fail closed. */}finally{checking=false;}
}
check();setInterval(check,60000);document.addEventListener('visibilitychange',check);
