// Only a known-invalid pagination cursor warrants restarting from page one.
// Transient storage failures must preserve the saved cursor for the next retry.
function isExpiredCursorError(error){
 const code=String(error?.code||'');
 const message=String(error?.message||'');
 return /^(INVALID_CURSOR|CURSOR_EXPIRED)$/i.test(code)||
  /\b(?:invalid|expired|unknown|malformed|unrecognized)\s+(?:pagination\s+)?cursor\b|\bcursor\s+(?:is\s+)?(?:invalid|expired|unknown|malformed|unrecognized)\b/i.test(message);
}
// Bounded, resumable traversal of an append-only or partially-deleted Blob prefix.
// Unlike listing the first page every minute, the cursor eventually reaches newer keys.
// Callbacks must be idempotent: a failed callback leaves the cursor unchanged for retry.
export async function scanBlobPage(store,{prefix,cursorKey,limit=250},visit){
 if(typeof prefix!=='string'||!prefix||typeof cursorKey!=='string'||!cursorKey||!Number.isInteger(limit)||limit<1||limit>1000||typeof visit!=='function')throw Error('Invalid paged scan');
 const saved=await store.get(cursorKey,{type:'json'});
 let cursor=typeof saved?.cursor==='string'&&saved.cursor?saved.cursor:null;
 let page;
 try{
  page=await store.list({prefix,limit,...(cursor?{cursor}:{})});
 }catch(e){
  // Restart only for an explicitly invalid/expired cursor, never for a transient Blob outage.
  if(!cursor||!isExpiredCursorError(e))throw e;
  cursor=null;
  page=await store.list({prefix,limit});
 }
 for(const blob of page.blobs||[])await visit(blob);
 await store.setJSON(cursorKey,{cursor:page.cursor||null,at:Date.now()});
 return {scanned:(page.blobs||[]).length,hasMore:Boolean(page.cursor),wrapped:!page.cursor};
}
