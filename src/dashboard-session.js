import {getUser} from '@netlify/identity';
let checking=false;
async function check(){
 if(checking||document.hidden)return;checking=true;
 try{
  // Let Identity refresh its cookie when possible. The server validates dashboard access.
  await getUser().catch(()=>null);
  const res=await fetch('/api/membership',{cache:'no-store'});
  if(res.status===401||res.status===403){location.replace('/?membership=required');return;}
  if(res.ok){
   const {access,userId}=await res.json();
   if(!access.active||(userId&&userId!==window.__BANK_TRADES_USER_ID__))location.replace('/?membership=required');
  }
 }catch{/* A network failure cannot grant new access; protected APIs still fail closed. */}finally{checking=false;}
}
check();setInterval(check,60000);document.addEventListener('visibilitychange',check);
