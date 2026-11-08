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

test('Claude text blocks can follow non-text blocks without accepting malformed probabilities',async()=>{
 const result=await fetchOmegaResearchForecast({...base,provider:'claude',env:{ANTHROPIC_API_KEY:'secret'},fetchImpl:async()=>({ok:true,json:async()=>({content:[{type:'thinking',thinking:'hidden'},{type:'text',text:'{"upProbability":0.52}'}]})})});
 assert.equal(result.status,'RESEARCH_FORECAST');assert.equal(result.upProbability,.52);
});
test('Gemini credentials stay out of URLs and recognized API failure reasons are reported',async()=>{
 const result=await fetchOmegaResearchForecast({...base,provider:'gemini',env:{GEMINI_API_KEY:'secret'},fetchImpl:async(url,opts)=>{
  assert.ok(!url.includes('secret'));assert.equal(opts.headers['x-goog-api-key'],'secret');
  return {ok:false,status:400,json:async()=>({error:{code:400,status:'INVALID_ARGUMENT',message:'secret',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'API_KEY_INVALID'}]}})};
 }});
 assert.equal(result.errorCode,'API_KEY_INVALID');assert.ok(!JSON.stringify(result).includes('secret'));
});

test('Claude requests structured forecasts and rejects refusal or truncated responses',async()=>{
 for(const [reason,errorCode] of [['refusal','CLAUDE_REFUSAL'],['max_tokens','CLAUDE_TRUNCATED'],['end_turn',null]]){
  const result=await fetchOmegaResearchForecast({...base,provider:'claude',env:{ANTHROPIC_API_KEY:'test'},fetchImpl:async(url,options)=>{
   const format=JSON.parse(options.body).output_config.format;
   assert.equal(format.type,'json_schema');
   assert.deepEqual(format.schema.required,['upProbability']);
   return {ok:true,json:async()=>({stop_reason:reason,content:[{type:'text',text:'{"upProbability":0.62}'}]})};
  }});
  assert.equal(result.status,errorCode?'INVALID_RESPONSE':'RESEARCH_FORECAST');
  assert.equal(result.errorCode,errorCode??undefined);
 }
});
