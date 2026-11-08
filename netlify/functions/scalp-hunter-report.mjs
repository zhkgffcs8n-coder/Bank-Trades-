import {getStore} from '@netlify/blobs';
import {blobWindow} from '../../src/blob-window.mjs';

export default async req=>{
 if(req.method!=='GET')return new Response(null,{status:405});
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
 const [predictions,outcomes,paper,diagnostics]=await Promise.all([
  blobWindow(db,{prefix:'scalp-hunter/predictions/',limit:60}),
  blobWindow(db,{prefix:'scalp-hunter/outcomes/',limit:60}),
  blobWindow(db,{prefix:'scalp-hunter/paper/closed/',limit:60}),
  Promise.all(['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'].map(async asset=>
   [asset,await db.get('scalp-hunter/diagnostics/'+asset,{type:'json'})]))

 ]);
 const engines=Object.fromEntries(['A','B','C'].map(name=>[name,{watches:0,modeledExits:0,wins:0,losses:0,
  insufficientDepth:0,net:0}]));
 for(const [page,isPrediction] of [[predictions,true],[outcomes,false]]){
  for(let i=0;i<page.blobs.length;i+=10){
   const rows=await Promise.all(page.blobs.slice(i,i+10).map(blob=>db.get(blob.key,{type:'json'})));
   for(const row of rows.filter(Boolean)){
    if(isPrediction){
     for(const [name,idea] of Object.entries(row.ideas))if(idea)engines[name].watches++;
    }else{
     const engine=engines[row.name];
     if(row.status==='INSUFFICIENT_EXIT_DEPTH')engine.insufficientDepth++;
     if(row.status!=='MODELED_EXIT')continue;
     engine.modeledExits++;engine.net+=row.net;
     engine.wins+=Number(row.net>0);engine.losses+=Number(row.net<0);
    }
   }
  }
 }
 for(const engine of Object.values(engines))engine.averageNet=engine.modeledExits?engine.net/engine.modeledExits:null;
 const paperEngines=Object.fromEntries(['A','B','C'].map(name=>[name,{closed:0,wins:0,losses:0,net:0,totalDurationMs:0}]));
 for(let i=0;i<paper.blobs.length;i+=10){
  const rows=await Promise.all(paper.blobs.slice(i,i+10).map(blob=>db.get(blob.key,{type:'json'})));
  for(const row of rows.filter(Boolean)){
   const engine=paperEngines[row.name];
   engine.closed++;engine.net+=row.net;
   engine.wins+=Number(row.net>0);engine.losses+=Number(row.net<0);
   engine.totalDurationMs+=row.closedAt-row.at;
  }
 }
 for(const engine of Object.values(paperEngines))
  engine.averageDurationMs=engine.closed?engine.totalDurationMs/engine.closed:null;
 return Response.json({paper:{scope:paper.cursor?'FIRST_PAGE_ONLY':'COMPLETE',engines:paperEngines},
  diagnostics:Object.fromEntries(diagnostics),mode:'SHADOW_ONLY',scope:predictions.cursor||outcomes.cursor?'FIRST_PAGE_ONLY':'COMPLETE',engines},
  {headers:{'cache-control':'public, max-age=60'}});
};
