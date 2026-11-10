// A 204 wake confirms invocation, not a Demo exchange fill or settlement.
const SAFE_STATUS=/^DEMO_[A-Z0-9_]{2,80}$/;
export function demoWakeLifecycleStatus(status){
 return typeof status==='string'&&SAFE_STATUS.test(status)?status:'DEMO_OUTCOME_UNVERIFIED';
}
export function demoWakeReceipt({response,intake,receivedAt,completedAt}){
 return {receivedAt,completedAt,httpStatus:response?.status??null,...intake,
  lifecycleStatus:demoWakeLifecycleStatus(response?.headers?.get('x-demo-lifecycle-status'))};
}
