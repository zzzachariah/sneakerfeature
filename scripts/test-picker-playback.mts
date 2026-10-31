import assert from 'node:assert/strict';
import {nextPlaybackPhase, playbackDuration, type PlaybackPhase} from '../components/onboarding/use-picker-playback';
import type {DemoSnapshot, DemoStage} from '../lib/onboarding/picker-demo-contract';
const snapshot:DemoSnapshot={status:'complete',events:['catalog','shortlist','research','writing'].map((stage,i)=>({stage:stage as DemoStage,id:i,at:'2026-10-31T00:00:00Z',kind:'status'}))};
let phase:PlaybackPhase='request';const path=[];
for(let i=0;i<6;i++){phase=nextPlaybackPhase(phase,snapshot);path.push(phase);}
assert.deepEqual(path,['catalog','shortlist','research','writing','sources','done']);
assert.equal(nextPlaybackPhase('catalog',{status:'running',events:[snapshot.events[0]]}),'catalog');
assert.equal(nextPlaybackPhase('catalog',{status:'complete',events:[snapshot.events[0],snapshot.events[3]]}),'writing');
assert.equal(nextPlaybackPhase('request',{status:'running',events:[]}),'request');
assert.equal(playbackDuration('request',snapshot),5000);
assert.ok(playbackDuration('research',snapshot)>=12000);
assert.ok(playbackDuration('research',{...snapshot,events:[{...snapshot.events[2],query:'long '.repeat(1000)}]})<=22000);
console.log('PASS fast completed snapshots retain every observed stage; missing stages are not invented; reading dwell has bounded long-text allowance.');
