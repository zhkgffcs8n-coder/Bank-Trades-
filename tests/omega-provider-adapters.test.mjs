import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaProviderStatus,fetchOmegaResearchForecast,supportedOmegaProviders} from '../src/omega-provider-adapters.mjs';
const base={marketTicker:'BTC-15',roundId:'r1',marketSnapshot:{yesBid:0.4,yesAsk:0.5},nowMs:100000};
test('unconfigured providers never call the network',async()=>{
 let called=false;
 const result=await fetchOmegaResearchForecast({...base,provider:'gpt',env:{},fetchImpl:()=>{called=true;throw Error('unexpected');}});
 assert.equal(result.status,'UNCONFIGURED');assert.equal(called,false);
 assert.equal(omegaProviderStatus({}).filter(x=>x.configured).length,0);
 assert.equal(supportedOmegaProviders.length,9);
});
test('configured provider yields strictly validated research-only forecast',async()=>{
 const result=await fetchOmegaResearchForecast({...base,provider:'gpt',env:{OPENAI_API_KEY:'test'},fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');
  assert.equal(options.headers.authorization,'Bearer test');
  return {ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":0.62}'}}]})};
 }});
 assert.equal(result.status,'RESEARCH_FORECAST');assert.equal(result.upProbability,0.62);assert.equal(result.ordersAuthorized,false);
 assert.equal(JSON.stringify(result).includes('test'),false);
});
test('invalid probabilities are blocked',async()=>{
 const result=await fetchOmegaResearchForecast({...base,provider:'gpt',env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"upProbability":1.5}'}}]})})});
 assert.equal(result.status,'INVALID_RESPONSE');
});
test('provider errors never leak credentials',async()=>{
 const result=await fetchOmegaResearchForecast({...base,provider:'claude',env:{ANTHROPIC_API_KEY:'secret'},fetchImpl:async()=>{throw Error('secret');}});
 assert.equal(result.status,'PROVIDER_UNAVAILABLE');assert.equal(JSON.stringify(result).includes('secret'),false);
});
