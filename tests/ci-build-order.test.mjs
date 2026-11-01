import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

for(const workflow of ['primal-research.yml','paper-safety.yml']){
 test(`${workflow} builds the public dist before membership security tests`,()=>{
  const path=new URL(`../.github/workflows/${workflow}`,import.meta.url);
  const yaml=readFileSync(fileURLToPath(path),'utf8');
  const build=yaml.indexOf('- run: npm run build');
  const tests=yaml.indexOf('- run: npm test');
  assert.ok(build>=0,'build step must exist');
  assert.ok(tests>=0,'test step must exist');
  assert.ok(build<tests,'build must run before tests because membership.test.mjs inspects dist');
 });
}
