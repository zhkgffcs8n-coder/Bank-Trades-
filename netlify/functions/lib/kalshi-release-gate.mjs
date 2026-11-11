import {releaseFailures} from '../../../src/live-execution.mjs';

const blockersByCheck={
 authentication:'EXCHANGE_AUTHENTICATION_NOT_VERIFIED_FOR_RELEASE',
 orderLifecycle:'BUY_SELL_PARTIAL_FILL_LIFECYCLE_NOT_VERIFIED',
 partialFills:'BUY_SELL_PARTIAL_FILL_LIFECYCLE_NOT_VERIFIED',
 workerHeartbeat:'WORKER_LATENCY_NOT_PRODUCTION_VERIFIED',
 concurrentSpending:'CONCURRENT_STOP_SUBMIT_FENCING_NOT_VERIFIED',
 emergencyCancellation:'EMERGENCY_CANCELLATION_NOT_EXCHANGE_TESTED',
 positionReconciliation:'SETTLEMENT_RECONCILIATION_NOT_EXCHANGE_TESTED',
 ownerIsolation:'OWNER_ISOLATION_NOT_PRODUCTION_TESTED'
};
export const RELEASE_BLOCKERS=Object.freeze([...new Set(Object.values(blockersByCheck))]);

// Release evidence is supplied by the deployment operator after reviewing the
// recorded checks for this exact build. Browser requests cannot supply it.
export function evaluateReleaseEvidence(raw,commit,now=Date.now()){
 let evidence;
 try{evidence=JSON.parse(raw);}catch{}
 const missing=new Set(releaseFailures(evidence,commit,now).map(check=>blockersByCheck[check]));
 const failures=RELEASE_BLOCKERS.filter(blocker=>missing.has(blocker));
 const canTrade=failures.length===0;
 return {release:'kalshi-execution-candidate-2',canTrade,liveOrdersEnabled:canTrade,failures};
}

export const releaseStatus=()=>evaluateReleaseEvidence(process.env.KALSHI_RELEASE_EVIDENCE,process.env.COMMIT_REF);
