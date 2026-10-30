const SERIES={
  BTC:'KXBTC15M',ETH:'KXETH15M',SOL:'KXSOL15M',XRP:'KXXRP15M',
  DOGE:'KXDOGE15M',BNB:'KXBNB15M',HYPE:'KXHYPE15M',ZEC:'KXZEC15M'
};

const reply=(code,obj)=>({
  statusCode:code,
  headers:{
    'Content-Type':'application/json',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'
  },
  body:JSON.stringify(obj)
});

async function get(url,timeout=7000){
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{
      signal:c.signal,
      headers:{Accept:'application/json'}
    });
    if(!r.ok) throw Error('Upstream HTTP '+r.status);
    return await r.json();
  }finally{
    clearTimeout(t);
  }
}

const base='https://api.elections.kalshi.com/trade-api/v2';

function nearestExpiry(m,now){
  const fields=[
    m.expected_expiration_time,
    m.expiration_time,
    m.close_time
  ];

  const future=fields
    .map(x=>Date.parse(x))
    .filter(x=>Number.isFinite(x)&&x>now)
    .sort((a,b)=>a-b);

  return future[0]||null;
}

exports.handler=async event=>{
  if(event.httpMethod!=='GET') return reply(405,{error:'GET only'});

  const q=event.queryStringParameters||{};

  try{
    if(q.mode==='outcomes'){
      const tickers=[...new Set(String(q.tickers||'').split(','))];
      if(!tickers.length||tickers.length>8||tickers.some(t=>!/^[A-Z0-9-]{6,100}$/.test(t)||!Object.values(SERIES).some(s=>t.startsWith(s+'-'))))return reply(400,{error:'Invalid supported market tickers'});
      const results=await Promise.all(tickers.map(async ticker=>{
        try{
          const {market:m}=await get(base+'/markets/'+encodeURIComponent(ticker));
          if(m?.ticker!==ticker)throw Error('Mismatched market');
          const value=Number(m.settlement_value_dollars),result=m.result;
          const finalized=m.settlement_value_dollars!=null&&m.status==='finalized'&&m.market_type==='binary'&&m.is_provisional!==true&&['yes','no'].includes(result)&&Number.isFinite(Date.parse(m.settlement_ts))&&value===(result==='yes'?1:0);
          return {ticker,finalized,result:finalized?result:null,settledAt:finalized?m.settlement_ts:null};
        }catch{return {ticker,finalized:false,result:null,error:'Outcome unavailable'};}
      }));
      return reply(200,{fetched_at:new Date().toISOString(),source:'Kalshi finalized market records',results});
    }
    if((q.mode||'markets')==='markets'){
      const results=await Promise.all(
        Object.entries(SERIES).map(async([asset,series])=>{
          try{
            const u=base+'/markets?'+new URLSearchParams({
              series_ticker:series,
              status:'open',
              limit:'100'
            });

            const d=await get(u);
            const now=Date.now();

            const arr=(d.markets||[])
              .map(m=>{
                const expiry=nearestExpiry(m,now);
                return {
                  ...m,
                  expires_at:expiry ? new Date(expiry).toISOString() : null
                };
              })
              .filter(m=>{
                if(!m.expires_at) return false;

                const remaining=Date.parse(m.expires_at)-now;

                return (
                  (m.status==='active'||m.status==='open') &&
                  remaining>0 &&
                  remaining<=16*60*1000
                );
              })
              .sort(
                (a,b)=>Date.parse(a.expires_at)-Date.parse(b.expires_at)
              );

            return {
              asset,
              series,
              market:arr[0]||null,
              available:true
            };

          }catch(e){
            return {
              asset,
              series,
              market:null,
              available:false,
              error:String(e.message).slice(0,100)
            };
          }
        })
      );

      return reply(200,{
        source:'Kalshi public API',
        fetched_at:new Date().toISOString(),
        results
      });
    }

    if(q.mode==='candles'){
      const asset=String(q.asset||'').toUpperCase(),ticker=String(q.ticker||'');
      if(!SERIES[asset]||!ticker.startsWith(SERIES[asset]+'-')||!/^[A-Z0-9-]{6,100}$/.test(ticker))return reply(400,{error:'Invalid market'});
      const end=Math.floor(Date.now()/1000),start=end-3600;
      const params=new URLSearchParams({start_ts:String(start),end_ts:String(end),period_interval:'1'});
      const d=await get(base+'/series/'+encodeURIComponent(SERIES[asset])+'/markets/'+encodeURIComponent(ticker)+'/candlesticks?'+params);
      return reply(200,{ticker,fetched_at:new Date().toISOString(),period_minutes:1,source:'Kalshi contract candles',candlesticks:d.candlesticks||[]});
    }
    if(q.mode==='signals'){
      const {rankMarkets}=require('./signal-engine.cjs');
      const results=await Promise.all(Object.entries(SERIES).map(async([asset,series])=>{
        try{
          const url=base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',limit:'100'});
          const d=await get(url);
          const now=Date.now();
          const markets=(d.markets||[]).map(m=>{
            const expiry=nearestExpiry(m,now);
            return {...m,expires_at:expiry?new Date(expiry).toISOString():null};
          }).filter(m=>m.expires_at&&Date.parse(m.expires_at)>now&&Date.parse(m.expires_at)-now<=16*60*1000);
          return {asset,series,signals:rankMarkets(markets,now),error:null};
        }catch(e){return {asset,series,signals:[],error:String(e.message).slice(0,100)};}
      }));
      return reply(200,{source:'Kalshi public API',fetched_at:new Date().toISOString(),
        research_only:true,calibrated_probabilities:false,results});
    }

    if(q.mode==='commodities'){
      // Search live Kalshi events by commodity keywords rather than assuming series tickers.
      const names=['GOLD','SILVER','PLATINUM','PALLADIUM','COPPER','OIL','NATURAL GAS'];
      const matches=[];
      let cursor='';
      for(let page=0;page<2;page++){
        const params=new URLSearchParams({status:'open',limit:'200',with_nested_markets:'true'});
        if(cursor)params.set('cursor',cursor);
        const data=await get(base+'/events?'+params.toString(),4500);
        for(const e of data.events||[]){
          const title=String(e.title||'');
          const hit=names.find(n=>new RegExp('\\b'+n.replace(' ','\\s+')+'\\b','i').test(title));
          if(!hit)continue;
          const markets=(e.markets||[]).filter(m=>m.status==='active'||m.status==='open').map(m=>({
            ticker:m.ticker,title:m.title,yes_bid:m.yes_bid,yes_ask:m.yes_ask,
            no_bid:m.no_bid,no_ask:m.no_ask,close_time:m.close_time,
            expiration_time:m.expiration_time,volume:m.volume
          }));
          if(markets.length)matches.push({commodity:hit,event_ticker:e.event_ticker,title,markets});
        }
        cursor=data.cursor||'';
        if(!cursor)break;
      }
      return reply(200,{source:'Kalshi public events API',fetched_at:new Date().toISOString(),
        search_scope:'First 400 currently open events; results are not exhaustive',
        commodities:names,events:matches,research_only:true});
    }

    if(q.mode==='orderbook'){
      const ticker=String(q.ticker||'');

      if(!/^[A-Z0-9-]{6,100}$/.test(ticker))
        return reply(400,{error:'Invalid ticker'});

      const d=await get(
        base+'/markets/'+encodeURIComponent(ticker)+'/orderbook?depth=10'
      );

      return reply(200,{
        fetched_at:new Date().toISOString(),
        orderbook:d.orderbook||d
      });
    }

    if(q.mode==='spot'){
      const asset=String(q.asset||'').toUpperCase();

      if(!SERIES[asset])
        return reply(400,{error:'Invalid asset'});

      const d=await get(
        'https://api.coinbase.com/v2/prices/'+asset+'-USD/spot',
        5000
      );

      const price=Number(d?.data?.amount);

      if(!Number.isFinite(price)||price<=0)
        throw Error('Spot unavailable');

      return reply(200,{
        asset,
        price,
        fetched_at:new Date().toISOString(),
        source:'Coinbase spot (not Kalshi settlement oracle)'
      });
    }

    return reply(404,{error:'Unknown mode'});

  }catch(e){
    return reply(502,{
      error:'Feed unavailable',
      detail:String(e.message).slice(0,150)
    });
  }
};
