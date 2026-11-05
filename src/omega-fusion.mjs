// PRIMAL OMEGA ULTRA — provider-agnostic research consensus.
// No API calls, secrets, trade execution, or claims of calibrated accuracy.
export const OMEGA_RESEARCH_PROVIDERS=Object.freeze([
 'gemini','grok','gpt','claude','deepseek','qwen','mistral','kimi','llama','perplexity','primal','kalshi_baseline'
]);
const isProb=p=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1;
const isTime=t=>typeof t==='number'&&Number.isSafeInteger(t)&&t>0;
export function evaluateOmegaFusion({marketTicker,roundId,nowMs,forecasts=[],marketBaseline=null,maxAgeMs=15000}={}){
 const reasons=[];
 if(typeof marketTicker!=='string'||!marketTicker||typeof roundId!=='string'||!roundId||!isTime(nowMs)) reasons.push('Missing market, round or evaluation timestamp');
 if(!Array.isArray(forecasts)) forecasts=[];
 const seen=new Set(),accepted=[],rejected=[];
 for(const f of forecasts){
  const id=f?.provider;
  let reason=null;
  if(!OMEGA_RESEARCH_PROVIDERS.includes(id)||id==='kalshi_baseline')reason='Unknown or reserved provider';
  else if(seen.has(id))reason='Duplicate provider';
  else if(f.marketTicker!==marketTicker||f.roundId!==roundId)reason='Market or round mismatch';
  else if(!isProb(f.upProbability))reason='Invalid probability';
  else if(!isTime(f.observedAtMs)||f.observedAtMs>nowMs||nowMs-f.observedAtMs>maxAgeMs)reason='Stale or future observation';
  if(reason){rejected.push({provider:String(id??'unknown'),reason});continue;}
  seen.add(id);accepted.push({provider:id,upProbability:f.upProbability,observedAtMs:f.observedAtMs});
 }
 const base=marketBaseline;
 const validBase=base&&base.marketTicker===marketTicker&&base.roundId===roundId&&
 isProb(base.upProbability)&&isTime(base.observedAtMs)&&base.observedAtMs<=nowMs&&nowMs-base.observedAtMs<=maxAgeMs;
 if(!validBase)reasons.push('Missing fresh Kalshi baseline');
 if(accepted.length<2)reasons.push('At least two distinct fresh research forecasts required');
 // An unweighted average is for comparison only, not a trading probability.
 const mean=accepted.length?accepted.reduce((s,x)=>s+x.upProbability,0)/accepted.length:null;
 const disagreement=accepted.length?Math.max(...accepted.map(x=>x.upProbability))-Math.min(...accepted.map(x=>x.upProbability)):null;
 return {status:reasons.length?'INSUFFICIENT_DATA':'SHADOW_RESEARCH',marketTicker:marketTicker||null,roundId:roundId||null,
  accepted,rejected,reasons,modelMean:mean,modelDisagreement:disagreement,
  marketBaseline:validBase?base.upProbability:null,
  modelMinusMarket:validBase&&mean!==null?mean-base.upProbability:null,
  ordersAuthorized:false,notice:'Model forecasts may be correlated or poorly calibrated. No execution or accuracy claim.'};
}
