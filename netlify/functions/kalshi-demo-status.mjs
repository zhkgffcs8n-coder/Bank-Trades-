import {getStore} from '@netlify/blobs';
import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {sealKalshiCredentials} from './lib/kalshi-credential-envelope.mjs';
import {checkDemoConnection} from './kalshi-demo-check.mjs';

export default async req=>{try{
 const store=getStore({name:'bank-trades-kalshi-demo',consistency:'strong'});
 if(req.method==='GET'){
  const uploaded=await store.get('uploaded-connection',{type:'json'});
  const probe=await store.get('saved-balance-probe',{type:'json'}).catch(()=>null);
  const savedBalanceProbe=probe?{status:probe.status,requestId:probe.requestId,commit:probe.commit,
   operation:probe.operation,checkedAt:probe.checkedAt,durationMs:probe.durationMs}:null;
  const result=uploaded||await store.get('connection',{type:'json'});
  const latest=await store.get('order-test/v8',{type:'json'});
  const test=latest||await store.get('order-test/v7',{type:'json'})||await store.get('order-test/v6',{type:'json'})||await store.get('order-test/v5',{type:'json'})||await store.get('order-test/v4',{type:'json'})||await store.get('order-test/v3',{type:'json'})||await store.get('order-test/v2',{type:'json'})||await store.get('order-test/v1',{type:'json'});
  const hold=await store.get('hold-test/v1',{type:'json'});
  const strategy=await store.get('strategy-hold/v1',{type:'json'});
  const paper=getStore({name:'bank-trades-server-kaibot',consistency:'strong'});
  const [lastRun,ledger]=await Promise.all(['last-run','ledger'].map(key=>paper.get(key,{type:'json'}).catch(()=>null)));
  const extreme=(ledger?.trades||[]).filter(trade=>trade.extremeCoverage===true);
  const resolved=extreme.filter(trade=>['CLOSED','SETTLED'].includes(trade.status)&&Number.isFinite(trade.pnl));
  const start=await store.get('extreme-demo/v1/start',{type:'json'});
  const demoRounds=Number.isSafeInteger(start?.round)?await Promise.all(Array.from({length:36},async(_,i)=>{
   const round=start.round+i,t=await store.get('extreme-demo/v1/'+round,{type:'json'});
   return {round,status:t?.status||'NO_ORDER_RECORDED',side:t?.side??null,filled:t?.filled??null,
    entryCost:t?.entryCost??null,markPnl:t?.markPnl??null,realizedPnl:t?.realizedPnl??null,exchangeCode:t?.exchangeCode??null};
  })):[];
  const lastScan=await store.get('extreme-demo/v1/last-scan',{type:'json'});
  return json({savedBalanceProbe,championWake:await store.get('champion-wake-receipt',{type:'json'}).catch(()=>null),lifecycleTest:await store.get('lifecycle-status',{type:'json'}),extremeDemo:{rounds:demoRounds,lastScan},extremePaper:{running:lastRun?.running===true,checkedAt:lastRun?.at??null,lastRound:lastRun?.extremeCoverage??null,
   entries:extreme.length,resolved:resolved.length,pnlBeforeFees:Math.round(resolved.reduce((sum,trade)=>sum+trade.pnl,0)*100)/100},strategyTest:strategy?{status:strategy.status,side:strategy.side,signalScore:strategy.signalScore,filled:strategy.filled??null,entryCost:strategy.entryCost??null,positionReconciled:strategy.positionReconciled??null,realizedPnl:strategy.realizedPnl??null}:{status:'WAITING_FOR_SETTLEMENT_OR_QUALIFIED_SIGNAL'},holdTest:hold?{status:hold.status,filled:hold.filled??null,entryCost:hold.entryCost??null,positionReconciled:hold.positionReconciled??null,markPnl:hold.markPnl??null,realizedPnl:hold.realizedPnl??null,checkedAt:hold.checkedAt??null,exchangeCode:hold.exchangeCode??null}:null,status:result?.status||'AWAITING_DEMO_CHECK',checkedAt:result?.checkedAt||null,orderTest:test?{status:test.status,attempt:latest?8:null,attemptedAt:test.checkedAt??null,filled:test.filled??null,exchangeCode:test.exchangeCode??null}:null});
 }
 if(req.method!=='POST')fail(405,'Method not allowed');
 const user=await owner();
 if(user.id!==process.env.KALSHI_LIVE_OWNER_ID)fail(403,'Configured owner required');
 if(req.headers.get('origin')!==new URL(req.url).origin)fail(403,'Origin mismatch');
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON required');
 const {action,side,keyId,privateKeyPem}=await req.json();
 if(action==='DEMO_EXECUTION_TEST'||action==='STOP_DEMO_EXECUTION_TEST'){
  const key='execution-test/authorization';
  if(action==='STOP_DEMO_EXECUTION_TEST'){
   await store.setJSON(key,{ownerId:null});
   return json({status:'DEMO_EXECUTION_TEST_STOPPED'});
  }
  const saved=await store.get('uploaded-connection',{type:'json'});
  if(saved?.status!=='DEMO_AUTHENTICATED')fail(409,'Authenticated Demo credentials required');
  if(side!==undefined&&!['UP','DOWN'].includes(side))fail(400,'Choose UP or DOWN');
  await store.setJSON(key,{ownerId:user.id,side:side??'UP'});
  return json({status:'DEMO_EXECUTION_TEST_ARMED'},202);
 }
 if(typeof keyId!=='string'||typeof privateKeyPem!=='string'||privateKeyPem.length>16000)fail(400,'Enter the demo key ID and choose the downloaded private key file.');
 const status=await checkDemoConnection({KALSHI_DEMO_KEY_ID:keyId,KALSHI_DEMO_PRIVATE_KEY:privateKeyPem});
 if(status!=='DEMO_AUTHENTICATED')return json({status},422);
 const envelope=sealKalshiCredentials({userId:'demo-'+user.id,keyId:keyId.trim(),privateKeyPem:privateKeyPem.trim(),secret:process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY});
 const checkedAt=new Date().toISOString();
 await store.setJSON('uploaded-connection',{status,checkedAt,envelope});
 return json({status,checkedAt});
}catch(error){return errorResponse(error)}};
