import {blobWindow} from './blob-window.mjs';
export async function scanBlobPage(store,{prefix,cursorKey,limit=250},visit){
 if(typeof prefix!=='string'||!prefix||typeof cursorKey!=='string'||!cursorKey||!Number.isInteger(limit)||limit<1||limit>1000||typeof visit!=='function')throw Error('Invalid paged scan');
 const saved=await store.get(cursorKey,{type:'json'});
 let cursor=typeof saved?.cursor==='string'&&saved.cursor?saved.cursor:null;
 const page=await blobWindow(store,{prefix,after:saved?.version===2?cursor:null,limit});
 for(const blob of page.blobs||[])await visit(blob);
 await store.setJSON(cursorKey,{version:2,cursor:page.cursor||null,at:Date.now()});
 return {scanned:(page.blobs||[]).length,hasMore:Boolean(page.cursor),wrapped:!page.cursor};
}
