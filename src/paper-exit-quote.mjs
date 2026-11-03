// Conservative eligibility check for scheduled PAPER-only early exits.
// A market snapshot is not a guaranteed executable fill. Never simulate an
// exit using a different contract, an expired market, or corrupt ledger data.
// Reject coercible malformed quote fields (empty strings, booleans, hex, etc.).
// A paper exit must not pay simulated cash from an untrustworthy market quote.
const decimal=v=>typeof v==='number'&&Number.isFinite(v)?v:
 typeof v==='string'&&/^(?:0|[1-9]\\d*)(?:\\.\\d+)?$/.test(v)?Number(v):NaN;
const quoteCents=(m,k)=>m?.[k+'_dollars']!=null?decimal(m[k+'_dollars'])*100:
 m?.[k]!=null?decimal(m[k]):NaN;
const rejected=reason=>({eligible:false,reason});
export function assessPaperExitQuote(position,market,now=Date.now()){
 if(!position||position.status!=='OPEN'||typeof position.ticker!=='string'||!position.ticker||
    !market||market.ticker!==position.ticker)return rejected('Missing or mismatched open contract');
 if(!['up','down'].includes(position.side))return rejected('Invalid paper position side');
 const qty=Number(position.qty),entryAsk=Number(position.ask),cost=Number(position.cost);
 if(!Number.isSafeInteger(qty)||qty<1||!Number.isFinite(entryAsk)||entryAsk<=0||entryAsk>=100||
    !Number.isFinite(cost)||cost<=0||Math.abs(cost-Math.round(qty*entryAsk)/100)>.031)
  return rejected('Unreconciled paper entry');
 if(!['open','active'].includes(String(market.status||'').toLowerCase()))
  return rejected('Market not open');
 const expiry=Date.parse(market.expected_expiration_time||market.expiration_time||market.close_time||'');
 if(!Number.isFinite(now)||now<=0||!Number.isFinite(expiry)||expiry<=now)
  return rejected('Expired or invalid market expiry');
 const prefix=position.side==='up'?'yes':'no';
 const bid=quoteCents(market,prefix+'_bid'),ask=quoteCents(market,prefix+'_ask');
 if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<=0||ask>=100||
    bid>ask||ask-bid>5)return rejected('Invalid executable bid/ask');
 return {eligible:true,bid,ask,secondsLeft:(expiry-now)/1000,roi:(bid-entryAsk)/entryAsk};
}
