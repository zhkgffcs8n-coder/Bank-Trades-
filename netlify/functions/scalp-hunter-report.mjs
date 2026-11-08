import {getStore} from '@netlify/blobs';
import {blobWindow} from '../../src/blob-window.mjs';

export default async req=>{
 if(req.method!=='GET')return new Response(null,{status:405});
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
 const ticker=new URL(req.url).searchParams.get('ticker');
 if(ticker!==null){
  if(!/^KX(?:BTC|ETH|SOL|XRP|DOGE|BNB|HYPE|ZEC)15M-[A-Z0-9-]{1,55}$/.test(ticker))
   return Response.json({error:'INVALID_TICKER'},{status:400});
  const [audit,open,closedVolt]=await Promise.all([
   db.get('scalp-hunter/entry-audit/v15/'+ticker,{type:'json'}),
   db.get('scalp-hunter/paper/open/'+ticker,{type:'json'}),
   db.get('scalp-hunter/paper/closed/'+ticker+'/B',{type:'json'})
  ]);
  const voltPosition=closedVolt??open?.B??audit?.engines?.B?.fill??null;
  return Response.json({ticker,audit,voltPosition,mode:'PAPER_ONLY'},{headers:{'cache-control':'no-store'}});
 }
 const [predictions,outcomes,paper,open,experimental,experimentalOutcomes,diagnostics]=await Promise.all([
  blobWindow(db,{prefix:'scalp-hunter/predictions/',limit:60}),
  blobWindow(db,{prefix:'scalp-hunter/outcomes/',limit:60}),
  blobWindow(db,{prefix:'scalp-hunter/paper/closed/',limit:60}),
  blobWindow(db,{prefix:'scalp-hunter/paper/open/',limit:60}),
  blobWindow(db,{prefix:'scalp-hunter/experimental/predictions/',limit:60}),
  blobWindow(db,{prefix:'scalp-hunter/experimental/outcomes/',limit:60}),
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
 const paperEngines=Object.fromEntries(['A','B','C'].map(name=>[name,{open:0,closed:0,wins:0,losses:0,net:0,modeledFees:0,totalEntry:0,totalDurationMs:0,drawdown:0}]));
 const completed=[];
 for(let i=0;i<paper.blobs.length;i+=10){
  const rows=await Promise.all(paper.blobs.slice(i,i+10).map(blob=>db.get(blob.key,{type:'json'})));
  completed.push(...rows.filter(Boolean));
 }
 const peaks={A:0,B:0,C:0};
 for(const row of completed.sort((a,b)=>a.closedAt-b.closedAt||a.ticker.localeCompare(b.ticker))){
   const engine=paperEngines[row.name];
   engine.closed++;engine.net+=row.net;engine.totalEntry+=row.ask;
   engine.modeledFees+=(row.entryCost??0)+(row.exitCost??0);
   engine.wins+=Number(row.net>0);engine.losses+=Number(row.net<0);
   engine.totalDurationMs+=row.closedAt-row.at;
   peaks[row.name]=Math.max(peaks[row.name],engine.net);
   engine.drawdown=Math.max(engine.drawdown,peaks[row.name]-engine.net);
 }
 for(let i=0;i<open.blobs.length;i+=10){
  const rows=await Promise.all(open.blobs.slice(i,i+10).map(blob=>db.get(blob.key,{type:'json'})));
  for(const positions of rows.filter(Boolean)){
   for(const position of Object.values(positions)){
    if(!position.closedAt)paperEngines[position.name].open++;
   }
  }
 }
 for(const engine of Object.values(paperEngines)){
  engine.averageDurationMs=engine.closed?engine.totalDurationMs/engine.closed:null;
  engine.averageEntry=engine.closed?engine.totalEntry/engine.closed:null;
  engine.winRate=engine.closed?engine.wins/engine.closed:null;
  engine.netAfterOneCentReserve=engine.net-.01*engine.closed;
 }
 return Response.json({experimental:{predictionRecords:experimental.blobs.length,outcomeRecords:experimentalOutcomes.blobs.length,
  scope:experimental.cursor||experimentalOutcomes.cursor?'FIRST_PAGE_ONLY':'COMPLETE'},paper:{scope:paper.cursor||open.cursor?'FIRST_PAGE_ONLY':'COMPLETE',engines:paperEngines},
  diagnostics:Object.fromEntries(diagnostics),mode:'SHADOW_ONLY',scope:predictions.cursor||outcomes.cursor?'FIRST_PAGE_ONLY':'COMPLETE',engines},
  {headers:{'cache-control':'public, max-age=60'}});
};
