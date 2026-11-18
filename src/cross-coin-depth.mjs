import WebSocket from 'ws';
import {signedHeaders} from '../netlify/functions/lib/kalshi-execution-client.mjs';
import {createKalshiDepth} from './kalshi-depth-stream.mjs';

const assets=['ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'];
export function startCrossCoinDepth(credentials,get,relay){
 const markets=new Map();
 let socket=null,lastMessageAt=0,busy=false,stopped=false;
 function disconnect(){
  const old=socket;
  socket=null;
  for(const market of markets.values())relay.resetCross(market.ticker);
  old?.terminate();
 }
 async function maintain(){
  if(stopped||busy||!credentials)return;
  busy=true;
  try{
   const now=Date.now();
   const missing=assets.filter(asset=>!(markets.get(asset)?.close>now));
   if(missing.length){
    const found=await Promise.all(missing.map(async asset=>{
     const series='KX'+asset+'15M';
     try{
      const data=await get('/markets?series_ticker='+series+'&status=open&limit=20');
      const rows=data.markets.map(m=>({ticker:m.ticker,close:Date.parse(m.close_time)}))
       .filter(m=>m.ticker.startsWith(series+'-')&&m.close>now&&m.close<=now+900000);
      return rows.sort((a,b)=>a.close-b.close)[0];
     }catch{return null;}
    }));
    if(stopped)return;
    if(found.some(Boolean)||missing.some(asset=>markets.has(asset))){
     disconnect();
     missing.forEach((asset,i)=>found[i]?markets.set(asset,found[i]):markets.delete(asset));
    }
   }
   if(socket&&Date.now()-lastMessageAt>15000)disconnect();
   if(socket||!markets.size)return;
   const books=new Map([...markets.values()].map(m=>[m.ticker,{...m,depth:createKalshiDepth(m.ticker),sequence:0}]));
   const ws=new WebSocket('wss://external-api-ws.kalshi.com/trade-api/ws/v2',{
    headers:signedHeaders(credentials,'GET','/trade-api/ws/v2'),handshakeTimeout:5000
   });
   socket=ws;
   lastMessageAt=Date.now();
   let sequence=null;
   ws.on('open',()=>{
    ws.send(JSON.stringify({id:1,cmd:'subscribe',params:{channels:['orderbook_delta'],market_tickers:[...books.keys()]}}));
   });
   ws.on('message',bytes=>{
    if(ws!==socket)return;
    try{
     const frame=JSON.parse(bytes);
     if(frame.type==='error'){disconnect();return;}
     if(!['orderbook_snapshot','orderbook_delta'].includes(frame.type))return;
     if(!Number.isInteger(frame.seq)||(sequence!==null&&frame.seq!==sequence+1)){disconnect();return;}
     sequence=frame.seq;
     lastMessageAt=Date.now();
     const market=books.get(frame.msg?.market_ticker);
     if(!market)return;
     // The exchange sequences the entire subscription. Each validated book sees its own contiguous frames.
     const update=market.depth.apply({...frame,seq:++market.sequence},lastMessageAt);
     if(update.status==='GAP'){disconnect();return;}
     if(update.status==='INVALID_BOOK')relay.resetCross(market.ticker);
     if(update.status==='READY')relay.publishCross(update,market.close);
    }catch{disconnect();}
   });
   ws.on('error',()=>{});
   ws.on('close',()=>{if(ws===socket)disconnect();});
  }finally{busy=false;}
 }
 const timer=setInterval(()=>void maintain(),3000);
 void maintain();
 return ()=>{stopped=true;clearInterval(timer);disconnect();};
}
