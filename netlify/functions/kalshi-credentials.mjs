// Owner-only credential management. No live order execution.
import {getStore} from '@netlify/blobs';
import {createPrivateKey} from 'node:crypto';
import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {sealKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
const db=()=>getStore({name:'bank-trades-kalshi-credentials',consistency:'strong'});
const storageKey=user=>'credentials/'+user.id;
export default async req=>{try{
 const user=await owner();
 if(req.method==='GET'){
  const record=await db().get(storageKey(user),{type:'json'});
  return json({connected:false,credentialsStored:!!record,liveOrdersEnabled:false,updatedAt:record?.updatedAt||null});
 }
 if(req.method!=='POST'&&req.method!=='DELETE')fail(405,'Unsupported method');
 if(req.headers.get('origin')!==new URL(req.url).origin)fail(403,'Origin mismatch');
 if(req.method==='DELETE'){
  await db().delete(storageKey(user));
  return json({ok:true,credentialsStored:false,liveOrdersEnabled:false});
 }
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'JSON required');
 const body=await req.json();
 if(!body||typeof body!=='object')fail(400,'Invalid request');
 // Fail closed if encryption is not configured. Never store plaintext credentials.
 if(!process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY)fail(503,'Secure credential storage is not configured');
 let parsed;
 try{parsed=createPrivateKey(body.privateKeyPem)}catch{fail(400,'Invalid RSA private key')}
 if(parsed.asymmetricKeyType!=='rsa'||(parsed.asymmetricKeyDetails?.modulusLength||0)<2048)fail(400,'RSA private key must be at least 2048 bits');
 let envelope;
 try{envelope=sealKalshiCredentials({userId:user.id,keyId:body.keyId,privateKeyPem:body.privateKeyPem,secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY})}
 catch{fail(400,'Invalid credentials or encryption configuration')}
 await db().setJSON(storageKey(user),{envelope,updatedAt:Date.now()});
 return json({ok:true,credentialsStored:true,connected:false,liveOrdersEnabled:false});
}catch(e){return errorResponse(e)}};
