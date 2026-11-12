import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../netlify/functions/kaibot-runner.mjs',import.meta.url),'utf8');
test('Lock diagnostics preserve qualified signal and 75-point threshold',()=>{
 assert.match(src,/mode==='lock'&&\['BUY UP','BUY DOWN'\]\.includes\(signal\.action\)/);
 assert.match(src,/Number\.isFinite\(Number\(signal\.score\)\)/);
 assert.match(src,/LOCK_SCORE_BELOW_75_OR_MISSING/);
 assert.match(src,/requiredScore:75/);
 assert.match(src,/entryPauseReason:entryPaused\?'LOSS_COHORT_CIRCUIT_BREAKER'/);
 assert.match(src,/signalValidation:signal\.validation\?\?null/);
});
