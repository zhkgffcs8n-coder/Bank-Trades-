// A 204 wake confirms invocation, not a Demo exchange fill or settlement.
const SAFE_STATUS=/^DEMO_[A-Z0-9_]{2,80}$/;
const MARKET_REASONS=new Set([
 'DEMO_MARKET_NOT_FOUND','DEMO_MARKET_NONDEFAULT_EXCHANGE','DEMO_MARKET_INACTIVE',
 'DEMO_MARKET_NOT_BINARY','DEMO_MARKET_ALREADY_USED','DEMO_MARKET_CLOSING_SOON',
 'DEMO_MARKET_ASK_OUT_OF_RANGE','DEMO_MARKET_BID_UNAVAILABLE',
 'DEMO_MARKET_SPREAD_UNSAFE','DEMO_MARKET_NOT_VERIFIED'
]);
export function demoWakeLifecycleStatus(status){
 return typeof status==='string'&&SAFE_STATUS.test(status)?status:'DEMO_OUTCOME_UNVERIFIED';
}
export function demoWakeMarketRejectionReason(reason){
 return MARKET_REASONS.has(reason)?reason:'DEMO_MARKET_NOT_VERIFIED';
}
// Only fixed lifecycle stages may leave the Netlify runner. Never expose raw errors.
const FAILURE_STAGES=new Set([
 'INITIALIZE','ACCOUNT_SNAPSHOT','ACCOUNT_RECONCILIATION','EXIT_QUOTE',
 'RECORD_EXIT_ATTEMPT','SUBMIT_EXIT','VERIFY_EXIT','FIND_MARKET',
 'ENTRY_ACCOUNT_SNAPSHOT','ENTRY_QUOTE','RECORD_ENTRY_ATTEMPT',
 'SUBMIT_ENTRY','VERIFY_ENTRY'
]);
export function demoWakeFailureStage(stage){
 return FAILURE_STAGES.has(stage)?stage:'UNVERIFIED_STAGE';
}
// Only fixed diagnostic codes cross the Demo wake boundary. Never emit raw
// exchange messages, exception text, credentials, or response bodies.
const FAILURE_CODES=new Set([
 'KALSHI_HTTP_400','KALSHI_HTTP_401','KALSHI_HTTP_403','KALSHI_HTTP_404',
 'KALSHI_HTTP_408','KALSHI_HTTP_409','KALSHI_HTTP_422','KALSHI_HTTP_429',
 'KALSHI_HTTP_500','KALSHI_HTTP_502','KALSHI_HTTP_503','KALSHI_HTTP_504',
 'INVALID_ORDERS','INVALID_FILLS','INVALID_MARKET_POSITIONS',
 'INVALID_SETTLEMENTS','CURSOR_LOOP','PAGINATION_LIMIT',
 'INCOMPLETE_ACCOUNT_SNAPSHOT','DEMO_TRANSPORT_OR_STORAGE_ERROR'
]);
export function demoWakeFailureCode(code){
 return FAILURE_CODES.has(code)?code:'UNVERIFIED_FAILURE_CODE';
}
export function demoWakeReceipt({response,intake,receivedAt,completedAt}){
 const lifecycleStatus=demoWakeLifecycleStatus(response?.headers?.get?.('x-demo-lifecycle-status'));
 return {receivedAt,completedAt,httpStatus:response?.status??null,...intake,lifecycleStatus,
  ...(lifecycleStatus==='DEMO_CHAMPION_CONTRACT_INELIGIBLE'?{
   marketRejectionReason:demoWakeMarketRejectionReason(response?.headers?.get?.('x-demo-market-rejection-reason'))
  }:{}),
  ...(lifecycleStatus==='DEMO_LIFECYCLE_FAILED'?{
   failureStage:demoWakeFailureStage(response?.headers?.get?.('x-demo-failure-stage')),
   failureCode:demoWakeFailureCode(response?.headers?.get?.('x-demo-failure-code'))
  }:{})};
}
