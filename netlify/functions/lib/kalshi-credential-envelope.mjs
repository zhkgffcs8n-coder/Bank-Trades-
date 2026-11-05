// Server-only Kalshi credential envelope. Never import in browser code.
// The 32-byte key must be supplied via a private deployment secret, not GitHub.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const VERSION=1;
const keyFromEnv=(secret)=>{
 if(typeof secret!=='string'||!/^[a-fA-F0-9]{64}$/.test(secret))throw new Error('Kalshi credential encryption key unavailable');
 return Buffer.from(secret,'hex');
};
const validUser=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(id);
export function sealKalshiCredentials({userId,keyId,privateKeyPem,secret}={}){
 if(!validUser(userId))throw new Error('Invalid account identifier');
 if(typeof keyId!=='string'||keyId.length<8||keyId.length>256||!/^[a-zA-Z0-9_-]+$/.test(keyId))throw new Error('Invalid Kalshi key identifier');
 if(typeof privateKeyPem!=='string'||privateKeyPem.length>16000||!privateKeyPem.includes('-----BEGIN PRIVATE KEY-----'))throw new Error('Invalid private key format');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFromEnv(secret),iv);
 cipher.setAAD(Buffer.from('kalshi:'+userId+':v'+VERSION));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({keyId,privateKeyPem}),'utf8'),cipher.final()]);
 return {version:VERSION,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')};
}
export function openKalshiCredentials({userId,envelope,secret}={}){
 if(!validUser(userId)||envelope?.version!==VERSION)throw new Error('Invalid credential envelope');
 const iv=Buffer.from(envelope.iv||'','base64'),tag=Buffer.from(envelope.tag||'','base64'),data=Buffer.from(envelope.ciphertext||'','base64');
 if(iv.length!==12||tag.length!==16||data.length<1||data.length>20000)throw new Error('Invalid credential envelope');
 const decipher=createDecipheriv('aes-256-gcm',keyFromEnv(secret),iv);
 decipher.setAAD(Buffer.from('kalshi:'+userId+':v'+VERSION));decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
}
