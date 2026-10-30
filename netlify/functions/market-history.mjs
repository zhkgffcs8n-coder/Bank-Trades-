import {getStore} from '@netlify/blobs';
const ASSETS=new Set(['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC']);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async req=>{
 if(req.method!=='GET')return json({error:'GET only'},405);
 const u=new URL(req.url),asset=String(u.searchParams.get('asset')||'').toUpperCase();
 if(!ASSETS.has(asset))return json({error:'Invalid asset'},400);
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'}),listed=await db.list({prefix:'samples/'+asset+'/',limit:240});
 const cutoff=Date.now()-4*60*60*1000,records=(await Promise.all(listed.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(x=>x&&x.t>=cutoff).sort((a,b)=>a.t-b.t);
 return json({asset,fetched_at:new Date().toISOString(),records,hasMore:!!listed.cursor,source:'BANK TRADES scheduled Kalshi public quote archive'});
};