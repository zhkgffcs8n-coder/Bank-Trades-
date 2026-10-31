import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('paper entry and bid exit preserve cash accounting and prevent closing twice',async()=>{
 class Element{
  constructor(){this.children=[];this.events={};this.value='';this._text='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  addEventListener(type,fn){this.events[type]=fn;}
  set textContent(v){this._text=v;this.children=[];}get textContent(){return this._text;}
 }
 const els=Object.fromEntries(['paperSummary','paperLedger','paperAsset','paperSide','paperQty','paperBuy','paperReset'].map(id=>[id,new Element()]));
 els.paperAsset.value='BTC';els.paperSide.value='up';els.paperQty.value='2';
 const memory=new Map(),windowEvents={},alerts=[];let locks=0;
 const market={ticker:'KXBTC15M-TEST',expires_at:new Date(Date.now()+600000).toISOString(),yes_ask_dollars:'0.4500',yes_bid_dollars:'0.4300'};
 const context=vm.createContext({document:{getElementById:id=>els[id],createElement:()=>new Element()},window:{__BANK_TRADES_USER_ID__:'tester',addEventListener:(type,fn)=>windowEvents[type]=fn,dispatchEvent:e=>windowEvents[e.type]?.(e)},Event:class{constructor(type){this.type=type;}},navigator:{locks:{request:async(key,fn)=>{locks++;return fn();}}},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},fetch:async()=>({ok:true,json:async()=>({fetched_at:new Date().toISOString(),results:[{asset:'BTC',market}]})}),AbortController,setTimeout,clearTimeout,setInterval:()=>0,alert:m=>alerts.push(m),confirm:()=>true,Date,Number,Math,JSON});
 const html=readFileSync('private/dashboard.html','utf8');const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes("const KEY='banktrades.paper.v2.'"));
 assert.ok(script);new vm.Script(script).runInContext(context);
 await els.paperBuy.events.click();
 let book=JSON.parse(memory.get('banktrades.paper.v2.tester'));assert.equal(book.cash,999.1);assert.equal(book.trades.length,1);assert.equal(book.trades[0].status,'OPEN');assert.match(els.paperSummary.textContent,/Open paper positions 1/);
 const close=els.paperLedger.children[0].children.find(e=>e.textContent==='SIMULATE SELL AT BID');assert.ok(close);
 await close.onclick();
 book=JSON.parse(memory.get('banktrades.paper.v2.tester'));assert.equal(book.cash,999.96);assert.equal(book.trades[0].status,'CLOSED');assert.ok(Math.abs(book.trades[0].pnl+.04)<1e-8);
 await close.onclick();assert.equal(JSON.parse(memory.get('banktrades.paper.v2.tester')).cash,999.96);assert.ok(alerts.includes('Position is already closed.'));assert.ok(locks>=3);
});
