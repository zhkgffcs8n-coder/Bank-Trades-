import {releaseStatus} from './lib/kalshi-release-gate.mjs';
import {getStore} from '@netlify/blobs';
import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {assessCollectorHealth} from '../../src/collector-health.mjs';

// This endpoint intentionally never accepts credentials or places orders.
// Production trading remains fail-closed until an independently audited,
// owner-controlled secret vault and fill-reconciled execution worker exist.
export default async function(req){
 try{
  if(req.method!=='GET')fail(405,'Method not allowed');
  await owner();
  const s=getStore({name:'bank-trades-server-kaibot',consistency:'strong'});
  const h=getStore({name:'bank-trades-market-history',consistency:'strong'});
  const [audit,runner,collector]=await Promise.all([
   s.get('risk-audit',{type:'json'}).catch(()=>null),
   s.get('last-run',{type:'json'}).catch(()=>null),
   h.get('collector/heartbeat',{type:'json'}).catch(()=>null)
  ]);
  const now=Date.now();
  const age=x=>Number.isFinite(Number(x))&&Number(x)>0?Math.round((now-Number(x))/1000):null;
  const runnerAge=age(runner?.at),collectorHealth=assessCollectorHealth(collector);
  const cashDifference=Number(audit?.cashDifference);
  const checks={
   runnerFresh:runnerAge!==null&&runnerAge>=0&&runnerAge<=180,
   collectorFresh:collectorHealth.fresh,
   ledgerReconciled:!!audit&&Number.isFinite(cashDifference)&&Math.abs(cashDifference)<0.01,
   orderExecutionVerified:false,
   fillReconciliationVerified:false,
   privateCredentialVaultReady:/^[a-fA-F0-9]{64}$/.test(process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY||''),
   emergencyStopVerified:false
  };
  return json({...releaseStatus(),mode:'LIVE DISABLED',canTrade:false,canAcceptApiKeys:/^[a-fA-F0-9]{64}$/.test(process.env.KALSHI_CREDENTIAL_ENCRYPTION_KEY||''),
   checks,runnerAgeSeconds:runnerAge,collectorAgeSeconds:collectorHealth.ageSeconds,
   proposedLimits:{maxPositionUsd:1,maxDailyLossUsd:5,maxOpenPositions:1},
   note:'Owner-only encrypted credential enrollment is available only when the server encryption key is configured. No real orders are enabled. A quoted bid does not guarantee a fill.'});
 }catch(e){return errorResponse(e)}
}
