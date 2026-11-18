import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../btc-lock-radar.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const scalpStorageKey='),source.indexOf('const scalpQuotes=new Map();'));
test('refresh preserves original entry and SELL FAST even after price rebounds',()=>{
 let saved='[]';const localStorage={getItem:()=>saved,setItem:(_k,v)=>saved=v};
 const create=()=>runInNewContext(code+'\n({positions,persistScalpPosition})',{localStorage});
 const first=create();
 first.persistScalpPosition('BTC',{ticker:'KXBTC15M-TEST',side:'up',entry:57,exit:'SELL FAST',exitBid:49},{close_time:new Date(Date.now()+60000).toISOString()},60);
 const restored=create().positions.get('BTC');
 assert.equal(restored.entry,57);assert.equal(restored.exitBid,49);assert.equal(restored.exit,'SELL FAST');
});
test('expired and malformed stored calls do not restore',()=>{
 for(const saved of ['broken',JSON.stringify([{coin:'BTC',expiresAt:Date.now()-1,position:{ticker:'KXBTC15M-TEST',side:'up',entry:57,exit:null}}])]){
  const result=runInNewContext(code+'\npositions.size',{localStorage:{getItem:()=>saved}});assert.equal(result,0);
 }
});
