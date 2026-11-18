import {createServer} from 'node:http';

export function createBtcQuoteRelay({origins=['https://neon-gecko-046bff.netlify.app'], now=Date.now}={}){
 const clients=new Set();
 let latest=null;
 function send(response,event,payload){
  if(!response.write('event: '+event+'\ndata: '+JSON.stringify(payload)+'\n\n'))response.destroy();
 }
 function broadcast(event,payload){
  for(const response of clients)send(response,event,payload);
 }
 function reset(){
  if(!latest)return;
  latest=null;
  broadcast('unavailable',{});
 }
 const server=createServer((request,response)=>{
  if(request.method!=='GET'||request.url!=='/btc-quotes'){
   response.writeHead(404).end();
   return;
  }
  const origin=request.headers.origin;
  if(origin&&!origins.includes(origin)){
   response.writeHead(403).end();
   return;
  }
  if(clients.size>=250){
   response.writeHead(503).end();
   return;
  }
  response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform',
   'X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})});
  response.flushHeaders();
  clients.add(response);
  response.on('close',()=>clients.delete(response));
  if(latest&&now()-latest.receivedAt<=10000&&latest.expiresAt>now())send(response,'quote',latest);
  else send(response,'unavailable',{});
 });
 return {
  server,
  publish(update,expiresAt){
   if(update.status!=='READY'||!update.ticker.startsWith('KXBTC15M-')||!(expiresAt>now()))return;
   latest={ticker:update.ticker,yesBid:Math.round(update.yes.price*10000)/100,
    noBid:Math.round(update.no.price*10000)/100,receivedAt:update.receivedAt,eventAt:update.eventAt,expiresAt};
   broadcast('quote',latest);
  },
  reset,
  close(){
   for(const response of clients)response.end();
   server.close();
  }
 };
}
