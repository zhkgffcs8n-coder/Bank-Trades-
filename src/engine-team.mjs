// Independent, research-only engine committee. No orders or self-promotion.
const clamp=x=>Math.max(0.01,Math.min(0.99,x));
const sigmoid=x=>1/(1+Math.exp(-Math.max(-20,Math.min(20,x))));
export function evaluateTeam(s){
 const f=Array.isArray(s?.features)?s.features.map(Number):[];
 const ask=Number(s?.ask);
 if(f.length<4||f.some(x=>!Number.isFinite(x))||!Number.isFinite(ask)||ask<=0||ask>=1)return {status:'INVALID',votes:[],consensus:null};
 const [momentum,trend,volatility,time]=f.map(x=>Math.max(-5,Math.min(5,x)));
 const baseline=clamp(ask);
 const specs=[
  ['Momentum',sigmoid(momentum*.65)],
  ['Trend',sigmoid(trend*.6)],
  ['Reversal',sigmoid(-momentum*.45-trend*.15)],
  ['Volatility',sigmoid(momentum/(1+Math.abs(volatility))*.5)],
  ['Time decay',sigmoid(trend*.35+time*.15)],
  ['Blend',sigmoid(momentum*.25+trend*.3-volatility*.1)],
  ['Market baseline',baseline]
 ];
 const votes=specs.map(([name,p])=>({name,probability:clamp(p),direction:p>=.5?'UP':'DOWN'}));
 // Correlated heuristic engines are NOT independent evidence; no claimed calibrated probability.
 const directional=votes.slice(0,6),up=directional.filter(v=>v.direction==='UP').length;
 return {status:'SHADOW_ONLY',votes,agreement:Math.max(up,6-up)/6,consensus:up===3?'SPLIT':up>3?'UP':'DOWN',baseline,notice:'Experimental correlated heuristics. No trade authorization, no accuracy claim.'};
}
