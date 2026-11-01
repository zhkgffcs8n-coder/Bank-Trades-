import test from 'node:test';
import assert from 'node:assert/strict';
import {compareValidationWindows,initialModel,learn,learningReport,modelValidated} from '../src/research-model.mjs';

test('unverified candidate cannot be promoted',()=>{
 const result=compareValidationWindows({count:99,brier:10},{count:100,brier:20});
 assert.equal(result.eligible,false);
});
test('candidate needs material improvement on same-sized prospective windows',()=>{
 assert.equal(compareValidationWindows({count:100,brier:18},{count:100,brier:20}).eligible,true);
 assert.equal(compareValidationWindows({count:100,brier:19.9},{count:100,brier:20}).eligible,false);
});
test('a worse candidate is rejected',()=>{
 assert.equal(compareValidationWindows({count:100,brier:22},{count:100,brier:20}).eligible,false);
});
test('learning evaluates recorded prediction before updating weights',()=>{
 const model=initialModel();
 const next=learn(model,{features:[1,0,0,0],prediction:.8,baseline:.6},0);
 assert.equal(model.count,0);
 assert.equal(next.count,1);
 assert.ok(Math.abs(next.brier-.64)<1e-12);
 assert.ok(Math.abs(next.baselineBrier-.36)<1e-12);
 assert.equal(modelValidated(next),false);
 assert.equal(learningReport(next).validated,false);
});
test('invalid validation scores never pass',()=>{
 assert.equal(compareValidationWindows({count:100,brier:NaN},{count:100,brier:20}).eligible,false);
 assert.equal(compareValidationWindows({count:100,brier:-1},{count:100,brier:20}).eligible,false);
});
