import {predict,validFeatures,modelValidated} from '../../../src/research-model.mjs';
export function paperSignal(m,records=[],position=null,now=Date.now(),research=null){
 const q=k=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:m?.[k]!=null?Number(m[k]):NaN;
 const yb=q('yes_bid'),ya=q('yes_ask'),nb=q('no_bid'),na=q('no_ask');
 const expires=Date.parse(m?.expected_expiration_time||m?.expiration_time||m?.close_time||'');
 const left=(expires-now)/1000,spread=Math.max(ya-yb,na-nb);
 const base={ticker:m?.ticker||null,action:'WAIT',score:0,reason:'Insufficient verified evidence',at:now,expiresAt:expires};
 if(!m?.ticker||![yb,ya,nb,na].every(Number.isFinite)||ya<yb||na<nb||yb<=0||nb<=0||spread>5||!Number.isFinite(left)||left<75||left>930)return {...base,reason:'Missing, stale, illiquid or invalid quotes'};
 if(position){
  const side=String(position.side).toLowerCase(),bid=side==='up'?yb:side==='down'?nb:NaN,entry=Number(position.ask);
  if(!Number.isFinite(bid)||!Number.isFinite(entry)||entry<=0)return {...base,reason:'Position entry or exit bid unavailable'};
  const roi=(bid-entry)/entry;
  return {...base,action:roi<=-.12?'SELL FAST':'HOLD',roi,reason:roi<=-.12?'Paper position crossed 12% stop threshold':'Paper position open; monitor bid and settlement'};
 }
 if(left<180)return {...base,reason:'Late entry blocked: '+Math.max(0,Math.ceil(left))+'s remain; price movement on the chart is not evidence of an earlier executable entry',secondsRemaining:Math.max(0,Math.ceil(left))};
 const a=records.filter(r=>r?.ticker===m.ticker&&Number.isFinite(r.yesMid)&&Number.isFinite(r.t)&&r.t<=now&&r.t>=now-480000).sort((x,y)=>x.t-y.t).slice(-8);
 if(a.length<2||a.at(-1).t-a[0].t<45000)return {...base,sampleCount:a.length,reason:'Collecting scheduled samples: '+a.length+'/2; observed span '+(a.length?Math.round((a.at(-1).t-a[0].t)/1000):0)+'s / 45s minimum. No entry until data requirements pass'};
 // A current market quote does not make old momentum observations current.
 // Scheduled history is minute-bucketed; require the newest sample within 150s.
 const sampleAge=now-a.at(-1).t;
 if(sampleAge>150000)return {...base,sampleCount:a.length,reason:'Stale momentum history: newest scheduled sample '+Math.round(sampleAge/1000)+'s old; no entry until fresh samples arrive'};
 const changes=a.slice(1).map((r,i)=>(r.yesMid-a[i].yesMid)*100),momentum=changes.reduce((s,x)=>s+x,0);
 const side=momentum>1.5?'up':momentum< -1.5?'down':null;
 const baseline=Math.max(.02,Math.min(.98,(yb+ya)/200));
 const features=[Math.max(-1,Math.min(1,(baseline-.5)*2)),Math.max(-1,Math.min(1,spread/10)),Math.max(-1,Math.min(1,left/900)),Math.max(-1,Math.min(1,(yb-nb)/100))];
 let researchForecast=null;
 try{if(modelValidated(research?.model)&&validFeatures(features))researchForecast=predict(research.model,baseline,features)}catch{}

 if(!side)return {...base,reason:'No directional momentum',researchForecast};
 const agreement=changes.filter(x=>side==='up'?x>0:x<0).length/changes.length;
 const reversals=changes.slice(1).filter((x,i)=>Math.sign(x)!==Math.sign(changes[i])&&Math.abs(x)>.4&&Math.abs(changes[i])>.4).length;
 const ask=side==='up'?ya:na;
 const entryResearch={side:side.toUpperCase(),askCents:side==='up'?ya:na,
  momentumCents:Math.round(momentum*10)/10,agreement,reversals,
  sampleCount:a.length,mode:'SHADOW_ONLY',actionable:false,
  note:'Directional momentum observation; agreement and reversal rules are not proven edges'};

 if(agreement<.55||reversals>3||ask<10||ask>90)return {...base,reason:'Momentum agreement, reversals or entry price outside paper criteria',researchForecast,entryResearch,entryDiagnostics:{direction:side.toUpperCase(),agreement,reversals,askCents:ask,secondsRemaining:Math.ceil(left),filters:{agreement:agreement>=.55,reversals:reversals<=3,price:ask>=10&&ask<=90}}};
 return {...base,action:side==='up'?'BUY UP':'BUY DOWN',side,ask,score:Math.round(Math.min(90,40+Math.abs(momentum)*3+agreement*20)),reason:'Experimental quote momentum; not validated for profitability',entryResearch,sampleCount:a.length,researchForecast,researchValidated:modelValidated(research?.model),researchMode:'observation only; does not change entry decisions'};
}
