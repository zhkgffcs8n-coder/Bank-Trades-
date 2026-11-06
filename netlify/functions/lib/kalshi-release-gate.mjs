// Deliberately not configurable by a browser or an environment boolean.
// Remove blockers only after recorded integration evidence and implementation review.
export const RELEASE_BLOCKERS=Object.freeze([
 'EXCHANGE_AUTHENTICATION_NOT_VERIFIED_FOR_RELEASE',
 'BUY_SELL_PARTIAL_FILL_LIFECYCLE_NOT_VERIFIED',
 'DAILY_LOSS_ACCOUNTING_NOT_IMPLEMENTED',
 'DURABLE_EXECUTION_WORKER_NOT_IMPLEMENTED',
 'CONCURRENT_STOP_SUBMIT_FENCING_NOT_VERIFIED',
 'EMERGENCY_CANCELLATION_NOT_EXCHANGE_TESTED',
 'SETTLEMENT_RECONCILIATION_NOT_IMPLEMENTED',
 'OWNER_ISOLATION_NOT_PRODUCTION_TESTED'
]);
export const releaseStatus=()=>({release:'kalshi-execution-candidate-1',canTrade:false,liveOrdersEnabled:false,failures:[...RELEASE_BLOCKERS]});
