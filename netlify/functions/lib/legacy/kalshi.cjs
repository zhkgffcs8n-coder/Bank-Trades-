// Public read-only Kalshi market-data proxy. No private account keys.
exports.handler = async (event) => {
  const headers = {'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
  if (event.httpMethod === 'OPTIONS') return {statusCode:204,headers,body:''};
  if (event.httpMethod !== 'GET') return {statusCode:405,headers,body:JSON.stringify({error:'GET only'})};
  const pathname = '/' + (event.queryStringParameters?.resource || '');
  if (!['/markets','/series'].includes(pathname)) return {statusCode:404,headers,body:JSON.stringify({error:'Endpoint not allowed'})};
  const params = new URLSearchParams(event.queryStringParameters || {});
  for (const key of params.keys()) if (!['series_ticker','status','limit','cursor','_','resource'].includes(key)) params.delete(key);
  if(pathname==='/markets' && !/^[A-Z0-9-]{2,50}$/.test(params.get('series_ticker')||'')) return {statusCode:400,headers,body:JSON.stringify({error:'series_ticker required'})};
  const limit = Number(params.get('limit') || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) params.set('limit','20');
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 7000);
    let response;
    try { response = await fetch(`https://api.elections.kalshi.com/trade-api/v2${pathname}?${params.toString()}`,{headers:{Accept:'application/json'},signal:controller.signal}); }
    finally { clearTimeout(timeout); }
    const body = await response.text();
    return {statusCode:response.status,headers,body:body.slice(0,2000000)};
  } catch (e) { return {statusCode:502,headers,body:JSON.stringify({error:'Live Kalshi feed unavailable; retry shortly'})}; }
};
