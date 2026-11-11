import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

test('KaiBot dashboard assets parse as browser scripts',()=>{
 for(const file of ['premium.js','upgrade-status.js','kaibot-command.js']){
  assert.doesNotThrow(()=>new Script(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{filename:file}));
 }
});
