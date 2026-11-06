// Read-only engine committee bridge. All three consume one timestamped market snapshot.
// No trading authorization and no claims of validated accuracy.
import {buildCommitteeSnapshot,evaluateTeam} from './engine-team.mjs';
import {analyzeBrain} from './primal-shadow-brain.mjs';
import {evaluateOmegaFusion} from './omega-fusion.mjs';
export function reviewSharedRound({market,records=[],nowMs=Date.now(),forecasts=[],marketBaseline}={}){
 const safeMarket=market&&typeof market==='object'?market:{};
 const snapshot=buildCommitteeSnapshot(safeMarket,records,nowMs);
 const spider=snapshot.status==='READY'?evaluateTeam(snapshot):{status:'MISSING_INPUT',missing:snapshot.missing||[]};
 const primal=analyzeBrain(safeMarket,records,nowMs);
 const omega=market?.ticker?evaluateOmegaFusion({marketTicker:market.ticker,roundId:market.ticker,nowMs,forecasts,marketBaseline}):{status:'MISSING_INPUT'};
 return {ticker:market?.ticker||null,reviewedAtMs:nowMs,spider,primal,omega,
  sharedObservation:true,ordersAuthorized:false,automaticPromotion:false};
}
