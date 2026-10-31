import assert from 'node:assert/strict';
import {nextPlaybackPhase, playbackContentKey, playbackDuration, type PlaybackPhase} from '../components/onboarding/use-picker-playback';
import type {DemoSnapshot, DemoStage} from '../lib/onboarding/picker-demo-contract';
const snapshot:DemoSnapshot={status:'complete',events:['catalog','shortlist','research','writing'].map((stage,i)=>({stage:stage as DemoStage,id:i,at:'2026-10-31T00:00:00Z',kind:'status'}))};
let phase:PlaybackPhase='request';const path=[];
for(let i=0;i<6;i++){phase=nextPlaybackPhase(phase,snapshot);path.push(phase);}
assert.deepEqual(path,['catalog','shortlist','research','writing','sources','done']);
assert.equal(nextPlaybackPhase('catalog',{status:'running',events:[snapshot.events[0]]}),'catalog');
assert.equal(nextPlaybackPhase('catalog',{status:'complete',events:[snapshot.events[0],snapshot.events[3]]}),'writing');
assert.equal(nextPlaybackPhase('request',{status:'running',events:[]}),'request');
assert.equal(playbackDuration(),5000);
assert.equal(playbackContentKey('catalog',snapshot),playbackContentKey('catalog',{...snapshot,events:snapshot.events.map(e=>({...e,at:'2026-10-31T00:01:00Z',id:e.id+10}))}));
assert.notEqual(playbackContentKey('research',snapshot),playbackContentKey('research',{...snapshot,events:[{...snapshot.events[2],query:'Newly arrived evidence'}]}));
console.log('PASS fast completed snapshots retain every observed stage; missing stages are not invented; each fully presented section gets five seconds of reading time.');
