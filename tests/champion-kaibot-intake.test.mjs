import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectChampionIntake} from '../src/champion-kaibot-intake.mjs';

test('intake matches a hold only with the same contract and reference state',()=>{
 const now=Date.now(),ticker='KXBTC15M-test';
 const position={ticker,side:'up',entry:60,exit:null};
 const worker={feeds:{kalshiAuthenticated:true},championShadow:{
  mode:'SHADOW_ONLY',ticker,at:now-500,action:'HOLD UP',position,previousReference:position,
  inputs:{ticker,secondsLeft:250,side:'mixed',strong:false,quotes:{up:{ask:61,bid:60}}}
 }};
 assert.equal(inspectChampionIntake(worker,now).status,'SHADOW_PARITY_MATCH');
 assert.equal(inspectChampionIntake(worker,now+10001).status,'STALE_OR_UNAUTHENTICATED');
 worker.championShadow.previousReference=null;
 assert.equal(inspectChampionIntake(worker,now).status,'PARITY_MISMATCH');
});
