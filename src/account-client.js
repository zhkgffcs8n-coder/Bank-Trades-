import {signup,login,getUser,logout,handleAuthCallback,requestPasswordRecovery,updateUser,acceptInvite} from '@netlify/identity';
const $=id=>document.getElementById(id);
let issuedCode='';
let inviteToken=null;
const message=(text,error=false)=>{$('message').textContent=text;$('message').classList.toggle('error',error);};
async function run(fn){
 const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{await fn();}catch(e){message(e.message||'Something went wrong. Please try again.',true);}finally{buttons.forEach(b=>b.disabled=false);}
}
async function api(body){const r=await fetch('/api/membership',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Membership unavailable.');return data;}
async function refresh(){
 const user=await getUser();$('signed-out').hidden=!!user;$('signed-in').hidden=!user;$('owner').hidden=true;$('enter').hidden=true;$('plans').replaceChildren();
 if(!user)return;
 $('account-email').textContent=user.email;
 const state=await api();$('owner').hidden=!state.owner;$('enter').hidden=!state.access.active;
 message(state.access.active?'Your access is active'+(state.access.expiresAt?' until '+new Date(state.access.expiresAt).toLocaleDateString():'')+'.':'Choose a membership or redeem a free access code.');
 for(const p of state.plans){
  const b=document.createElement('button');const amount=new Intl.NumberFormat(undefined,{style:'currency',currency:p.currency}).format(p.amount/100);
  b.textContent=`${p.name[0].toUpperCase()+p.name.slice(1)} · ${amount} / ${p.intervalCount>1?p.intervalCount+' ':''}${p.interval}`;
  b.onclick=()=>run(async()=>{const d=await api({action:'checkout',plan:p.name});location.assign(d.url);});
  if(!state.access.active)$('plans').append(b);
 }
 if(!state.plans.length&&!state.access.active)message('Paid signup is awaiting activation. You can redeem an owner-issued free access code.');
}
$('auth-form').onsubmit=e=>{e.preventDefault();run(async()=>{await login($('email').value,$('password').value);$('password').value='';await refresh();});};
$('signup').onclick=()=>run(async()=>{if(!$('auth-form').reportValidity())return;await signup($('email').value,$('password').value);$('password').value='';message('Check your email and confirm your account, then sign in.');});
$('recover').onclick=()=>run(async()=>{if(!$('email').reportValidity())return;await requestPasswordRecovery($('email').value);message('If that account exists, a password reset link is on its way.');});
$('logout').onclick=()=>run(async()=>{await logout();await refresh();message('You are signed out.');});
$('refresh').onclick=()=>run(refresh);
$('portal').onclick=()=>run(async()=>{const d=await api({action:'portal'});location.assign(d.url);});
$('redeem-form').onsubmit=e=>{e.preventDefault();run(async()=>{await api({action:'redeem',code:$('access-code').value});$('access-code').value='';await refresh();});};
$('issue-form').onsubmit=e=>{e.preventDefault();run(async()=>{const d=await api({action:'issue',email:$('member-email').value,days:Number($('days').value)});issuedCode=d.code;$('issued').textContent=`Code: ${d.code}\nFor: ${d.email}\nAccess ends: ${new Date(d.accessUntil).toLocaleString()}\nRevocation reference: ${d.codeHash}\nSave this code now. It cannot be retrieved later.`;$('copy-code').hidden=false;});};
$('copy-code').onclick=()=>run(async()=>{await navigator.clipboard.writeText(issuedCode);message('Access code copied.');});
$('revoke-form').onsubmit=e=>{e.preventDefault();run(async()=>{await api({action:'revoke',codeHash:$('code-hash').value.trim()});message('Code revoked. Access has ended for that code.');});};
$('reset-form').onsubmit=e=>{e.preventDefault();run(async()=>{if(inviteToken){await acceptInvite(inviteToken,$('new-password').value);inviteToken=null;}else await updateUser({password:$('new-password').value});$('new-password').value='';$('reset-form').hidden=true;await refresh();message('Password saved.');});};
run(async()=>{const callback=await handleAuthCallback();if(callback?.type==='recovery'||callback?.type==='invite'){inviteToken=callback.token||null;$('signed-out').hidden=true;$('reset-form').hidden=false;message('Choose your new password.');return;}await refresh();});
