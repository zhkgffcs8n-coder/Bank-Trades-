// Prospective paired accuracy review: no promotion from small, unverified or unmatched samples.
// Research-only; does not change live signal weights or authorize orders.
const validProbability=p=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1;
export function compareProspectiveEngines(rounds=[],{minimumRounds=100,minimumImprovement=.01}={}){
 const unique=new Map(),conflicts=new Set();
 for(const r of rounds){
  if(typeof r?.ticker!=='string'||!r.ticker)continue;
  const fingerprint=JSON.stringify(r);
  if(unique.has(r.ticker)&&JSON.stringify(unique.get(r.ticker))!==fingerprint)conflicts.add(r.ticker);
  else if(!unique.has(r.ticker))unique.set(r.ticker,r);
 }
 const paired=[];
 for(const [ticker,r] of unique){
  if(conflicts.has(ticker)||r.verified!==true||![0,1].includes(r.outcome)||
   !Number.isSafeInteger(r.predictedAt)||!Number.isSafeInteger(r.expiresAt)||
   !Number.isSafeInteger(r.settledAt)||r.predictedAt<=0||
   r.predictedAt>=r.expiresAt||r.settledAt<r.expiresAt||
   !validProbability(r.spider)||!validProbability(r.primal)||!validProbability(r.omega)||!validProbability(r.marketBaseline))continue;
  paired.push(r);
 }
 const brier=k=>paired.length?paired.reduce((sum,r)=>sum+(r[k]-r.outcome)**2,0)/paired.length:null;
 const scores={spider:brier('spider'),primal:brier('primal'),omega:brier('omega'),marketBaseline:brier('marketBaseline')};
 const winner=['spider','primal','omega'].sort((a,b)=>scores[a]-scores[b])[0];
 const eligible=paired.length>=minimumRounds&&Number.isFinite(scores[winner])&&
  scores[winner]+minimumImprovement<scores.marketBaseline;
 return {status:eligible?'REVIEW_CANDIDATE':'INSUFFICIENT_EVIDENCE',verifiedPairedRounds:paired.length,
  conflicts:conflicts.size,scores,leader:eligible?winner:null,
  automaticPromotion:false,liveTradingAuthorized:false,
  note:'Brier score is probability accuracy, not net profitability. Independent holdout and costs are required before any live promotion.'};
}
