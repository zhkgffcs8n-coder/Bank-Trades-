import {getStore} from '@netlify/blobs';
export default async req=>{
 if(req.method!=='GET')return new Response(null,{status:405});
 const store=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 const result=await store.get('connection',{type:'json'});
 return Response.json({status:result?.status||'AWAITING_DEMO_CHECK',checkedAt:result?.checkedAt||null},{headers:{'Cache-Control':'no-store'}});
};
