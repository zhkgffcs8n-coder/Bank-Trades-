import {createServer} from 'node:http';

export function createBtcQuoteRelay({origins=['https://neon-gecko-046bff.netlify.app'], now=Date.now}={}){
 const clients=new Set(),crossClients=new Set(),crossQuotes=new Map();
 let latest=null;
 function send(response,event,payload){
  if(!response.write('event: '+event+'\ndata: '+JSON.stringify(payload)+'\n\n'))response.destroy();
 }
 function broadcast(event,payload){
  for(const response of clients)send(response,event,payload);
 }
 function hasFreshStream(ticker){
  return latest?.ticker===ticker&&latest.source!=='REST'&&now()-latest.receivedAt<=1500;
 }
 function reset(){
  if(!latest)return;
  resetCross(latest.ticker);
  latest=null;
  broadcast('unavailable',{});
 }
 function resetCross(ticker){
  if(crossQuotes.delete(ticker))for(const response of crossClients)send(response,'unavailable',{ticker});
 }
 function publishCross(update,expiresAt){
  if(update.status!=='READY'||!(expiresAt>now()))return;
  const quote={ticker:update.ticker,yesBid:Math.round(update.yes.price*10000)/100,
   noBid:Math.round(update.no.price*10000)/100,receivedAt:update.receivedAt,eventAt:update.eventAt,expiresAt};
  const old=crossQuotes.get(quote.ticker);
  if(old&&old.yesBid===quote.yesBid&&old.noBid===quote.noBid&&quote.receivedAt-old.receivedAt<800)return;
  crossQuotes.set(quote.ticker,quote);
  for(const response of crossClients)send(response,'quote',quote);
 }
 const server=createServer((request,response)=>{
  const cross=request.url==='/cross-coin-quotes';
  if(request.method!=='GET'||(!cross&&request.url!=='/btc-quotes')){
   response.writeHead(404).end();
   return;
  }
  const origin=request.headers.origin;
  if(origin&&!origins.includes(origin)){
   response.writeHead(403).end();
   return;
  }
  if((cross?crossClients:clients).size>=250){
   response.writeHead(503).end();
   return;
  }
  response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform',
   'X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})});
  response.flushHeaders();
  if(cross){
   crossClients.add(response);
   response.on('close',()=>crossClients.delete(response));
   response.write(': connected\n\n');
   for(const q of crossQuotes.values())if(q.expiresAt>now()&&now()-q.receivedAt<=1800)send(response,'quote',q);
   return;
  }
  clients.add(response);
  response.on('close',()=>clients.delete(response));
  if(latest&&now()-latest.receivedAt<=10000&&latest.expiresAt>now())send(response,'quote',latest);
  else send(response,'unavailable',{});
 });
 return {
  server,publishCross,resetCross,
  hasFreshStream,
  publishRest(depth,expiresAt){
   if(!(expiresAt>now())||now()-depth.at>1000||hasFreshStream(depth.ticker))return;
   latest={ticker:depth.ticker,yesBid:Math.round(depth.yes.price*10000)/100,
    noBid:Math.round(depth.no.price*10000)/100,receivedAt:depth.at,eventAt:null,expiresAt,source:'REST'};
   broadcast('quote',latest);
  },
  resetStream(){
   if(latest?.source!=='REST')reset();
  },
  publish(update,expiresAt){
   if(update.status!=='READY'||!update.ticker.startsWith('KXBTC15M-')||!(expiresAt>now()))return;
   publishCross(update,expiresAt);
   latest={ticker:update.ticker,yesBid:Math.round(update.yes.price*10000)/100,
    noBid:Math.round(update.no.price*10000)/100,receivedAt:update.receivedAt,eventAt:update.eventAt,expiresAt};
   broadcast('quote',latest);
  },
  reset,
  close(){
   for(const response of [...clients,...crossClients])response.end();
   server.close();
  }
 };
}
