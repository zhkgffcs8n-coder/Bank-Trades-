import {verifyRequestOrigin} from '@netlify/identity';
import {member,errorResponse,fail} from './access.mjs';
export const guarded = (handler,write=false) => async req=>{
 try{
  if(!['GET',...(write?['POST']:[])].includes(req.method))fail(405,'Method not allowed.');
  if(req.method==='POST')verifyRequestOrigin(req);
  await member();
  const result=await handler({httpMethod:req.method,queryStringParameters:Object.fromEntries(new URL(req.url).searchParams),headers:Object.fromEntries(req.headers),body:req.method==='POST'?await req.text():null,isBase64Encoded:false});
  const headers=new Headers(result.headers);headers.delete('Access-Control-Allow-Origin');headers.set('Cache-Control','private, no-store');
  return new Response(result.body,{status:result.statusCode,headers});
 }catch(e){return errorResponse(e);}
};
