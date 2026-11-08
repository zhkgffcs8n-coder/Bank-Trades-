import {getStore} from '@netlify/blobs';
import {blobWindow} from '../../src/blob-window.mjs';

export default async req=>{
 if(req.method!=='GET')return new Response(null,{status:405});
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
 if(new URL(req.url).searchParams.get('mode')==='worker'){
  const worker=await db.get('predator-v13/health',{type:'json'});
  return Response.json({worker:worker?{...worker,fresh:Date.now()-worker.at>=0&&Date.now()-worker.at<=45000}:null},
   {headers:{'cache-control':'no-store'}});
 }
 const [samples,results,latest,stream,streamSamples,streamResults,worker]=await Promise.all([
  blobWindow(db,{prefix:'predator-v11/samples/',limit:60}),
  blobWindow(db,{prefix:'predator-v11/results/',limit:60}),
  db.get('predator-v11/latest',{type:'json'}),
  db.get('predator-v12/health',{type:'json'}),
  blobWindow(db,{prefix:'predator-v12/samples/',limit:60}),
  blobWindow(db,{prefix:'predator-v12/results/',limit:60}),
  db.get('predator-v13/health',{type:'json'})
 ]);
 const horizons={};
 let skippedProfitable=0;
 for(let i=0;i<results.blobs.length;i+=10){
  const rows=await Promise.all(results.blobs.slice(i,i+10).map(blob=>db.get(blob.key,{type:'json'})));
  for(const row of rows.filter(Boolean)){
   const group=horizons[row.horizon]??={evaluated:0,early:{trades:0,wins:0,losses:0,net:0},
    momentum:{trades:0,wins:0,losses:0,net:0}};
   group.evaluated++;
   skippedProfitable+=Number(row.earlySkippedProfitable);
   for(const name of ['early','momentum']){
    const signal=row[name];
    if(!signal)continue;
    group[name].trades++;group[name].wins+=Number(signal.net>0);
    group[name].losses+=Number(signal.net<0);group[name].net+=signal.net;
   }
  }
 }
 return Response.json({mode:'SAMPLED_SHADOW',ordersAuthorized:false,latest,sampleRecords:samples.blobs.length,
  scoredRecords:results.blobs.length,scope:samples.cursor||results.cursor?'FIRST_PAGE_ONLY':'COMPLETE',
  skippedProfitable,horizons,worker:worker?{...worker,fresh:Date.now()-worker.at>=0&&Date.now()-worker.at<=45000}:null,
  streaming:{...stream,sampleRecords:streamSamples.blobs.length,scoredRecords:streamResults.blobs.length,
   scope:streamSamples.cursor||streamResults.cursor?'FIRST_PAGE_ONLY':'COMPLETE'}},{headers:{'cache-control':'public, max-age=30'}});
};
