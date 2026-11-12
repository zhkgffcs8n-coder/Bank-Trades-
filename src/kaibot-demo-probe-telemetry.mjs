// Read-only release diagnostics. Never access uploaded-connection or credential envelopes.
// Only an allowlisted summary of the existing scheduled Netlify Demo probe is exposed.
const phases=new Set(['BALANCE','ORDERS','FILLS','POSITIONS','SETTLEMENTS']);
const causes=new Set(['AUTHENTICATION_OR_PERMISSION','RATE_LIMIT','HTTP_ERROR','INVALID_RESPONSE','TIMEOUT','REQUEST_FAILED','DEMO_REQUEST_TIMEOUT','DEMO_RESPONSE_INVALID_JSON','DEMO_NETWORK_OR_TLS_FAILURE','DEMO_TRANSPORT_UNCLASSIFIED']);
export function sanitizeDemoProbeReceipt(raw){
 if(!raw||typeof raw!=='object')return {status:'NO_SAVED_DEMO_PROBE'};
 const status=typeof raw.status==='string'&&(
  ['DEMO_AUTHENTICATED','DEMO_SNAPSHOT_READS_OK','DEMO_SNAPSHOT_READS_FAILED','DEMO_TRANSPORT_ERROR','DEMO_INVALID_BALANCE_RESPONSE','DEMO_OWNER_MISSING','DEMO_CREDENTIAL_ENVELOPE_UNAVAILABLE'].includes(raw.status)||
  /^KALSHI_HTTP_(?:400|401|403|404|408|409|422|429|500|502|503|504)$/.test(raw.status)
 )?raw.status:'UNRECOGNIZED_DEMO_PROBE_STATUS';
 const checkedAt=typeof raw.checkedAt==='string'&&Number.isFinite(Date.parse(raw.checkedAt))?new Date(raw.checkedAt).toISOString():null;
 return {status,checkedAt,failedPhase:phases.has(raw.failedPhase)?raw.failedPhase:null,
  httpStatus:Number.isSafeInteger(raw.httpStatus)&&raw.httpStatus>=100&&raw.httpStatus<=599?raw.httpStatus:null,
  transportCause:causes.has(raw.transportCause)?raw.transportCause:null,
  commit:typeof raw.commit==='string'&&/^[a-f0-9]{7,40}$/.test(raw.commit)?raw.commit:null};
}
export async function readSanitizedDemoProbe(store){
 if(!store)return {status:'PROBE_STORE_UNCONFIGURED'};
 try{return sanitizeDemoProbeReceipt(await store.get('saved-balance-probe',{type:'json'}));}
 catch{return {status:'PROBE_RECEIPT_READ_UNAVAILABLE'};}
}
