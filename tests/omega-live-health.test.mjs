import test from 'node:test';
import assert from 'node:assert/strict';
import {omegaLiveHealth} from '../netlify/functions/omega-live-health.mjs';
const now=Date.parse('2026-11-05T12:00:00Z');
const heartbeat={completedAt:new Date(now-60000).toISOString(),status:'COMPLETED',sampledAssets:['BTC','ETH','SOL','XRP','DOGE','BNB','HYPE','ZEC'],trainingSucceeded:true};
test('fresh completed collection is distinguished from OMEGA provider operation',()=>{
 const result=omegaLiveHealth(heartbeat,now);
 assert.equal(result.status,'COLLECTOR_FRESH');assert.equal(result.omegaLiveResearchRunning,false);
});
test('stale or incomplete collection cannot be called healthy',()=>{
 assert.equal(omegaLiveHealth({...heartbeat,completedAt:new Date(now-180000).toISOString()},now).status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth({...heartbeat,sampledAssets:['BTC']},now).status,'NOT_VERIFIED');
 assert.equal(omegaLiveHealth(null,now).status,'NOT_VERIFIED');
});

test('collector numeric timestamp',()=>{assert.equal(omegaLiveHealth({...heartbeat,completedAt:now-60000},now).status,'COLLECTOR_FRESH');});
