// Netlify Blobs v11 list() accepts paginate/prefix, NOT limit/cursor.
// Resume by immutable key while using the supported async page iterator.
export async function blobWindow(store,{prefix,after=null,limit=40}){
 const blobs=[];
 for await(const page of store.list({prefix,paginate:true})){
  for(const blob of page.blobs||[]){
   if(after&&blob.key<=after)continue;
   if(blobs.length===limit)return {blobs,cursor:blobs.at(-1).key};
   blobs.push(blob);
  }
 }
 return {blobs,cursor:null};
}
