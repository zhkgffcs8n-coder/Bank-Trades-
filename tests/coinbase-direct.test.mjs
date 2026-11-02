import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../coinbase-direct.js',import.meta.url),'utf8');
test('Coinbase panel is shipped and its exact public endpoints are allowed by CSP',()=>{
 const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
 const policy=readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
 assert.match(build,/['"]coinbase-direct\\.js['"]/);
 assert.match(policy,/connect-src 'self' https:\/\/api\\.exchange\\.coinbase\\.com wss:\/\/advanced-trade-ws\\.coinbase\\.com;/);
});
test('hourly candles cannot masquerade as minute history; rolling levels use completed candles',async()=>{
 const nodes=new Map();
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',listeners:{},
   add(option){if(!this.value)this.value=option.value},
   addEventListener(name,fn){this.listeners[name]=fn},
   getContext(){return {clearRect(){},fillRect(){},beginPath(){},lineTo(){},moveTo(){},stroke(){}}}});
  return nodes.get(id);
 };
 const sockets=[];
 class Socket{constructor(url){this.url=url;sockets.push(this)}send(){}close(){}}
 const rows=Array.from({length:30},(_,i)=>[1700000000+i*3600,99+i,103+i,100+i,101+i,1]);
 runInNewContext(source,{document:{hidden:false,getElementById:get,addEventListener(){}},
  Option:class{constructor(label,value){this.label=label;this.value=value}},
  WebSocket:Socket,fetch:async()=>({ok:true,json:async()=>rows}),
  setInterval(){},setTimeout(){},clearTimeout(){},Date,Number,Map,Intl,console,encodeURIComponent});
 await new Promise(resolve=>setImmediate(resolve));
 const frame=get('cbFrame'),stats=get('cbStats');
 assert.equal(frame.value,'1');
 assert.match(stats.innerHTML,/Support \\(20\\).*?Collecting/);
 assert.match(stats.innerHTML,/Spot.*?Collecting/);
 frame.value='60';frame.listeners.change();
 assert.match(stats.innerHTML,/Support \\(20\\).*?<b>108<\\/b>/);
 assert.match(stats.innerHTML,/Resistance \\(20\\).*?<b>131<\\/b>/);
 assert.equal(sockets.length,1);
 frame.value='1';frame.listeners.change();
 sockets[0].onmessage({data:JSON.stringify({events:[{tickers:[{product_id:'BTC-USD',price:'200',last_size:'1'}]}]})});
 assert.match(stats.innerHTML,/Spot.*?<b>200<\\/b>/);
 assert.match(stats.innerHTML,/Support \\(20\\).*?Collecting/);
});
