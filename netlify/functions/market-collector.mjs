import {paperSignal} from './lib/shared-paper-signals.mjs';
import {initialModel,predict,learn} from '../../src/research-model.mjs';
import {verifiedFinalizedBinaryOutcome,trustedStoredFinalizedOutcome,SETTLEMENT_VERIFICATION} from '../../src/official-settlement.mjs';
import {getStore} from '@netlify/blobs';

const SERIES={BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'};
const base='https://api.elections.kalshi.com/trade-api/v2';
const store=()=>getStore({name:'bank-trades-market-history',consistency:'strong'});
const price=(m,k)=>m?.[k+'_dollars']!=null?Number(m[k+'_dollars']):m?.[k]!=null?Number(m[k])/100:null;
async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);try{const r=await fetch(url,{signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}finally{clearTimeout(t)}}
function expiry(m,now){return [m.expected_expiration_time,m.expiration_time,m.close_time].map(Date.parse).filter(x=>Number.isFinite(x)&&x>now).sort((a,b)=>a-b)[0]||null}
export default async()=>{
 const db=store(),now=Date.now(),bucket=Math.floor(now/60000)*60000;
 await Promise.all(Object.entries(SERIES).map(async([asset,series])=>{try{
  const d=await get(base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'100'}));
  const markets=(d.markets||[]).map(m=>({...m,_expiry:expiry(m,now)})).filter(m=>m._expiry&&m._expiry-now<=16*60000).sort((a,b)=>a._expiry-b._expiry);
  const m=markets[0];if(!m){await db.setJSON('telemetry/'+asset,{at:Date.now(),asset,valid:false,error:'No verified open contract'});return;}
  const yesBid=price(m,'yes_bid'),yesAsk=price(m,'yes_ask'),noBid=price(m,'no_bid'),noAsk=price(m,'no_ask');
  if(![yesBid,yesAsk,noBid,noAsk].every(Number.isFinite)||yesAsk<yesBid||noAsk<noBid){await db.setJSON('telemetry/'+asset,{at:Date.now(),asset,ticker:m.ticker,valid:false,error:'Incomplete or crossed bid/ask quotes'});return;}
  const record={asset,ticker:m.ticker,t:bucket,observedAt:Date.now(),expiresAt:m._expiry,yesBid,yesAsk,noBid,noAsk,yesMid:(yesBid+yesAsk)/2,spread:Math.max(yesAsk-yesBid,noAsk-noBid),source:'Kalshi public API scheduled sample'};
  const sampleKey='samples/'+asset+'/'+bucket;
  const existing=await db.get(sampleKey,{type:'json'});
  // One immutable training sample per asset/minute. A fast UI refresh is not new training evidence.
  if(!existing)await db.setJSON(sampleKey,record);
  await db.setJSON('latest/'+asset,record);
  // Maintain a bounded per-asset rolling snapshot; signal readers avoid expensive blob listings.
  try{
   const key='recent/'+asset;
   const prior=await db.get(key,{type:'json'});
   const recent=(Array.isArray(prior)?prior:[]).filter(x=>x?.ticker===m.ticker&&Number.isFinite(x.t)&&x.t>=now-12*60000&&x.t!==record.t);
   recent.push(record);
   await db.setJSON(key,recent.slice(-12));
  }catch(e){console.warn('Recent snapshot update failed',asset,String(e));}
  await db.setJSON('telemetry/'+asset,{at:now,asset,ticker:m.ticker,sourceAgeMs:Date.now()-record.observedAt,sampleDuplicate:!!existing,quoteSpread:record.spread,valid:true});
  // Parallel shadow comparison: immutable per-market entry decisions; never place orders.
  try{
   const comparisonKey='comparison/v1/'+m.ticker;
   if(!await db.get(comparisonKey,{type:'json'})){
    const history=await db.list({prefix:'samples/'+asset+'/',limit:30});
    const records=(await Promise.all(history.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(x=>x?.ticker===m.ticker).sort((a,b)=>a.t-b.t).slice(-8);
    const candidate=paperSignal(m,records,null,now,null);
    if(['BUY UP','BUY DOWN'].includes(candidate.action)){
     const a={action:candidate.action,side:candidate.side,ask:candidate.ask,score:candidate.score};
     const b=Number(candidate.score)>=75&&Number(candidate.ask)<=65?{...a}:{action:'WAIT',reason:'Upgraded conservative quality gate'};
     await db.setJSON(comparisonKey,{ticker:m.ticker,asset,at:now,expiresAt:m._expiry,engines:{original:a,upgraded:b},status:'PENDING',version:1});
    }
   }
  }catch(e){console.warn('Shadow comparison collection failed',asset,String(e))}

  // One immutable, explicitly hypothetical paper direction per contract round.
  // Record both sides and their entry costs even if the live recommendation is WAIT.
  try{
   const key='round-paper/v1/'+m.ticker;
   if(!await db.get(key,{type:'json'})){
    const baseline=Math.max(.01,Math.min(.99,record.yesMid));
    const model=await db.get('training/model/'+asset,{type:'json'})||await db.get('training/model',{type:'json'})||initialModel();
    const features=[Math.max(-1,Math.min(1,(baseline-.5)*2)),Math.max(-1,Math.min(1,record.spread*10)),Math.max(-1,Math.min(1,(m._expiry-now)/900000)),Math.max(-1,Math.min(1,yesBid-noBid))];
    const probability=predict(model,baseline,features);
    const upCost=yesAsk,downCost=noAsk;
    const direction=probability>=0.5?'UP':'DOWN';
    await db.setJSON(key,{ticker:m.ticker,asset,at:now,expiresAt:m._expiry,source:'hypothetical paper-only round forecast',direction,probability,modelVersion:model.version||null,up:{ask:upCost,maxLoss:upCost,winProfit:1-upCost,expectedValue:probability-upCost},down:{ask:downCost,maxLoss:downCost,winProfit:1-downCost,expectedValue:(1-probability)-downCost},status:'PENDING',feeExcluded:true});
   }
  }catch(e){console.warn('Round paper forecast failed',asset,String(e))}
  const pendingKey='pending/'+m.ticker;
  if(!await db.get(pendingKey,{type:'json'})){
   const model=await db.get('training/model/'+asset,{type:'json'})||await db.get('training/model',{type:'json'})||initialModel();
   const baseline=Math.max(.02,Math.min(.98,record.yesMid));
   const features=[Math.max(-1,Math.min(1,(record.yesMid-.5)*2)),Math.max(-1,Math.min(1,record.spread*10)),Math.max(-1,Math.min(1,(m._expiry-now)/900000)),Math.max(-1,Math.min(1,yesBid-noBid))];
   await db.setJSON(pendingKey,{ticker:m.ticker,asset,expiresAt:m._expiry,at:now,features,baseline,prediction:predict(model,baseline,features)});
  }
 }catch(e){console.error('Collector asset failed',asset,String(e));try{await db.setJSON('telemetry/'+asset,{at:Date.now(),asset,valid:false,error:String(e).slice(0,240)})}catch(writeError){console.error('Collector telemetry failed',asset,String(writeError))}}}));
 // Track every sampled contract, not just the latest contract for each asset.
 // This prevents a new 15-minute round from hiding the previous round's settlement.
 try{
  const listed=await db.list({prefix:'pending/',limit:1000});
  const pending=(await Promise.all(listed.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
  let model=await db.get('training/model',{type:'json'})||initialModel();
  const assetModels={};
  for(const rec of pending){
   if(!rec?.ticker||!Number.isFinite(rec.expiresAt)||rec.expiresAt>now-60000)continue;
   const labelKey='outcomes/'+rec.ticker;
   const cached=await db.get(labelKey,{type:'json'});
   // Reverify legacy labels instead of discarding pending records on sight.
   if(trustedStoredFinalizedOutcome(cached,rec.ticker)){await db.delete('pending/'+rec.ticker);continue;}
   try{
    const d=await get(base+'/markets/'+encodeURIComponent(rec.ticker)),m=d.market;
    const result=verifiedFinalizedBinaryOutcome(m,rec.ticker);
    if(result){
     await db.setJSON(labelKey,{ticker:rec.ticker,asset:rec.asset,result,settledAt:m.settlement_ts||null,labeledAt:now,source:'Kalshi finalized market record',verification:SETTLEMENT_VERIFICATION});
     // Existing legacy labels may already have trained weights. Never count them twice.
     if(!cached&&Array.isArray(rec.features)&&Number.isFinite(rec.prediction)&&Number.isFinite(rec.baseline)){
      model=learn(model,rec,result==='yes'?1:0);
      await db.setJSON('training/model',model);
      const assetKey=String(rec.asset||'UNKNOWN');
      const assetModel=assetModels[assetKey]||await db.get('training/model/'+assetKey,{type:'json'})||initialModel();
      assetModels[assetKey]=learn(assetModel,rec,result==='yes'?1:0);
      await db.setJSON('training/model/'+assetKey,assetModels[assetKey]);
     }
     await db.delete('pending/'+rec.ticker);
    }
   }catch{}
  }
  // Label the first scheduled signal decision per contract against official outcomes.
  // WAIT is evaluated counterfactually, never counted as an executed trade.
  try{
   const listing=await db.list({prefix:'signal-observations/v1/',limit:1000});
   const observations=(await Promise.all(listing.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
   for(const rec of observations){
    if(rec.status!=='PENDING'||rec.expiresAt>now-60000)continue;
    const outcome=await db.get('outcomes/'+rec.ticker,{type:'json'});
    if(!trustedStoredFinalizedOutcome(outcome,rec.ticker))continue;
    const yesWon=outcome.result==='yes';
    rec.status='RESOLVED';rec.outcome=outcome.result;rec.resolvedAt=now;
    rec.counterfactual={
     upPnl:Number(((yesWon?100:0)-Number(rec.quote.yesAsk)).toFixed(2)),
     downPnl:Number(((yesWon?0:100)-Number(rec.quote.noAsk)).toFixed(2)),
     unit:'cents per hypothetical contract; no fees, slippage or fills'
    };
    await db.setJSON('signal-observations/v1/'+rec.ticker,rec);
   }
   const resolved=observations.filter(x=>x.status==='RESOLVED'&&x.counterfactual);
   const summary={at:now,version:1,observed:observations.length,resolved:resolved.length,pending:observations.length-resolved.length,truncated:Boolean(listing.cursor),
    qualified:{n:0,wins:0,losses:0,pnlCents:0},abstained:{n:0,avoidedLosses:0,missedWins:0},
    note:'Retrospective first-observation comparison only; no actual fills and no causal proof of strategy improvement.'};
   for(const rec of resolved){
    if(rec.decision==='QUALIFIED'){
     const pnl=rec.action==='BUY UP'?rec.counterfactual.upPnl:rec.counterfactual.downPnl;
     summary.qualified.n++;summary.qualified.wins+=pnl>0?1:0;summary.qualified.losses+=pnl<=0?1:0;summary.qualified.pnlCents+=pnl;
    }else{
     summary.abstained.n++;
     // Counterfactual is the cheaper quoted side; it is not a model prediction.
     const hypothetical=Math.min(Number(rec.quote.yesAsk),Number(rec.quote.noAsk))===Number(rec.quote.yesAsk)?rec.counterfactual.upPnl:rec.counterfactual.downPnl;
     summary.abstained.avoidedLosses+=hypothetical<=0?1:0;
     summary.abstained.missedWins+=hypothetical>0?1:0;
    }
   }
   summary.qualified.pnlCents=Number(summary.qualified.pnlCents.toFixed(2));
   await db.setJSON('signal-observations/report-v1',summary);
  }catch(e){console.warn('Signal outcome comparison unavailable',String(e))}
  // Resolve the same observed contracts for both strategies using official finalized outcomes.
  const comparisons=await db.list({prefix:'comparison/v1/',limit:1000});
  for(const item of comparisons.blobs){
   const rec=await db.get(item.key,{type:'json'});
   if(!rec||rec.status!=='PENDING'||rec.expiresAt>now-60000)continue;
   const outcome=await db.get('outcomes/'+rec.ticker,{type:'json'});
   if(!trustedStoredFinalizedOutcome(outcome,rec.ticker))continue;
   for(const engine of Object.values(rec.engines||{})){
    if(!['up','down'].includes(engine.side)||engine.action==='WAIT')continue;
    const won=(engine.side==='up')===(outcome.result==='yes');
    engine.pnl=Number(((won?1:0)-Number(engine.ask)/100).toFixed(4));
    engine.won=won;engine.resolved=true;
   }
   rec.status='RESOLVED';rec.outcome=outcome.result;rec.resolvedAt=now;
   await db.setJSON(item.key,rec);
  }
  // Persist a transparent side-by-side report; one hypothetical contract per BUY.
  const all=await db.list({prefix:'comparison/v1/',limit:1000});
  const rows=(await Promise.all(all.blobs.map(b=>db.get(b.key,{type:'json'})))).filter(Boolean);
  const report={at:now,version:1,totalObserved:rows.length,pending:rows.filter(r=>r.status==='PENDING').length,truncated:!!all.cursor,engines:{}};
  for(const name of ['original','upgraded']){
   const trades=rows.filter(r=>r.status==='RESOLVED'&&r.engines?.[name]?.resolved).sort((a,b)=>a.at-b.at);
   let equity=0,peak=0,maxDrawdown=0;
   for(const row of trades){equity+=row.engines[name].pnl;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity)}
   const pnl=trades.reduce((sum,row)=>sum+row.engines[name].pnl,0);
   const invested=trades.reduce((sum,row)=>sum+Number(row.engines[name].ask)/100,0);
   report.engines[name]={trades:trades.length,wins:trades.filter(row=>row.engines[name].won).length,losses:trades.filter(row=>!row.engines[name].won).length,winRate:trades.length?trades.filter(row=>row.engines[name].won).length/trades.length:null,netPnl:Number(pnl.toFixed(4)),roi:invested?Number((pnl/invested).toFixed(4)):null,maxDrawdown:Number(maxDrawdown.toFixed(4)),method:'One hypothetical contract per signal; binary settlement, entry ask; excludes fees, slippage and early exits'};
  }
  await db.setJSON('comparison/report-v1',report);
  // Shared loss review: update a conservative research-only threshold from resolved
  // outcomes. The original strategy remains frozen as an unbiased baseline.
  // Never retrain on unresolved outcomes or automatically loosen risk limits.
  const resolved=rows.filter(r=>r.status==='RESOLVED'&&r.engines?.original?.resolved).sort((a,b)=>a.at-b.at);
  const training=resolved.slice(0,-30),holdout=resolved.slice(-30);
  const candidates=[{score:70,maxAsk:65},{score:75,maxAsk:65},{score:80,maxAsk:60},{score:85,maxAsk:55}];
  const evaluate=(set,gate)=>{
   const selected=set.filter(r=>Number(r.engines.original.score)>=gate.score&&Number(r.engines.original.ask)<=gate.maxAsk);
   const pnl=selected.reduce((n,r)=>n+Number(r.engines.original.pnl),0);
   const spent=selected.reduce((n,r)=>n+Number(r.engines.original.ask)/100,0);
   return {trades:selected.length,roi:spent?pnl/spent:null,pnl};
  };
  const scored=candidates.map(g=>({...g,train:evaluate(training,g),holdout:evaluate(holdout,g)}));
  const eligible=scored.filter(g=>g.train.trades>=30&&g.holdout.trades>=15&&g.train.roi>0&&g.holdout.roi>0);
  eligible.sort((a,b)=>b.holdout.roi-a.holdout.roi);
  const chosen=eligible[0]||null;
  // Cross-engine mistake analysis: evaluate disagreement, abstentions, and loss patterns.
  // Analysis is retrospective and cannot silently change either engine's live rules.
  const breakdown={at:now,version:1,mode:'AUTOMATED PAPER RESEARCH',assets:{},entryBands:{},scoreBands:{},disagreements:{originalOnly:0,bothEntered:0},recentLosses:[],recommendations:[]};
  for(const row of resolved){
   const a=row.engines.original,b=row.engines.upgraded;
   const band=Number(a.ask)<45?'under45':Number(a.ask)<60?'45to59':'60plus';
   const scoreBand=Number(a.score)<75?'under75':Number(a.score)<85?'75to84':'85plus';
   for(const [target,key] of [[breakdown.assets,row.asset||'UNKNOWN'],[breakdown.entryBands,band],[breakdown.scoreBands,scoreBand]]){
    const v=target[key]||(target[key]={n:0,wins:0,losses:0,pnl:0});
    v.n++;v.wins+=a.won?1:0;v.losses+=a.won?0:1;v.pnl+=Number(a.pnl);
   }
   if(b?.resolved)breakdown.disagreements.bothEntered++;
   else breakdown.disagreements.originalOnly++;
   if(!a.won)breakdown.recentLosses.push({ticker:row.ticker,asset:row.asset,at:row.at,ask:a.ask,score:a.score,pnl:a.pnl,upgradedSkipped:!b?.resolved});
  }
  breakdown.recentLosses=breakdown.recentLosses.slice(-25);
  for(const [asset,v] of Object.entries(breakdown.assets)){
   v.pnl=Number(v.pnl.toFixed(4));
   if(v.n>=20&&v.pnl<0)breakdown.recommendations.push({type:'REVIEW_ASSET',asset,reason:asset+' has negative historical simulated returns over '+v.n+' observations; confirm on new outcomes before changing rules'});
  }
  for(const [band,v] of Object.entries(breakdown.entryBands)){
   v.pnl=Number(v.pnl.toFixed(4));
   if(v.n>=20&&v.pnl<0)breakdown.recommendations.push({type:'REVIEW_ENTRY_BAND',band,reason:'Negative simulated returns in '+band+' entry band; research only'});
  }
  await db.setJSON('comparison/mistake-analysis-v1',breakdown);
  // Durable lesson journal: one immutable outcome review per resolved contract.
  // Capture both engines' choices, including correctly avoided losing trades.
  for(const row of resolved.slice(-150)){
   const key='comparison/lessons/v1/'+row.ticker;
   if(await db.get(key,{type:'json'}))continue;
   const original=row.engines.original,upgraded=row.engines.upgraded;
   const upgradedEntered=upgraded?.resolved===true;
   const lesson={ticker:row.ticker,asset:row.asset,signalAt:row.at,verifiedAt:row.resolvedAt,
    officialOutcome:row.outcome,entry:{ask:original.ask,score:original.score,side:original.side},
    original:{entered:true,won:original.won,pnl:original.pnl},
    upgraded:{entered:upgradedEntered,won:upgradedEntered?upgraded.won:null,pnl:upgradedEntered?upgraded.pnl:null},
    interpretation:original.won?(upgradedEntered?'BOTH_CORRECT':'UPGRADED_MISSED_WIN'):(upgradedEntered?'BOTH_LOST':'UPGRADED_AVOIDED_LOSS'),
    source:'Official finalized binary market outcome; simulated ask entry, no fees/slippage',version:1};
   await db.setJSON(key,lesson);
  }
  const lessons=resolved.map(row=>({originalWon:row.engines.original.won,upgradedEntered:row.engines.upgraded?.resolved===true}));
  await db.setJSON('comparison/lesson-summary-v1',{at:now,total:lessons.length,bothWon:lessons.filter(x=>x.originalWon&&x.upgradedEntered).length,
   bothLost:lessons.filter(x=>!x.originalWon&&x.upgradedEntered).length,
   avoidedLosses:lessons.filter(x=>!x.originalWon&&!x.upgradedEntered).length,
   missedWins:lessons.filter(x=>x.originalWon&&!x.upgradedEntered).length,
   note:'Research labels are not independent model training; future outcomes determine whether proposed changes help.'});

  // Prospective candidate registration: freeze each proposal before future outcomes.
  // A candidate is never promoted from the same observations that selected it.
  const registryKey='comparison/prospective-candidate-v1';
  let registry=await db.get(registryKey,{type:'json'});
  if(!registry&&chosen){
   registry={createdAt:now,after:resolved.length,afterAt:now,gate:{score:chosen.score,maxAsk:chosen.maxAsk},status:'COLLECTING',version:1};
   await db.setJSON(registryKey,registry);
  }
  if(registry){
   const future=Number.isFinite(registry.afterAt)?resolved.filter(x=>x.at>registry.afterAt):resolved.slice(registry.after);
   const evalGate=evaluate(future,registry.gate);
   const baseline=evaluate(future,{score:0,maxAsk:100});
   const ready=future.length>=100&&evalGate.trades>=30;
   const better=ready&&evalGate.roi!==null&&baseline.roi!==null&&evalGate.roi>baseline.roi&&evalGate.pnl>0;
   const winsFor=(set,gate)=>{const selected=set.filter(r=>Number(r.engines.original.score)>=gate.score&&Number(r.engines.original.ask)<=gate.maxAsk);return {trades:selected.length,wins:selected.filter(r=>r.engines.original.won).length,losses:selected.filter(r=>!r.engines.original.won).length,winRate:selected.length?selected.filter(r=>r.engines.original.won).length/selected.length:null}};
   const candidateAccuracy=winsFor(future,registry.gate),baselineAccuracy=winsFor(future,{score:75,maxAsk:65});
   const accuracyImproved=ready&&candidateAccuracy.trades>=30&&baselineAccuracy.trades>=30&&candidateAccuracy.winRate>baselineAccuracy.winRate;
   const evaluation={at:now,version:1,accuracy:{candidate:candidateAccuracy,baseline:baselineAccuracy,improved:accuracyImproved,verified:ready&&candidateAccuracy.trades>=30&&baselineAccuracy.trades>=30,method:'Prospective official finalized market labels; selection effects and sample uncertainty remain'},status:ready?(better?'PASSED_RESEARCH_CHECK':'FAILED_RESEARCH_CHECK'):'COLLECTING',futureObservations:future.length,candidate:evalGate,baseline,gate:registry.gate,automaticExecution:false,automaticPromotion:false,notes:'Prospective holdout; no live strategy changes. Fees and slippage are not modeled, so paper promotion is disabled pending independent cost-aware validation.'};
   await db.setJSON('comparison/prospective-evaluation-v1',evaluation);
   // Automatic promotion affects simulated KaiBot entries only. The original stays unchanged.
   // Only allow a strictly tighter gate than the existing 75 score / 65c ceiling.
   const safe=Number(registry.gate.score)>=75&&Number(registry.gate.maxAsk)<=65;
   const activeKey='comparison/active-paper-gate-v1';
   const active=await db.get(activeKey,{type:'json'});
   // Gross hypothetical returns exclude fees, slippage and fill quality.
   // Preserve forward evaluation but block automatic paper gate activation.
   const independentCostValidation=false;
   if(independentCostValidation&&better&&safe&&!active){
    await db.setJSON(activeKey,{gate:registry.gate,activatedAt:now,afterAt:now,status:'ACTIVE',source:'prospective-verified',mode:'PAPER ONLY'});
   }else if(active?.status==='ACTIVE'){
    const post=resolved.filter(x=>x.at>active.afterAt);
    const candidatePost=evaluate(post,active.gate),baselinePost=evaluate(post,{score:75,maxAsk:65});
    if(post.length>=50&&(candidatePost.pnl<0||(candidatePost.trades>=15&&baselinePost.roi!==null&&candidatePost.roi<baselinePost.roi))){
     await db.setJSON(activeKey,{...active,status:'ROLLED_BACK',rolledBackAt:now,reason:'Negative or weaker forward paper performance'});
    }
   }

  }

  await db.setJSON('comparison/research-gate-v1',{
   at:now,mode:'RESEARCH ONLY',baseline:'original unchanged',trainingCount:training.length,holdoutCount:holdout.length,
   candidates:scored,proposed:chosen?{score:chosen.score,maxAsk:chosen.maxAsk}:null,
   note:'Uses past finalized observations; rolling holdout is reused for candidate selection and is not an independent final validation. No automatic execution or strategy promotion.'
  });

  const perAsset={};
  for(const asset of Object.keys(SERIES)){
   const am=assetModels[asset]||await db.get('training/model/'+asset,{type:'json'});
   if(am?.count)perAsset[asset]={count:am.count,brier:am.brier/am.count,baselineBrier:am.baselineBrier/am.count,validated:am.count>=40&&am.brier<am.baselineBrier};
  }
  await db.setJSON('training/status',{at:now,count:model.count,brier:model.count?model.brier/model.count:null,baselineBrier:model.count?model.baselineBrier/model.count:null,validated:model.count>=100&&model.brier<model.baselineBrier,perAsset,mode:'PAPER RESEARCH',method:'Prequential finalized-outcome calibration; per-asset models fall back to global model until sufficient history.'});
 }catch(e){console.error('Training update failed',String(e))}
 // Retention is enforced lazily by the read API; keys are minute buckets and bounded reads are used.
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};
