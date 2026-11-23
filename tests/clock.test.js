import test from 'node:test';
import assert from 'node:assert/strict';
import {StudyClock,torsoFromPose} from '../clock.js';
test('only consecutive confirmed frames credit time; leaving and returning leave real gaps',()=>{
  const c=new StudyClock(0);c.observe(0,true);c.observe(500,true);c.observe(1000,true);c.observe(1500,false);c.observe(2500,false);c.observe(3000,true);c.observe(3500,true);
  assert.equal(c.total,1500);assert.deepEqual(c.segments,[{from:0,to:1000,type:'present'},{from:1000,to:3000,type:'away'},{from:3000,to:3500,type:'present'}]);
});
test('stalled camera, sleeping device and hidden page are never backfilled',()=>{
  const c=new StudyClock(0);c.observe(0,true);c.observe(500,true);c.observe(60000,true);assert.equal(c.total,500);c.observe(60500,true);assert.equal(c.total,1000);c.observe(60700,false);c.observe(70000,true);assert.equal(c.total,1000);c.observe(70500,true);assert.equal(c.total,1500);
});
test('snapshot is conservative and final shutdown cannot create extra study time',()=>{
  const c=new StudyClock(0);c.observe(0,true);c.observe(500,true);assert.equal(c.snapshot(1000).activeMs,500);assert.equal(c.last,500);c.observe(1000,false);assert.equal(c.total,500);const s=c.snapshot(1100);assert.equal(s.segments.reduce((n,s)=>n+s.to-s.from,0),1100);
});
test('no torso or low visibility never counts as a valid upper body',()=>{
  assert.equal(torsoFromPose(null),null);const points=Array.from({length:33},()=>({x:.5,y:.2,visibility:.9}));points[11]={x:.3,y:.55,visibility:.9};points[12]={x:.7,y:.55,visibility:.9};const torso=torsoFromPose(points);assert.ok(torso);assert.equal(torso.x,.5);points[12].visibility=.1;assert.equal(torsoFromPose(points),null);
});
