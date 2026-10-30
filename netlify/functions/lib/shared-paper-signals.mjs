export function paperSignal(m,records=[],position=null,now=Date.now()){
 const q=k=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars'])*100:m?.[k]!=null?Number(m[k]):NaN;
 const yb=q('yes_bid'),ya=q('yes_ask'),nb=q('no_bid'),na=q('no_ask');
 const expires=Date.parse(m?.expected_expiration_time||m?.expiration_time||m?.close_time||'');
 const left=(expires-now)/1000,spread=Math.max(ya-yb,na-nb);
 const base={ticker:m?.ticker||null,action:'WAIT',score:0,reason:'Insufficient verified evidence',at:now,expiresAt:expires};
 if(!m?.ticker||![yb,ya,nb,na].every(Number.isFinite)||ya<yb||na<nb||yb<=0||nb<=0||spread>3||!Number.isFinite(left)||left<75||left>930)return {...base,reason:'Missing, stale, illiquid or invalid quotes'};
 if(position){
  const side=String(position.side).toLowerCase(),bid=side==='up'?yb:side==='down'?nb:NaN,entry=Number(position.ask);
  if(!Number.isFinite(bid)||!Number.isFinite(entry)||entry<=0)return {...base,reason:'Position entry or exit bid unavailable'};
  const roi=(bid-entry)/entry;
  return {...base,action:roi<=-.12?'SELL FAST':'HOLD',roi,reason:roi<=-.12?'Paper position crossed 12% stop threshold':'Paper position open; monitor bid and settlement'};
 }
 if(left<360)return {...base,reason:'Late entry blocked'};
 const a=records.filter(r=>r?.ticker===m.ticker&&Number.isFinite(r.yesMid)&&Number.isFinite(r.t)&&r.t<=now&&r.t>=now-480000).sort((x,y)=>x.t-y.t).slice(-8);
 if(a.length<4||a.at(-1).t-a[0].t<120000)return {...base,reason:'Collecting at least four scheduled samples'};
 const changes=a.slice(1).map((r,i)=>(r.yesMid-a[i].yesMid)*100),momentum=changes.reduce((s,x)=>s+x,0);
 const side=momentum>3?'up':momentum< -3?'down':null;
 if(!side)return {...base,reason:'No directional momentum'};
 const agreement=changes.filter(x=>side==='up'?x>0:x<0).length/changes.length;
 const reversals=changes.slice(1).filter((x,i)=>Math.sign(x)!==Math.sign(changes[i])&&Math.abs(x)>.4&&Math.abs(changes[i])>.4).length;
 const ask=side==='up'?ya:na;
 if(agreement<.65||reversals>2||ask<35||ask>80)return {...base,reason:'Momentum agreement, reversals or entry price outside paper criteria'};
 return {...base,action:side==='up'?'BUY UP':'BUY DOWN',side,ask,score:Math.round(Math.min(90,40+Math.abs(momentum)*3+agreement*20)),reason:'Experimental quote momentum; not validated for profitability',sampleCount:a.length};
}
