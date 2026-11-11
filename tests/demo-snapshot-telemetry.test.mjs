import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizedDemoSnapshotFailure} from '../src/demo-snapshot-telemetry.mjs';

test('Demo snapshot telemetry records allowlisted HTTP cause and read phase only',()=>{
 const error=Object.assign(new Error('KALSHI_HTTP_429'),{snapshotPhase:'BALANCE',name:'Error'});
 assert.deepEqual(sanitizedDemoSnapshotFailure(error,{durationMs:1432.9,trigger:'worker'}),{
  event:'DEMO_SNAPSHOT_READ_FAILED',phase:'BALANCE',cause:'KALSHI_HTTP_429',
  category:'UNKNOWN',durationMs:1432,trigger:'worker'
 });
});

test('Demo snapshot telemetry classifies network and timeout errors without exposing raw details',()=>{
 for(const [name,expected] of [
  ['TimeoutError','TIMEOUT'],['AbortError','ABORTED'],
  ['SyntaxError','INVALID_JSON'],['TypeError','REQUEST_ERROR'],
  ['SecretCredentialError','UNKNOWN']
 ]){
  const error=Object.assign(new Error('SECRET_PRIVATE_KEY=do-not-log'),{
   name,snapshotPhase:'TOKEN_VALUE',secret:'do-not-log'
  });
  const logged=sanitizedDemoSnapshotFailure(error,{durationMs:-42,trigger:'untrusted'});
  assert.equal(logged.phase,'UNKNOWN');
  assert.equal(logged.cause,'UNVERIFIED_FAILURE_CODE');
  assert.equal(logged.category,expected);
  assert.equal(logged.durationMs,0);
  assert.equal(logged.trigger,'schedule');
  assert.equal(JSON.stringify(logged).includes('do-not-log'),false);
  assert.equal(JSON.stringify(logged).includes('SECRET_PRIVATE_KEY'),false);
 }
});

test('Demo snapshot telemetry never accepts arbitrary phase or cause text',()=>{
 const error={snapshotPhase:'FILLS',message:'INVALID_FILLS',name:'SyntaxError'};
 const logged=sanitizedDemoSnapshotFailure(error,{durationMs:12});
 assert.equal(logged.phase,'FILLS');
 assert.equal(logged.cause,'INVALID_FILLS');
 assert.equal(logged.category,'INVALID_JSON');
 assert.equal(logged.durationMs,12);
 assert.equal(logged.trigger,'schedule');
 assert.equal(sanitizedDemoSnapshotFailure(null,{}).cause,'UNVERIFIED_FAILURE_CODE');
 assert.equal(sanitizedDemoSnapshotFailure(null,{}).durationMs,null);
});
