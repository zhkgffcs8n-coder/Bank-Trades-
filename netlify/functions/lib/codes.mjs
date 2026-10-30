import {createHash,randomBytes} from 'node:crypto';
import {fail} from './access.mjs';
export const hashCode = code => createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
export async function issueCode(db,issuer,{email,days=30}){
 email=String(email||'').trim().toLowerCase();days=Number(days);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254)fail(400,'Enter a valid member email.');
 if(!Number.isInteger(days)||days<1||days>366)fail(400,'Access must be between 1 and 366 days.');
 const code='BT-'+randomBytes(20).toString('hex').toUpperCase();
 const now=Date.now(), accessUntil=now+days*86400000,codeHash=hashCode(code);
 await db.setJSON('code/'+codeHash,{email,accessUntil,redeemBy:Math.min(accessUntil,now+7*86400000),issuedBy:issuer.id,revoked:false},{onlyIfNew:true});
 return {code,codeHash,email,accessUntil};
}
export async function redeemCode(db,user,raw,now=Date.now()){
 if(typeof raw!=='string'||!/^BT-[A-Fa-f0-9]{40}$/.test(raw.trim()))fail(400,'Invalid access code.');
 const codeHash=hashCode(raw),key='code/'+codeHash;
 const entry=await db.getWithMetadata(key,{type:'json'}),code=entry?.data;
 if(!code || code.revoked || code.email!==user.email.toLowerCase() || code.accessUntil<=now || (code.redeemBy<=now&&!code.redeemedBy) || (code.redeemedBy&&code.redeemedBy!==user.id))fail(403,'Code is invalid, expired, revoked, or belongs to another email.');
 if(!code.redeemedBy){
  const written=await db.setJSON(key,{...code,redeemedBy:user.id},{onlyIfMatch:entry.etag});
  if(!written.modified)fail(409,'Code changed. Please try again.');
 }
 // Absolute issue-time expiration makes retries idempotent; replay cannot extend access.
 await db.setJSON('grant/'+user.id,{codeHash});
 return {active:true,expiresAt:code.accessUntil};
}
export async function revokeCode(db,hash){
 if(!/^[a-f0-9]{64}$/.test(hash||''))fail(400,'Invalid code reference.');
 const key='code/'+hash,entry=await db.getWithMetadata(key,{type:'json'});
 if(!entry)fail(404,'Code not found.');
 const result=await db.setJSON(key,{...entry.data,revoked:true},{onlyIfMatch:entry.etag});
 if(!result.modified)fail(409,'Code changed. Please try again.');
 return {revoked:true};
}
