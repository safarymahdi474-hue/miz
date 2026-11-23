import test from 'node:test';
import assert from 'node:assert/strict';
import {requestStudyCamera,manualClock} from '../camera-mode.js';
import {StudyClock} from '../clock.js';
test('a device without a camera API can continue manually',async()=>{const result=await requestStudyCamera(undefined);assert.equal(result.stream,null);assert.match(result.message,/بدون دوربین/)});
for(const name of ['NotFoundError','NotAllowedError','NotReadableError','OverconstrainedError'])test(`camera ${name} does not end study preparation`,async()=>{const result=await requestStudyCamera({getUserMedia:async()=>{throw Object.assign(new Error('device'),{name})}});assert.equal(result.stream,null);assert.match(result.message,/بدون دوربین/)});
test('a working camera is used without requesting microphone access',async()=>{let options;const stream={getTracks:()=>[]};const result=await requestStudyCamera({getUserMedia:async arg=>{options=arg;return stream}});assert.equal(result.stream,stream);assert.equal(options.audio,false)});
test('camera to manual handover preserves credited time and leaves the missing interval empty',()=>{const clock=new StudyClock(0);clock.observe(0,true);clock.observe(1000,true);const continued=manualClock(clock,4000);assert.equal(continued,clock);assert.equal(continued.snapshot(4000).activeMs,1000);continued.observe(5000,true);assert.equal(continued.snapshot(5000).activeMs,2000);assert.ok(continued.snapshot(5000).segments.some(s=>s.from===1000&&s.to===4000&&s.type==='away'))});
