import test from 'node:test';
import assert from 'node:assert/strict';
import {auditScalpEntry} from '../src/scalp-entry-audit.mjs';

test('keeps first executable quote separate from fills and scores only later depth',()=>{
 const snapshot={ticker:'KXETH15M-TEST',at:1};
 const checks={A:[{side:'DOWN',ask:.56,reason:'INSUFFICIENT_COMPARABLE_ROUNDS'}],B:[],C:[]};
 const audit=auditScalpEntry(null,snapshot,{yes:{price:.44,size:3},no:{price:.54,size:3}},checks,{});
 assert.equal(audit.engines.A.sides.DOWN.firstExecutable.ask,.56);
 assert.equal(audit.engines.A.fill,undefined);
 assert.equal(audit.engines.A.sides.DOWN.bestLaterExit,undefined);
 const later=auditScalpEntry(audit,{...snapshot,at:2},{yes:{price:.08,size:3},no:{price:.904,size:2}},
  {A:[],B:[],C:[]},{});
 assert.ok(Math.abs(later.engines.A.sides.DOWN.bestLaterExit.net-.294)<1e-9);
 assert.equal(later.voltComparison.DOWN[0].unfilledOpportunity.bid,.904);
});

test('best observed opportunity only uses a buy quote from an earlier observation',()=>{
 const snapshot={ticker:'KXETH15M-TEST',at:1};
 const checks={A:[{side:'DOWN',ask:.56,reason:'INSUFFICIENT_COMPARABLE_ROUNDS'}],B:[],C:[]};
 const first=auditScalpEntry(null,snapshot,{yes:{price:.44,size:3},no:{price:.54,size:3}},checks,{});
 const cheap=auditScalpEntry(first,{...snapshot,at:2},{yes:{price:.69,size:3},no:{price:.30,size:3}},checks,{});
 assert.ok(Math.abs(cheap.engines.A.sides.DOWN.bestExecutable.ask-.31)<1e-9);
 assert.equal(cheap.engines.A.sides.DOWN.maximumObserved.entry.at,1);
 const rally=auditScalpEntry(cheap,{...snapshot,at:3},{yes:{price:.08,size:3},no:{price:.904,size:3}},
  {A:[],B:[],C:[]},{});
 assert.equal(rally.engines.A.sides.DOWN.maximumObserved.entry.at,2);
 assert.equal(rally.engines.A.sides.DOWN.firstFivePointMoveAt,3);
});
