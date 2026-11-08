const endpoint='wss://advanced-trade-ws.coinbase.com';

export function appendPredatorTrades(tape,message,now){
 if(message?.channel!=='market_trades')return tape;
 const byId=new Map(tape.filter(row=>row.time>=now-15000).map(row=>[row.id,row]));
 for(const event of message.events||[]){
  if(event.type!=='update'&&event.type!=='snapshot')continue;
  for(const row of event.trades||[]){
   const time=Date.parse(row.time),price=Number(row.price),size=Number(row.size);
   if(row.product_id!=='BTC-USD'||!row.trade_id||byId.has(row.trade_id)||
    !(time>=now-15000&&time<=now&&price>0&&size>0)||
    ![price,size].every(Number.isFinite)||!['BUY','SELL'].includes(row.side))continue;
   byId.set(row.trade_id,{id:row.trade_id,time,price,flow:row.side==='SELL'?size:-size});
  }
 }
 return [...byId.values()].sort((a,b)=>a.time-b.time).slice(-5000);
}

export function openPredatorTape({Socket=WebSocket,clock=Date.now,onTrades}={}){
 let socket,tape=[],stopped=false,retry,attempts=0,errors=0,lastReceivedAt=null,connectedAt=null;
 let generation=0;
 function connect(){
  if(stopped)return;
  attempts++;generation++;
  const ws=new Socket(endpoint);
  socket=ws;
  ws.addEventListener('open',()=>{
   if(stopped||ws!==socket)return;
   connectedAt=clock();
   ws.send(JSON.stringify({type:'subscribe',channel:'market_trades',product_ids:['BTC-USD']}));
  });
  ws.addEventListener('message',event=>{
   if(stopped||ws!==socket)return;
   try{
    const message=JSON.parse(event.data);
    const next=appendPredatorTrades(tape,message,clock());
    const changed=next.at(-1)?.id&&next.at(-1)?.id!==tape.at(-1)?.id;
    if(changed)lastReceivedAt=clock();
    tape=next;
    if(changed)onTrades?.(tape,lastReceivedAt);
   }catch{errors++}
  });
  ws.addEventListener('error',()=>{errors++});
  ws.addEventListener('close',()=>{
   if(stopped||ws!==socket)return;
   tape=[];connectedAt=null;lastReceivedAt=null;
   retry=setTimeout(connect,Math.min(4000,500*2**Math.min(attempts,3)));
  });
 }
 connect();
 return {snapshot(){
  if(socket?.readyState===1&&clock()-(lastReceivedAt??connectedAt??clock())>6500)socket.close();
  return {tape:[...tape],attempts,errors,connectedAt,lastReceivedAt,generation};
 },close(){stopped=true;clearTimeout(retry);socket?.close()}};
}
