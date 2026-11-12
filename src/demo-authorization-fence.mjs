// Fail closed if an owner STOP, owner change, or replacement request supersedes
// an in-flight Demo execution test. Never treat same-owner UUID replacement
// as continuing authorization for the old request.
export function demoAuthorizationRevoked(current,expected,ownerId){
 if(!ownerId||current?.ownerId!==ownerId)return true;
 if(expected?.ownerId===ownerId&&typeof expected.requestId==='string'&&expected.requestId.length>0)
  return current?.requestId!==expected.requestId;
 return false;
}
