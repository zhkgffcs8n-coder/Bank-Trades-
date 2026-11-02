// Shadow-only advanced research brain: never emits an executable trade.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function analyzeBrain(m,records=[],now=Date.now()){
 const quote=k=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars']):m?.[k]!=null?Number(m[k])/100:NaN;
 const yesBid=quote('yes_bid'),yesAsk=quote('yes_ask'),noBid=quote('no_bid'),noAsk=quote('no_ask');
 const expiry=Date.parse(m?.expected_expiration_time||m?.expiration_time||m?.close_time||'');
 const base={version:1,mode:'SHADOW_ONLY',ticker:m?.ticker||null,at:now,action:'WAIT',eligible:false};
 if(!m?.ticker||![yesBid,yesAsk,noBid,noAsk].every(Number.isFinite)||yesBid<0||noBid<0||yesAsk>=1||noAsk>=1||yesBid>yesAsk||noBid>noAsk)return {...base,reason:'Invalid executable quotes'};
 const spread=Math.max(yesAsk-yesBid,noAsk-noBid),secondsLeft=(expiry-now)/1000;
 if(!Number.isFinite(secondsLeft)||secondsLeft<180||secondsLeft>930||spread>.04)return {...base,reason:'Outside time or spread limits',spread,secondsLeft};
 // Archive order must never decide which quote wins when two observations
 // disagree at the same contract timestamp. Quarantine the shadow decision.
 const eligible=(Array.isArray(records)?records:[]).filter(r=>r?.ticker===m.ticker&&Number.isFinite(r.t)&&r.t<=now&&r.t>=now-480000&&Number.isFinite(r.yesMid)&&r.yesMid>=0&&r.yesMid<=1).sort((a,b)=>a.t-b.t);
 const byTimestamp=new Map();
 for(const r of eligible){
  const previous=byTimestamp.get(r.t);
  if(previous&&previous.yesMid!==r.yesMid)return {...base,reason:'Conflicting duplicate quote timestamps',samples:byTimestamp.size};
  byTimestamp.set(r.t,r);
 }
 const rows=[...byTimestamp.values()].slice(-8);
 if(rows.length<4||now-rows.at(-1).t>90000||rows.at(-1).t-rows[0].t<180000)return {...base,reason:'Insufficient fresh independent samples',samples:rows.length};
 const changes=rows.slice(1).map((r,i)=>r.yesMid-rows[i].yesMid);
 const momentum=changes.reduce((s,v)=>s+v,0),volatility=Math.sqrt(changes.reduce((s,v)=>s+v*v,0)/changes.length),reversals=changes.slice(1).filter((v,i)=>v*changes[i]<0).length;
 const direction=momentum>.02?'up':momentum<-.02?'down':null;
 const consistency=direction?changes.filter(v=>direction==='up'?v>0:v<0).length/changes.length:0;
 const ask=direction==='up'?yesAsk:direction==='down'?noAsk:null;
 const uncertainty=clamp(volatility*5+reversals/Math.max(1,changes.length)*.35,0,1);
 const quality=clamp(consistency*(1-uncertainty)*(1-spread),0,1);
 const eligible=!!direction&&consistency>=.7&&reversals<=2&&ask>=.2&&ask<=.7&&quality>=.5;
 return {...base,reason:eligible?'Research candidate only; no proven net edge':'Abstain: weak, reversing, or costly momentum',eligible,action:'WAIT',candidateDirection:eligible?direction:null,metrics:{momentum,volatility,reversals,consistency,quality,spread,secondsLeft,ask,observations:rows.length},requiresProspectiveSettlement:true,feesAndSlippageModeled:false};
}
