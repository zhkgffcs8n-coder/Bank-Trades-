import {readFile} from 'node:fs/promises';
import {member,errorResponse} from './lib/access.mjs';
export default async(req)=>{
 try{
  if(!['GET','HEAD'].includes(req.method))return new Response(null,{status:405});
  const user=await member();
  const html=await readFile(process.cwd()+'/private/dashboard.html','utf8');
  const page=html.replace('<head>','<head><script>window.__BANK_TRADES_USER_ID__='+JSON.stringify(user.id).replace(/</g,'\\u003c')+';</script>');
  return new Response(req.method==='HEAD'?null:page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){
  if(e.status===401||e.status===403)return Response.redirect(new URL('/?membership=required',req.url),303);
  return errorResponse(e);
 }
};
