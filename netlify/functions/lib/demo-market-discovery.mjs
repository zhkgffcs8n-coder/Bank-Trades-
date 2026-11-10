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
