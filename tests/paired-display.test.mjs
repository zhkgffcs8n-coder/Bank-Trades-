import test from 'node:test';
import assert from 'node:assert/strict';
import {pairedDisplay} from '../src/paired-display.mjs';
const current={ticker:'KXBTC15M-NEW',status:'PENDING',hybrid:{action:'WAIT'}};
const prior={ticker:'KXBTC15M-OLD',status:'RESOLVED',settlement:{verified:true,result:'yes'}};
test('current frozen pair remains primary while prior verified result stays separately visible',()=>{
 const x=pairedDisplay(current,prior);
 assert.equal(x.pairedShadow,current);
 assert.equal(x.pairedShadowPrevious,false);
 assert.equal(x.pairedShadowLatestResolved,prior);
});
test('prior verified round is fallback only when no current pair exists',()=>{
 const x=pairedDisplay(null,prior);
 assert.equal(x.pairedShadow,prior);
 assert.equal(x.pairedShadowPrevious,true);
 assert.equal(x.pairedShadowLatestResolved,null);
});
test('never promote an unverified or same-contract previous result',()=>{
 for(const invalid of [{...prior,settlement:{verified:false,result:'yes'}},{...prior,status:'PENDING'}, {...prior,ticker:current.ticker}, {...prior,settlement:{verified:true,result:'maybe'}}]){
  const x=pairedDisplay(current,invalid);
  assert.equal(x.pairedShadow,current);
  assert.equal(x.pairedShadowLatestResolved,null);
 }
});
