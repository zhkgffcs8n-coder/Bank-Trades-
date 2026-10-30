import {getStore} from '@netlify/blobs';
import {member,json,errorResponse,fail} from './lib/access.mjs';

const db=()=>getStore({name:'bank-trades-paper-history',consistency:'strong'});
const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{12,100}$/.test(v);
function requireSameOrigin(req){
 const origin=req.headers.get('origin');
 if(!origin)return;
 let expected;try{expected=new URL(req.url).origin}catch{fail(400,'Invalid request URL')}
 if(origin!==expected)fail(403,'Cross-site request blocked');
}
export default async function(req){
 try{
  if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed');
  const user=await member();
  const store=db(),prefix='users/'+user.id+'/';
  if(req.method==='GET'){
   const listed=await store.list({prefix,limit:1000});
   const records=await Promise.all(listed.blobs.map(async b=>store.get(b.key,{type:'json'})));
   return json({records:records.filter(Boolean).sort((a,b)=>a.receivedAt-b.receivedAt),hasMore:!!listed.cursor});
  }
  requireSameOrigin(req);
  const raw=await req.text();if(raw.length>6000)fail(413,'Record too large');
  let t;try{t=JSON.parse(raw)}catch{fail(400,'Invalid JSON')}
  if(!safeId(t?.id)||typeof t.ticker!=='string'||! /^[A-Za-z0-9_-]{1,120}$/.test(t.ticker)||!['up','down'].includes(t.side))fail(400,'Invalid paper trade');
  const nums=['qty','ask','cost','at'];
  if(!nums.every(k=>Number.isFinite(t[k])))fail(400,'Invalid numeric fields');
  if(t.qty<1||t.qty>10000||t.ask<=0||t.ask>=100||t.cost<=0||t.cost>1000||Math.abs(t.cost-t.qty*t.ask/100)>.03||t.at>Date.now()+60000||t.at<Date.now()-7*86400000)fail(400,'Invalid trade values');
  const key=prefix+t.id;
  const existing=await store.get(key,{type:'json'});
  if(existing)return json({saved:true,id:t.id,existing:true});
  const record={id:t.id,ticker:t.ticker,asset:String(t.asset||'').slice(0,16),side:t.side,qty:t.qty,ask:t.ask,cost:t.cost,at:t.at,source:'KAIBOT PAPER',receivedAt:Date.now(),status:'UNVERIFIED',note:'Client-submitted simulation; not a verified fill or settlement'};
  await store.setJSON(key,record,{onlyIfNew:true});
  return json({saved:true,id:t.id},201);
 }catch(e){return errorResponse(e)}
}
