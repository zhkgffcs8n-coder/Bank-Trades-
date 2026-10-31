// Independent, research-only engine committee. No orders or self-promotion.
const clamp=x=>Math.max(0.01,Math.min(0.99,x));
const sigmoid=x=>1/(1+Math.exp(-Math.max(-20,Math.min(20,x))));

/**
 * Construct a read-only committee snapshot from the SAME scheduled samples and
 * executable Kalshi quote used by the shared signal endpoint. Prices are
 * normalized to dollars (0..1); features are descriptive, not calibrated.
 * No inferred or backfilled data is accepted.
 */
export function buildCommitteeSnapshot(market,records=[],now=Date.now()){
 const missing=[];
 const ticker=market?.ticker;
 if(!ticker)missing.push('active contract ticker');
 const quote=k=>market?.[k+'_dollars']!=null?Number(market[k+'_dollars']):market?.[k]!=null?Number(market[k])/100:NaN;
 const yesAsk=quote('yes_ask'),yesBid=quote('yes_bid'),noAsk=quote('no_ask'),noBid=quote('no_bid');
 if(![yesAsk,yesBid,noAsk,noBid].every(Number.isFinite)||yesAsk<=0||yesAsk>=1||noAsk<=0||noAsk>=1||yesBid<0||noBid<0||yesBid>yesAsk||noBid>noAsk)missing.push('valid normalized bid/ask quotes');
 const samples=(Array.isArray(records)?records:[]).filter(r=>r?.ticker===ticker&&Number.isFinite(r.t)&&r.t<=now&&r.t>=now-480000&&Number.isFinite(r.yesMid)&&r.yesMid>=0&&r.yesMid<=1).sort((a,b)=>a.t-b.t).slice(-8);
 if(samples.length<2)missing.push('at least 2 same-contract scheduled samples');
 const first=samples[0],last=samples.at(-1);
 const spanMs=first&&last?last.t-first.t:null,ageMs=last?now-last.t:null;
 if(samples.length>=2&&spanMs<60000)missing.push('60-second sample span');
 if(last&&ageMs>150000)missing.push('fresh scheduled sample (150s maximum age)');
 const expiry=Date.parse(market?.expected_expiration_time||market?.expiration_time||market?.close_time||'');
 if(!Number.isFinite(expiry)||expiry<=now)missing.push('future contract expiration');
 if(missing.length)return {status:'MISSING_INPUT',missing,ticker:ticker||null,sampleCount:samples.length,sampleSpanMs:spanMs,sampleAgeMs:ageMs};
 const changes=samples.slice(1).map((r,i)=>(r.yesMid-samples[i].yesMid)*100);
 const momentum=(last.yesMid-first.yesMid)*100;
 const trend=changes.slice(-3).reduce((sum,x)=>sum+x,0);
 const volatility=changes.reduce((sum,x)=>sum+Math.abs(x),0)/changes.length;
 const volume=Number(market?.volume);
 return {status:'READY',ticker,asOf:last.t,features:[momentum,trend,volatility,Math.max(0,Math.min(1,(expiry-now)/900000))],ask:yesAsk,spread:Math.max(yesAsk-yesBid,noAsk-noBid)*100,ageMs,volume:market?.volume!=null&&Number.isFinite(volume)?volume:null,sampleCount:samples.length,sampleSpanMs:spanMs,quoteUnit:'dollars',note:'Shadow research only; scheduled sample age is not a guarantee of live quote freshness'};
}

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

export function coordinateEngines(signal, settled=[]){
 const team=evaluateTeam(signal);
 const valid=settled.filter(x=>x?.verified===true&&[0,1].includes(x.outcome)&&Number.isFinite(x.prediction)&&x.prediction>=0&&x.prediction<=1);
 const brier=valid.length?valid.reduce((sum,x)=>sum+(x.prediction-x.outcome)**2,0)/valid.length:null;
 const spread=signal?.spread,age=signal?.ageMs,volume=signal?.volume;
 const risk={fresh:Number.isFinite(age)&&age>=0&&age<=15000,spreadAcceptable:Number.isFinite(spread)&&spread>=0&&spread<=5,feesKnown:Number.isFinite(signal?.feeEstimate),slippageKnown:Number.isFinite(signal?.slippageEstimate)};
 const whale={status:Number.isFinite(volume)?'VOLUME_OBSERVED':'UNAVAILABLE',volume:Number.isFinite(volume)?volume:null,unusualActivityVerified:false};
 const calibration={verifiedCount:valid.length,brier,validated:valid.length>=100};
 const champion={promoted:false,reason:'Independent forward validation required'};
 const execution={authorized:false,mode:'PAPER_RESEARCH_ONLY'};
 return {...team,risk,whale,calibration,champion,execution,sharedLearning:{verifiedCount:valid.length},decision:'WAIT'};
}
