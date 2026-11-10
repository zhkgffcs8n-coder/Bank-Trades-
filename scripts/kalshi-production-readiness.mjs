// Publish only access checks. The response's account data stays in memory.
export async function checkKalshiProductionReads(client,clock=Date.now){
 const checkedAt=clock();
 const probe=async(path,valid)=>{
  try{
   const result=await client.request('GET',path);
   return valid(result)?'VERIFIED':'INVALID_RESPONSE';
  }catch(error){
   return /^KALSHI_HTTP_[0-9]{3}$/.test(error?.message)?error.message:'TRANSPORT_OR_SIGNING_ERROR';
  }
 };
 const [balance,orders]=await Promise.all([
  probe('/trade-api/v2/portfolio/balance',value=>Number.isSafeInteger(value?.balance)),
  probe('/trade-api/v2/portfolio/orders?limit=1',value=>Array.isArray(value?.orders))
 ]);
 return {checkedAt,balance,orders};
}
