export function eligibleDemoLifecycleMarket(m,excluded,now=Date.now()){
 return m.exchange_index===0&&m.status==='active'&&m.market_type==='binary'&&
   !excluded.includes(m.ticker)&&Date.parse(m.close_time)>now+300000&&['yes','no'].every(side=>{
    const ask=Number(m[side+'_ask_dollars']),bid=Number(m[side+'_bid_dollars']);
    return ask>=.1&&ask<=.8&&bid>0&&ask>=bid&&ask-bid<=.05;
   });
}

// Bound discovery per scheduled invocation. Stop early when an eligible market is found.
export async function findDemoLifecycleMarket(client,excluded,clock=Date.now,onRejection=()=>{},testSide){
 const seen=new Set(),reasons=new Map();
 const noMarket=()=>{
  const mostCommon=[...reasons].sort((a,b)=>b[1]-a[1])[0];
  onRejection(mostCommon?.[0]??'DEMO_MARKET_NOT_FOUND');
  return null;
 };
 let cursor='';
 for(let page=0;page<4;page++){
  const query=new URLSearchParams({status:'open',limit:'400',mve_filter:'exclude'});
  if(cursor)query.set('cursor',cursor);
  const result=await client.request('GET','/trade-api/v2/markets?'+query);
  if(!Array.isArray(result?.markets))throw Error('DEMO_MARKET_LIST_INVALID');
  const market=result.markets.find(m=>testSide?
   !demoLifecycleMarketRejection(m,excluded,clock(),testSide):eligibleDemoLifecycleMarket(m,excluded,clock()));
  if(market)return market;
  for(const candidate of result.markets){
   const reason=demoLifecycleMarketRejection(candidate,excluded,clock(),testSide);
   if(reason)reasons.set(reason,(reasons.get(reason)||0)+1);
  }
  if(!result.cursor)return noMarket();
  if(seen.has(result.cursor))throw Error('DEMO_MARKET_CURSOR_LOOP');
  seen.add(result.cursor);
  cursor=result.cursor;
 }
 return noMarket();
}

/**
 * Diagnostic-only classification of the existing Demo eligibility gate.
 * Do not relax the executable-market predicate or substitute a different ticker.
 * Return only fixed, non-sensitive reason codes.
 */
export function demoLifecycleMarketRejection(m,excluded,now=Date.now(),testSide){
 if(!m)return 'DEMO_MARKET_NOT_FOUND';
 if(m.exchange_index==null)return 'DEMO_MARKET_EXCHANGE_INDEX_MISSING';
 if(!Number.isSafeInteger(m.exchange_index)||m.exchange_index<0)return 'DEMO_MARKET_EXCHANGE_INDEX_INVALID';
 if(m.exchange_index!==0)return 'DEMO_MARKET_NONDEFAULT_EXCHANGE';
 if(m.status!=='active')return 'DEMO_MARKET_INACTIVE';
 if(m.market_type!=='binary')return 'DEMO_MARKET_NOT_BINARY';
 if(excluded.includes(m.ticker))return 'DEMO_MARKET_ALREADY_USED';
 if(!(Date.parse(m.close_time)>now+300000))return 'DEMO_MARKET_CLOSING_SOON';
 for(const side of testSide?[testSide==='DOWN'?'no':'yes']:['yes','no']){
  const ask=Number(m[side+'_ask_dollars']),bid=Number(m[side+'_bid_dollars']);
  if(!(ask>=(testSide ? .01:.1)&&ask<=(testSide ? .90:.8)))return 'DEMO_MARKET_ASK_OUT_OF_RANGE';
  if(!(bid>0))return 'DEMO_MARKET_BID_UNAVAILABLE';
  if(!(ask>=bid&&ask-bid<=.05))return 'DEMO_MARKET_SPREAD_UNSAFE';
 }
 return null;
}
