// Owner-only reads use the same encrypted credentials and paginated transport as execution.
import {owner,json,errorResponse,fail} from './lib/access.mjs';
import {runtime} from './lib/live-runtime.mjs';
export function createAccountSnapshot({getOwner=owner,getRuntime=runtime}={}){return async req=>{
 try{
  if(req.method!=='GET')fail(405,'Method not allowed');
  const user=await getOwner(),live=await getRuntime(user.id),client=await live.client();
  const snapshot=await client.snapshot();
  return json({connected:true,readOnly:true,liveOrdersEnabled:false,checkedAt:snapshot.at,balance:snapshot.balanceCents,
   positions:snapshot.positions.map(p=>({ticker:p.ticker,quantity:p.position_fp??p.position,
    realizedPnlDollars:p.realized_pnl_dollars??null,feesPaidDollars:p.fees_paid_dollars??null,
    marketExposureDollars:p.market_exposure_dollars??null})),
   positionsReturned:snapshot.positions.length,ordersReturned:snapshot.orders.length,
   fillsReturned:snapshot.fills.length,positionsHaveMore:false,ordersHaveMore:false,reconciled:false,
   note:'Complete paginated account reads. Realized P/L and fees are exchange-reported; unrealized P/L requires a fresh executable quote. Use VERIFY ACCOUNT & FILLS for bot reconciliation.'});
 }catch(e){return errorResponse(e)}
};}
export default createAccountSnapshot();
