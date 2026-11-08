export function createKalshiDepth(ticker){
 let book=null,seq=null,sid=null;
 const clear=()=>{book=null;seq=null;sid=null;};
 return {clear,apply(frame,receivedAt){
  const {type,msg}=frame;
  if(!['orderbook_snapshot','orderbook_delta'].includes(type))return {status:'IGNORED'};
  if(msg?.market_ticker!==ticker||!Number.isInteger(frame.seq)||!Number.isInteger(frame.sid)){
   clear();return {status:'GAP'};
  }
  if(type==='orderbook_snapshot'){
   if(!Array.isArray(msg.yes_dollars_fp)||!Array.isArray(msg.no_dollars_fp)){
    clear();return {status:'GAP'};
   }
   book={yes:new Map(),no:new Map()};
   for(const side of ['yes','no']){
    for(const [rawPrice,rawSize] of msg[side+'_dollars_fp']){
     const price=Number(rawPrice),size=Number(rawSize);
     if(!(price>0&&price<1&&Number.isFinite(size)&&size>0)){clear();return {status:'GAP'};}
     book[side].set(price,size);
    }
   }
  }else{
   const price=Number(msg.price_dollars),delta=Number(msg.delta_fp);
   if(!book||sid!==frame.sid||frame.seq!==seq+1||!['yes','no'].includes(msg.side)||
      !(price>0&&price<1)||!Number.isFinite(delta)){clear();return {status:'GAP'};}
   const levels=book[msg.side],size=(levels.get(price)||0)+delta;
   if(size<-.000001){clear();return {status:'GAP'};}
   if(size<=.000001)levels.delete(price);else levels.set(price,size);
  }
  seq=frame.seq;sid=frame.sid;
  const best=side=>{
   let price=0;
   for(const level of book[side].keys())if(level>price)price=level;
   return price?{price,size:book[side].get(price)}:null;
  };
  const yes=best('yes'),no=best('no');
  if(!yes||!no||yes.price+no.price>=1)return {status:'INVALID_BOOK'};
  const eventAt=type==='orderbook_delta'?msg.ts_ms:null;
  return {status:'READY',ticker,yes,no,receivedAt,eventAt:Number.isFinite(eventAt)?eventAt:null};
 }};
}
