import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../premium.js',import.meta.url),'utf8');
test('side alerts remain nonmodal and do not steal dashboard focus',()=>{
 assert.match(source,/overlay\.setAttribute\('role','status'\)/);
 assert.doesNotMatch(source,/overlay\.setAttribute\('aria-modal','true'\)/);
 assert.doesNotMatch(source,/overlay\.querySelector\('button'\)\.focus\(\)/);
 assert.match(source,/#bankScreenAlert\{position:fixed;right:8px/);
});
test('alerts respect qualified BUY decisions and keep unqualified entries out',()=>{
 assert.match(source,/action==='BUY UP'\?'up':action==='BUY DOWN'\?'down'/);
 assert.match(source,/action==='WAIT'&&quoteFresh&&failures===1/);
 assert.match(source,/STAY OUT · No qualified entry/);
 assert.match(source,/if\(!screenAlertsEnabled\|\|document.hidden\)return/);
});
