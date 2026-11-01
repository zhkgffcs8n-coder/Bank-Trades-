// Experimental paper-only probability/price edge filter. Never sends orders.
const ok=Number.isFinite;
export function edgeResearch({probability,yesAsk,noAsk,yesBid,noBid,fee=0,slippage=0,quoteAgeMs=0,minEdge=.04}={}){
 const wait=reason=>({mode:'SHADOW_ONLY',eligible:false,candidateDirection:null,reason});
 if(![probability,yesAsk,noAsk,yesBid,noBid,fee,slippage,quoteAgeMs,minEdge].every(ok)||probability<=0||probability>=1||yesAsk<=0||noAsk<=0||yesAsk>=1||noAsk>=1||yesBid<0||noBid<0||yesBid>yesAsk||noBid>noAsk||fee<0||slippage<0||quoteAgeMs<0||minEdge<0)return wait('Invalid quote or assumptions');
 if(quoteAgeMs>30000)return wait('Stale quote');
 const spread=Math.max(yesAsk-yesBid,noAsk-noBid);
 if(spread>.04)return wait('Spread exceeds four cents');
 const upEdge=probability-yesAsk-fee-slippage,downEdge=1-probability-noAsk-fee-slippage;
 const best=Math.max(upEdge,downEdge);
 return {mode:'SHADOW_ONLY',eligible:best>=minEdge,candidateDirection:best>=minEdge?(upEdge>=downEdge?'UP':'DOWN'):null,reason:best>=minEdge?'Research candidate':'Modeled edge too small',upEdge,downEdge,spread,assumptions:{fee,slippage,minEdge},note:'Probability not proven calibrated; estimated edge is not realized profit'};
}
