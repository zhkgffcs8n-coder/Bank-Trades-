import test from 'node:test';
import assert from 'node:assert/strict';
import {scanBlobPage} from '../src/paged-blob-scan.mjs';

function fakeStore(initial){
 const values=new Map(initial.map(k=>[k,{key:k}]));
 const state=new Map();
 return {
  values,state,
  async get(key){return state.get(key)||null},
  async setJSON(key,value){state.set(key,value)},
  async *list({prefix,paginate}){
   assert.equal(paginate,true);
   const keys=[...values.keys()].filter(k=>k.startsWith(prefix)).sort();
   for(let i=0;i<keys.length;i+=2)yield {blobs:keys.slice(i,i+2).map(key=>({key}))};
  }
 };
}

test('resumable scan visits newer queued records even when old keys remain',async()=>{
 const store=fakeStore(['pending/a','pending/b','pending/c','pending/d','pending/e']);
 const seen=[];
 const opts={prefix:'pending/',cursorKey:'scan-cursors/pending',limit:2};
 for(let i=0;i<3;i++)await scanBlobPage(store,opts,async blob=>{seen.push(blob.key)});
 assert.deepEqual(seen,['pending/a','pending/b','pending/c','pending/d','pending/e']);
 assert.equal(store.state.get(opts.cursorKey).cursor,null);
 await scanBlobPage(store,opts,async blob=>{seen.push(blob.key)});
 assert.deepEqual(seen.slice(-2),['pending/a','pending/b']);
});

test('deleted keys do not prevent subsequent records being visited',async()=>{
 const store=fakeStore(['pending/a','pending/b','pending/c','pending/d']);
 const opts={prefix:'pending/',cursorKey:'scan-cursors/pending',limit:2};
 const seen=[];
 await scanBlobPage(store,opts,async blob=>{seen.push(blob.key);store.values.delete(blob.key)});
 await scanBlobPage(store,opts,async blob=>{seen.push(blob.key)});
 assert.deepEqual(seen,['pending/a','pending/b','pending/c','pending/d']);
});

test('failed processing does not advance cursor; retry can complete',async()=>{
 const store=fakeStore(['pending/a','pending/b','pending/c']);
 const opts={prefix:'pending/',cursorKey:'scan-cursors/pending',limit:2};
 await assert.rejects(scanBlobPage(store,opts,async()=>{throw Error('transient write failure')}),/transient/);
 assert.equal(store.state.has(opts.cursorKey),false);
 const seen=[];
 await scanBlobPage(store,opts,async blob=>{seen.push(blob.key)});
 assert.deepEqual(seen,['pending/a','pending/b']);
});

test('invalid saved cursor safely restarts the scan',async()=>{
 const store=fakeStore(['pending/a','pending/b']);
 const opts={prefix:'pending/',cursorKey:'scan-cursors/pending',limit:1};
 store.state.set(opts.cursorKey,{cursor:'expired'});
 const seen=[];
 await scanBlobPage(store,opts,async blob=>{seen.push(blob.key)});
 assert.deepEqual(seen,['pending/a']);
});

test('transient Blob listing failure preserves cursor and propagates error',async()=>{
 const store=fakeStore(['pending/a','pending/b','pending/c']);
 const opts={prefix:'pending/',cursorKey:'scan-cursors/pending',limit:1};
 store.state.set(opts.cursorKey,{version:2,cursor:'pending/b'});
 const original=store.list;
 let calls=0;
 store.list=async function*(args){calls++;if(calls===1)throw Error('HTTP 503 upstream unavailable');yield* original(args)};
 await assert.rejects(scanBlobPage(store,opts,async()=>{}),/503/);
 assert.equal(calls,1,'must not silently restart from the first page');
 assert.equal(store.state.get(opts.cursorKey).cursor,'pending/b');
 const seen=[];
 await scanBlobPage(store,opts,async blob=>seen.push(blob.key));
 assert.deepEqual(seen,['pending/c']);
});

test('unrelated invalid request error does not reset the cursor',async()=>{
 const store=fakeStore(['pending/a']);
 const opts={prefix:'pending/',cursorKey:'scan-cursors/pending',limit:1};
 store.state.set(opts.cursorKey,{cursor:'pending/a'});
 let calls=0;
 store.list=async function*(){calls++;throw Error('Invalid Blob store configuration')};
 await assert.rejects(scanBlobPage(store,opts,async()=>{}),/Invalid Blob store/);
 assert.equal(calls,1);
 assert.equal(store.state.get(opts.cursorKey).cursor,'pending/a');
});

test('large SDK-shaped archives never exceed the requested callback budget',async()=>{
 const store=fakeStore(Array.from({length:1005},(_,i)=>'pending/'+String(i).padStart(5,'0')));
 const opts={prefix:'pending/',cursorKey:'scan-cursors/pending',limit:4};
 let calls=0;for(let run=0;run<3;run++){const result=await scanBlobPage(store,opts,async()=>calls++);assert.equal(result.scanned,4);assert.equal(result.hasMore,true);}
 assert.equal(calls,12);assert.equal(store.state.get(opts.cursorKey).cursor,'pending/00011');
});
