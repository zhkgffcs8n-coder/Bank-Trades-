// Legacy Stripe endpoint retained only so old webhook URLs fail closed after the Square migration.
export default async function(){
 return new Response(JSON.stringify({error:'Stripe billing is disabled. BANK TRADES uses Square.'}),{status:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
