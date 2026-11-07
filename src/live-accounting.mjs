const dayOf=at=>new Date(at).toISOString().slice(0,10);
const numeric=(value,label)=>{if(value===null||value===undefined||value==='')throw Error('MISSING_'+label);const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error('INVALID_'+label);return n;};
export function settlementFor(snapshot,ticker,qty){
 const matches=(snapshot.settlements||[]).filter(x=>x.ticker===ticker);
 if(!matches.length)return null;
 if(matches.length!==1)throw Error('DUPLICATE_SETTLEMENT');const s=matches[0];
 const yes=numeric(s.yes_count_fp,'SETTLEMENT_YES'),no=numeric(s.no_count_fp,'SETTLEMENT_NO');
 if(Math.abs(yes-no-qty)>1e-7||!['yes','no'].includes(s.market_result)||!Number.isFinite(Date.parse(s.settled_time)))throw Error('SETTLEMENT_MISMATCH');
 const revenue=numeric(s.revenue,'SETTLEMENT_REVENUE');
 if(Math.abs(revenue-(s.market_result==='yes'?yes:no)*100)>1e-7)throw Error('SETTLEMENT_REVENUE_MISMATCH');return s;
}
// Gains never replenish this conservative daily risk budget. Open cost is reserved in full.
export function accountRisk(state,snapshot,now=Date.now()){
 const today=dayOf(now),trades=new Map();let dailyLossCents=0;
 const unique=new Map();for(const f of snapshot.fills){const id=f.fill_id||f.trade_id;if(!id)throw Error('FILL_ID_MISSING');if(unique.has(id)&&JSON.stringify(unique.get(id))!==JSON.stringify(f))throw Error('CONFLICTING_FILL');unique.set(id,f);}
 for(const i of state.intents){
  if(i.status==='ABORTED')continue;
  if(i.status!=='RECONCILED')throw Error('UNRECONCILED_RISK');
  let t=trades.get(i.ticker);if(!t){t={ticker:i.ticker,side:i.side,qty:0,cost:0};trades.set(i.ticker,t);}
  if(t.side!==i.side)throw Error('UNEXPECTED_SIDE_CHANGE');
  const fs=[...unique.values()].filter(f=>f.order_id===i.orderId).sort((a,b)=>Date.parse(a.created_time)-Date.parse(b.created_time));
  for(const f of fs){
   if((f.ticker||f.market_ticker)!==i.ticker)throw Error('FILL_TICKER_MISMATCH');
   const qty=numeric(f.count_fp??f.count,'FILL_QUANTITY'),at=Date.parse(f.created_time);
   if(!qty||!Number.isFinite(at)||at>now)throw Error('INVALID_FILL_TIME_OR_QUANTITY');
   const yes=numeric(f.yes_price_dollars,'YES_FILL_PRICE');if(yes>1)throw Error('INVALID_FILL_PRICE');
   const cost=qty*(i.side==='up'?yes:1-yes)*100,fees=numeric(f.fee_cost,'FILL_FEES')*100;
   if(i.action==='buy'){t.qty+=qty;t.cost+=cost+fees;}
   else{if(qty>t.qty+1e-7)throw Error('SELL_WITHOUT_FILL');const basis=t.cost*qty/t.qty,pnl=cost-fees-basis;t.qty=Math.max(0,t.qty-qty);t.cost=Math.max(0,t.cost-basis);if(dayOf(at)===today)dailyLossCents+=Math.max(0,-pnl);}
  }
 }
 for(const t of trades.values()){
  const settlement=settlementFor(snapshot,t.ticker,t.side==='up'?t.qty:-t.qty);
  if(settlement){const pnl=Number(settlement.revenue)-t.cost-numeric(settlement.fee_cost,'SETTLEMENT_FEES')*100;if(dayOf(Date.parse(settlement.settled_time))===today)dailyLossCents+=Math.max(0,-pnl);t.qty=0;t.cost=0;}
 }
 const open=[...trades.values()].filter(t=>t.qty>0).map(t=>({...t,entryCents:t.cost/t.qty}));
 const openCostCents=open.reduce((sum,p)=>sum+p.cost,0);
 return {day:today,dailyLossCents:Math.ceil(dailyLossCents-1e-7),openCostCents:Math.ceil(openCostCents-1e-7),open};
}
