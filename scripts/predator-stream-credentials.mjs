import {createPrivateKey} from 'node:crypto';
import {readFile} from 'node:fs/promises';

export async function predatorStreamCredentials(env) {
 const keyId=env.PREDATOR_KALSHI_KEY_ID?.trim();
 const pem=env.PREDATOR_KALSHI_PRIVATE_KEY_PEM?.trim();
 const file=env.PREDATOR_KALSHI_PRIVATE_KEY_FILE;
 if(!keyId&&!pem&&!file)return null;
 if(!keyId||Boolean(pem)===Boolean(file))throw Error('PREDATOR_KALSHI_CREDENTIALS_INCOMPLETE_OR_AMBIGUOUS');
 try{
  const privateKeyPem=pem||await readFile(file,'utf8');
  if(createPrivateKey(privateKeyPem).asymmetricKeyType!=='rsa')throw Error();
  return {keyId,privateKeyPem};
 }catch{
  throw Error('PREDATOR_KALSHI_PRIVATE_KEY_INVALID_OR_UNREADABLE');
 }
}
