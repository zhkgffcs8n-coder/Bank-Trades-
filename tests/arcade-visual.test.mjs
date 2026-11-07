import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('arcade assets are allowlisted for production and dashboard wired',()=>{
 const build=read('scripts/build.mjs'),dash=read('private/dashboard.html');
 for(const file of ['arcade-theme.css','arcade-crew.js']){assert.ok(build.includes("'"+file+"'"));assert.ok(dash.includes('/'+file))}
});
test('original robot crew is visual only, motion is persistent, and no trade endpoints are called',()=>{
 const js=read('arcade-crew.js');
 for(const name of ['OPTIMUS PRIMAL','OMEGA','KAI BOT','FLIP HUNTER','MARKET GUARDIAN'])assert.ok(js.includes(name));
 assert.ok(js.includes('banktrades:arcade-motion'));
 assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|\.netlify\/functions|submitOrder|placeOrder/);
});
test('arcade honors reduced motion and mobile viewports',()=>{
 const css=read('arcade-theme.css');assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/max-width:700px/);
});

test('arena never claims an order or profit from signal-table changes',()=>{
 const js=read('arcade-crew.js');
 assert.match(js,/btBattleArena/);
 assert.match(js,/not an executed order/);
 assert.match(js,/fill not verified/);
 assert.match(js,/if\(!prior\.has\(asset\)\)/);
 assert.match(js,/state!==priorPaperStatus&&running/);
});
