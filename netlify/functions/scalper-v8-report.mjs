import {walkForwardScalperCalibration} from '../../src/scalper-v8-calibration.mjs';
import {summarizeExitReplay} from '../../src/scalper-v8-exits.mjs';
import {getStore} from '@netlify/blobs';
import {blobWindow} from '../../src/blob-window.mjs';
import {summarizeScalperV8} from '../../src/scalper-v8.mjs';

export default async req=>{
 if(req.method!=='GET')return new Response(null,{status:405});
 const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
 const page=await blobWindow(db,{prefix:'scalper-v8/resolved/',limit:100});
 const rows=[];
 for(let offset=0;offset<page.blobs.length;offset+=10){
  const batch=await Promise.all(page.blobs.slice(offset,offset+10).map(blob=>db.get(blob.key,{type:'json'})));
  rows.push(...batch.filter(Boolean));
 }
 return Response.json({mode:'SETTLEMENT_SHADOW',scope:page.cursor?'FIRST_PAGE_ONLY':'COMPLETE',
  hypothetical:true,ordersAuthorized:false,engines:summarizeScalperV8(rows),exitReplay:summarizeExitReplay(rows),
  calibration:walkForwardScalperCalibration(rows),promoted:false},
  {headers:{'cache-control':'public, max-age=60'}});
};
