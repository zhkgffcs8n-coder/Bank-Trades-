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
export function demoWakeReceipt({response,intake,receivedAt,completedAt}){
 const lifecycleStatus=demoWakeLifecycleStatus(response?.headers?.get?.('x-demo-lifecycle-status'));
 return {receivedAt,completedAt,httpStatus:response?.status??null,...intake,lifecycleStatus,
  ...(lifecycleStatus==='DEMO_CHAMPION_CONTRACT_INELIGIBLE'?{
   marketRejectionReason:demoWakeMarketRejectionReason(response?.headers?.get?.('x-demo-market-rejection-reason'))
  }:{})};
}
