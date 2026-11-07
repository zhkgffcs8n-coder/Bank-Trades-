// Bounded, read-only accounting of persisted OMEGA paper positions.
// No Kalshi order APIs, no owner credentials, no fabricated live fills.
import {getStore} from '@netlify/blobs';
import {blobWindow} from '../../src/blob-window.mjs';
import {SETTLEMENT_VERIFICATION} from '../../src/official-settlement.mjs';

const validMoney=x=>typeof x==='number'&&Number.isFinite(x);
const validTime=x=>Number.isSafeInteger(x)&&x>0;
export async function summarizeOmegaPaper(db,{limit=80}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>250)throw Error('Invalid paper scan limit');
 const page=await blobWindow(db,{prefix:'omega/paper/v1/',limit});
 const events=[];
 let open=0,closed=0,officiallySettled=0,invalid=0;
 for(const {key} of page.blobs){
  const ticker=key.slice('omega/paper/v1/'.length);
  if(!/^[A-Z0-9-]{3,100}$/.test(ticker)){invalid++;continue;}
  const stored=await db.get(key,{type:'json'});
  const p=stored?.state?.positions?.[ticker];
  if(!p||p.ticker!==ticker||p.roundId!==ticker||!['UP','DOWN'].includes(p.side)||
   !Number.isSafeInteger(p.quantity)||p.quantity<=0||!validMoney(p.entryCostDollars)||
   p.entryCostDollars<=0||!validTime(p.openedAtMs)){invalid++;continue;}
  if(p.status==='OPEN'){open++;continue;}
  if(!['CLOSED','SETTLED'].includes(p.status)||!validMoney(p.netDollars)){invalid++;continue;}
  const at=p.status==='CLOSED'?p.closedAtMs:p.settledAtMs;
  if(!validTime(at)||at<=p.openedAtMs){invalid++;continue;}
  // A simulated bid exit cannot return more than $1 per contract before costs.
  // Treat impossible stored profits as corrupt evidence, never as paper P&L.
  if(p.status==='CLOSED'&&p.netDollars>p.quantity-p.entryCostDollars+.00011){invalid++;continue;}
  if(p.status==='SETTLED'&&(
   p.settlementVerification!==SETTLEMENT_VERIFICATION||
   !['yes','no'].includes(p.outcome)||!validMoney(p.payoutDollars)||
   p.payoutDollars!==((p.side==='UP'&&p.outcome==='yes')||
    (p.side==='DOWN'&&p.outcome==='no')?p.quantity:0)||
   Math.abs(p.netDollars-(p.payoutDollars-p.entryCostDollars))>.00011
  )){invalid++;continue;}
  if(p.status==='SETTLED')officiallySettled++;
  else closed++;
  events.push({ticker,at,net:p.netDollars});
 }
 events.sort((a,b)=>a.at-b.at||a.ticker.localeCompare(b.ticker));
 let cumulative=0,peak=0,maxRealizedDrawdownDollars=0;
 for(const event of events){
  cumulative+=event.net;peak=Math.max(peak,cumulative);
  maxRealizedDrawdownDollars=Math.max(maxRealizedDrawdownDollars,peak-cumulative);
 }
 const complete=!page.cursor&&invalid===0;
 return {status:complete?'COMPLETE_INSPECTED_ARCHIVE':'INCOMPLETE_PAPER_HISTORY',
  inspectedPositions:page.blobs.length,historyTruncated:Boolean(page.cursor),invalidPositions:invalid,
  openPositions:open,simulatedBidExits:closed,officiallySettledPositions:officiallySettled,
  realizedPositions:events.length,
  realizedNetDollars:complete?Math.round(cumulative*10000)/10000:null,
  maxRealizedDrawdownDollars:complete?Math.round(maxRealizedDrawdownDollars*10000)/10000:null,
  ordersAuthorized:false,
  notice:'Paper-only modeled P&L from persisted positions, including recorded simulated entry/exit costs. Not actual Kalshi fills, not mark-to-market. Null totals mean incomplete or invalid archive; no performance claim.'};
}
export default async req=>{
 if(req.method!=='GET')return new Response(JSON.stringify({error:'GET only'}),{status:405,headers:{'content-type':'application/json'}});
 try{
  const db=getStore({name:'bank-trades-market-history',consistency:'strong'});
  return new Response(JSON.stringify(await summarizeOmegaPaper(db)),{headers:{'content-type':'application/json','cache-control':'no-store'}});
 }catch{
  return new Response(JSON.stringify({status:'UNAVAILABLE',realizedNetDollars:null,ordersAuthorized:false}),
   {status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }
};
