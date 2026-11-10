export function eligibleDemoLifecycleMarket(m,excluded,now=Date.now()){
 return m.exchange_index===0&&m.status==='active'&&m.market_type==='binary'&&
   !excluded.includes(m.ticker)&&Date.parse(m.close_time)>now+300000&&['yes','no'].every(side=>{
    const ask=Number(m[side+'_ask_dollars']),bid=Number(m[side+'_bid_dollars']);
    return ask>=.1&&ask<=.8&&bid>0&&ask>=bid&&ask-bid<=.05;
   });
}

// Bound discovery per scheduled invocation. Stop early when an eligible market is found.
export async function findDemoLifecycleMarket(client,excluded,clock=Date.now){
 const seen=new Set();
 let cursor='';
 for(let page=0;page<4;page++){
  const query=new URLSearchParams({status:'open',limit:'100',mve_filter:'exclude'});
  if(cursor)query.set('cursor',cursor);
  const result=await client.request('GET','/trade-api/v2/markets?'+query);
  if(!Array.isArray(result?.markets))throw Error('DEMO_MARKET_LIST_INVALID');
  const market=result.markets.find(m=>eligibleDemoLifecycleMarket(m,excluded,clock()));
  if(market)return market;
  if(!result.cursor)return null;
  if(seen.has(result.cursor))throw Error('DEMO_MARKET_CURSOR_LOOP');
  seen.add(result.cursor);
  cursor=result.cursor;
 }
 return null;
}

/**
 * Diagnostic-only classification of the existing Demo eligibility gate.
 * Do not relax the executable-market predicate or substitute a different ticker.
 * Return only fixed, non-sensitive reason codes.
 */
export function demoLifecycleMarketRejection(m,excluded,now=Date.now()){
 if(!m)return 'DEMO_MARKET_NOT_FOUND';
 if(m.exchange_index!==0)return 'DEMO_MARKET_NONDEFAULT_EXCHANGE';
 if(m.status!=='active')return 'DEMO_MARKET_INACTIVE';
 if(m.market_type!=='binary')return 'DEMO_MARKET_NOT_BINARY';
 if(excluded.includes(m.ticker))return 'DEMO_MARKET_ALREADY_USED';
 if(!(Date.parse(m.close_time)>now+300000))return 'DEMO_MARKET_CLOSING_SOON';
 for(const side of ['yes','no']){
  const ask=Number(m[side+'_ask_dollars']),bid=Number(m[side+'_bid_dollars']);
  if(!(ask>=.1&&ask<=.8))return 'DEMO_MARKET_ASK_OUT_OF_RANGE';
  if(!(bid>0))return 'DEMO_MARKET_BID_UNAVAILABLE';
  if(!(ask>=bid&&ask-bid<=.05))return 'DEMO_MARKET_SPREAD_UNSAFE';
 }
 return null;
}
