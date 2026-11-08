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
