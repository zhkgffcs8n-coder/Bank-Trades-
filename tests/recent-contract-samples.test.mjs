import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recentContractSamples} from '../src/recent-contract-samples.mjs';

const now=Date.parse('2026-10-31T11:00:00Z');
const rec=(ticker,t,yesMid,observedAt=t)=>({ticker,t,yesMid,observedAt});
test('shadow comparison selects only current same-contract snapshots',()=>{
  const rows=[rec('OLD',now-60000,.4),rec('NEW',now-600000,.2),rec('NEW',now+60000,.9),
    rec('NEW',now-120000,.55),rec('NEW',now-60000,.57),rec('NEW',now-180000,.53)];
  const got=recentContractSamples(rows,'NEW',now);
  assert.deepEqual(got.map(r=>r.t),[now-180000,now-120000,now-60000]);
});
test('rejects invalid quotes and duplicate minute buckets',()=>{
  const rows=[rec('NEW',now-60000,.6,now-55000),rec('NEW',now-60000,.65,now-54000),
    rec('NEW',now-120000,NaN),rec('NEW',now-180000,1.2),rec('NEW',now-240000,-.1)];
  assert.equal(recentContractSamples(rows,'NEW',now).length,1);
  assert.equal(recentContractSamples(rows,'NEW',now)[0].yesMid,.65);
  assert.deepEqual(recentContractSamples(null,'NEW',now),[]);
});
test('bounded sorted history avoids selecting stale first blob-list page',()=>{
  const rows=Array.from({length:40},(_,i)=>rec('NEW',now-(40-i)*60000,.4+i*.001));
  const got=recentContractSamples(rows,'NEW',now,8);
  assert.equal(got.length,8);
  assert.equal(got.at(-1).t,now-60000);
  assert.equal(got[0].t,now-480000);
});
test('collector comparison is wired to the rolling snapshot, not old blob listing',()=>{
  const source=readFileSync(new URL('../netlify/functions/market-collector.mjs',import.meta.url),'utf8');
  assert.ok(source.includes('const records=recentContractSamples(recent,m.ticker,now);'));
  assert.ok(!source.includes("prefix:'samples/'+asset+'/',limit:30"));
});

test('future-observed rows cannot leak into a pre-settlement frozen snapshot',()=>{
 const rows=[rec('NEW',now-120000,.40,now-119000),
  rec('NEW',now-60000,.45,now-59000),
  rec('NEW',now-60000,.99,now+1000),
  rec('NEW',now-180000,.35,now+10000)];
 const got=recentContractSamples(rows,'NEW',now);
 assert.deepEqual(got.map(x=>x.yesMid),[.40,.45]);
});

test('collector freezes paired research at actual captured quote time',()=>{
 const source=readFileSync(new URL('../netlify/functions/market-collector.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('pairedShadow(m,sameContract,record.observedAt)'));
 assert.ok(source.includes('recentContractSamples(recent,m.ticker,record.observedAt)'));
});
